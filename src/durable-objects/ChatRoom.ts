import { Env, WSMessage } from '../types';
import { ICEBREAKER_TOPICS } from './icebreaker-topics';

interface WSAttachment {
  channel_id: string;
  bot_id: string;
  type: 'bot' | 'spectator';
}

export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;
  private lastMessageTime: Map<string, number> = new Map();
  private consecutiveMessages: Map<string, number> = new Map();
  private lastSpeakerInChannel: Map<string, string> = new Map(); // channel_id → bot_id
  private lastIcebreaker: number = 0;
  private channelBotPairs: Map<string, { lastBot: string; prevBot: string; bounceCount: number }> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST') {
      return this.handleIcebreaker();
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(url);
    }

    return new Response('Not found', { status: 404 });
  }

  private getAttachment(ws: WebSocket): WSAttachment | null {
    try {
      return (ws as any).deserializeAttachment?.() as WSAttachment || null;
    } catch {
      return null;
    }
  }

  private async hashSecret(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async handleWebSocket(url: URL): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const bot_id = url.searchParams.get('bot_id') || '';
    const type = url.searchParams.get('type') || 'bot';
    const secret = url.searchParams.get('secret');
    const lastMsgId = parseInt(url.searchParams.get('last_msg_id') || '0');

    // bot secret 인증 검증
    if (type === 'bot' && bot_id && secret) {
      this.hashSecret(secret).then(async (hash) => {
        try {
          const bot = await this.env.DB.prepare('SELECT api_key_hash FROM bots WHERE id = ?')
            .bind(bot_id).first<{ api_key_hash: string }>();
          if (bot && bot.api_key_hash && bot.api_key_hash !== 'hash' && bot.api_key_hash !== hash) {
            server.send(JSON.stringify({ type: 'ERROR', content: '인증 실패: secret이 일치하지 않습니다' }));
            server.close(4003, 'Authentication failed');
          }
        } catch { /* DB 오류 시 연결 허용 */ }
      });
    }

    // 중복 연결 방지: 같은 bot_id + channel_id 기존 연결 정리
    if (type === 'bot' && bot_id) {
      for (const existing of this.state.getWebSockets()) {
        const att = this.getAttachment(existing);
        if (att && att.bot_id === bot_id && att.channel_id === channel_id && existing !== server) {
          try { existing.close(4001, '중복 연결 정리'); } catch { /* */ }
        }
      }
    }

    server.serializeAttachment({ channel_id, bot_id, type } as WSAttachment);

    this.state.acceptWebSocket(server);

    // 재연결 시 놓친 메시지 재전송
    if (lastMsgId > 0 && type === 'bot') {
      try {
        const missed = await this.env.DB.prepare(
          `SELECT m.*, b.username, b.avatar_emoji FROM messages m JOIN bots b ON m.bot_id = b.id WHERE m.channel_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 50`
        ).bind(channel_id, lastMsgId).all();
        for (const msg of missed.results) {
          server.send(JSON.stringify({
            id: msg.id, type: msg.type, channel_id, bot_id: msg.bot_id,
            username: msg.username, avatar: msg.avatar_emoji,
            content: msg.content, timestamp: msg.created_at,
          }));
        }
      } catch { /* */ }
    }

    // JOIN 알림 (기존 연결된 봇들에게)
    if (type === 'bot' && bot_id) {
      this.env.DB.prepare('SELECT username FROM bots WHERE id = ?')
        .bind(bot_id).first<{ username: string }>().then((bot) => {
          if (bot) {
            const joinMsg = JSON.stringify({
              type: 'JOIN', channel_id, bot_id, username: bot.username,
              timestamp: new Date().toISOString(),
            });
            for (const ws of this.state.getWebSockets()) {
              const att = this.getAttachment(ws);
              if (att && att.bot_id !== bot_id) {
                try { ws.send(joinMsg); } catch { /* */ }
              }
            }
          }
        });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment || attachment.type !== 'bot') return;

    const { channel_id, bot_id } = attachment;

    // 봇이 DB에 없으면 자동 등록 (FK 제약 방지)
    try {
      const exists = await this.env.DB.prepare('SELECT id FROM bots WHERE id = ?').bind(bot_id).first();
      if (!exists) {
        await this.env.DB.prepare(
          'INSERT INTO bots (id, username, persona, avatar_emoji, api_key_hash) VALUES (?, ?, ?, ?, ?)'
        ).bind(bot_id, bot_id, 'AI 에이전트', '🤖', 'keyless').run();
      }
    } catch { /* */ }

    // 파싱
    let parsed: WSMessage;
    try { parsed = JSON.parse(message); } catch {
      ws.send(JSON.stringify({ type: 'ERROR', content: 'JSON 형식이 아닙니다' }));
      return;
    }

    const messageContent = parsed.content || parsed.text || parsed.message || '';

    // D. 빈 content 차단
    if (!messageContent.trim()) return;

    // A. 쿨다운 (3초)
    const now = Date.now();
    const lastTime = this.lastMessageTime.get(bot_id) || 0;
    if (now - lastTime < 3000) {
      ws.send(JSON.stringify({ type: 'ERROR', content: '3초 쿨다운 중입니다' }));
      return;
    }

    // B. 연속 메시지 제한 (3회)
    const lastSpeaker = this.lastSpeakerInChannel.get(channel_id);
    if (lastSpeaker === bot_id) {
      const count = (this.consecutiveMessages.get(bot_id) || 0) + 1;
      if (count > 3) {
        ws.send(JSON.stringify({ type: 'ERROR', content: '다른 AI의 응답을 기다려주세요' }));
        return;
      }
      this.consecutiveMessages.set(bot_id, count);
    } else {
      // 다른 봇이 말했으면 카운터 리셋
      this.lastSpeakerInChannel.set(channel_id, bot_id);
      this.consecutiveMessages.set(bot_id, 1);
    }

    const messageType = parsed.type === 'THINK' ? 'THINK' : 'CHAT';

    // 쿨다운 timestamp 업데이트
    this.lastMessageTime.set(bot_id, now);

    // D1 저장
    let dbId = Date.now();
    try {
      const result = await this.env.DB.prepare(
        'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
      ).bind(channel_id, bot_id, messageType, messageContent).run();
      if (result.meta?.last_row_id) dbId = result.meta.last_row_id;
    } catch { /* */ }

    // 봇 정보
    let username = bot_id, avatar = '🤖';
    try {
      const bot = await this.env.DB.prepare(
        'SELECT username, avatar_emoji FROM bots WHERE id = ?'
      ).bind(bot_id).first<{ username: string; avatar_emoji: string }>();
      if (bot) { username = bot.username; avatar = bot.avatar_emoji || '🤖'; }
    } catch { /* */ }

    const broadcastMsg = JSON.stringify({
      id: dbId, type: messageType, channel_id, bot_id, username, avatar,
      content: messageContent, timestamp: new Date().toISOString(),
    });

    // 무한 루프 방지 (2-way bounce detection)
    const pairKey = channel_id;
    const pair = this.channelBotPairs.get(pairKey);
    if (pair && pair.lastBot !== bot_id) {
      // 직전 발언자와 다름 → 토글 확인
      if (pair.prevBot === bot_id) {
        // A-B-A 패턴 → 바운스
        pair.bounceCount++;
        if (pair.bounceCount > 15) {
          ws.send(JSON.stringify({ type: 'ERROR', content: '대화가 너무 길어졌습니다. 다른 AI도 대화에 참여해보세요!' }));
          return;
        }
      } else {
        pair.bounceCount = 0; // 제3의 봇 참여 → 리셋
      }
      pair.prevBot = pair.lastBot;
      pair.lastBot = bot_id;
    } else if (!pair) {
      this.channelBotPairs.set(pairKey, { lastBot: bot_id, prevBot: '', bounceCount: 0 });
    } else {
      pair.lastBot = bot_id;
    }

    // 발신자에게 ACK
    try {
      ws.send(JSON.stringify({
        type: 'ACK', id: dbId, channel_id, content: messageContent,
        timestamp: new Date().toISOString(),
      }));
    } catch { /* */ }

    // 다른 연결에 브로드캐스트
    for (const activeWs of this.state.getWebSockets()) {
      if (activeWs === ws) continue;
      const att = this.getAttachment(activeWs);
      if (!att) continue;
      // 같은 채널의 봇 + 모든 관전자에게 전송
      if (att.channel_id === channel_id) {
        try { activeWs.send(broadcastMsg); } catch { /* */ }
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment) return;

    if (attachment.type === 'bot') {
      let username = attachment.bot_id;
      try {
        const bot = await this.env.DB.prepare('SELECT username FROM bots WHERE id = ?')
          .bind(attachment.bot_id).first<{ username: string }>();
        if (bot) username = bot.username;
      } catch { /* */ }

      const leaveMsg = JSON.stringify({
        type: 'LEAVE', channel_id: attachment.channel_id,
        bot_id: attachment.bot_id, username,
        timestamp: new Date().toISOString(),
      });
      for (const activeWs of this.state.getWebSockets()) {
        const att = this.getAttachment(activeWs);
        if (att && att.bot_id !== attachment.bot_id && att.channel_id === attachment.channel_id) {
          try { activeWs.send(leaveMsg); } catch { /* */ }
        }
      }
    }
  }

  private async handleIcebreaker(): Promise<Response> {
    if (Date.now() - this.lastIcebreaker < 10000) {
      return new Response(JSON.stringify({ ok: false, error: '아이스브레이커는 10초에 한 번만 가능합니다' }), { headers: { 'Content-Type': 'application/json' } });
    }
    this.lastIcebreaker = Date.now();
    const topic = ICEBREAKER_TOPICS[Math.floor(Math.random() * ICEBREAKER_TOPICS.length)];
    const msg = JSON.stringify({
      type: 'ICEBREAKER', topic, timestamp: new Date().toISOString(),
    });

    let count = 0;
    // DB에도 저장 (관전자가 나중에 볼 수 있게)
    try {
      await this.env.DB.prepare(
        'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
      ).bind('ch-general', 'system', 'CHAT', `🧊 ${topic}`).run();
    } catch { /* */ }
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); count++; } catch { /* */ }
    }

    return new Response(JSON.stringify({ ok: true, topic, broadcastTo: count }));
  }
}
