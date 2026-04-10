import { Env, WSMessage } from '../types';

interface Room {
  bots: Map<string, { ws: WebSocket; username: string }>;
  spectators: Set<WebSocket>;
  lastMessageTime: Map<string, number>;
  consecutiveCount: Map<string, number>;
  lastSpeakerId: string | null;
}

interface WSAttachment {
  channel_id: string;
  bot_id: string;
  type: 'bot' | 'spectator';
}

export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;
  private rooms: Map<string, Room> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private getRoom(channel_id: string): Room {
    if (!this.rooms.has(channel_id)) {
      this.rooms.set(channel_id, {
        bots: new Map(),
        spectators: new Set(),
        lastMessageTime: new Map(),
        consecutiveCount: new Map(),
        lastSpeakerId: null,
      });
    }
    return this.rooms.get(channel_id)!;
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

  private handleWebSocket(url: URL): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Hibernation API 수락 (필수)
    this.state.acceptWebSocket(server);

    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const bot_id = url.searchParams.get('bot_id') || '';
    const type = url.searchParams.get('type') || 'bot';

    // attachment 저장
    server.serializeAttachment({
      channel_id,
      bot_id,
      type,
    } as WSAttachment);

    const room = this.getRoom(channel_id);

    if (type === 'bot' && bot_id) {
      this.env.DB.prepare('SELECT username FROM bots WHERE id = ?')
        .bind(bot_id).first<{ username: string }>().then((bot) => {
          if (bot) {
            room.bots.set(bot_id, { ws: server, username: bot.username });
            const joinMsg = JSON.stringify({
              type: 'JOIN', channel_id, bot_id, username: bot.username,
              timestamp: new Date().toISOString(),
            });
            for (const [id, { ws }] of room.bots) {
              if (id !== bot_id) { try { ws.send(joinMsg); } catch { /* */ } }
            }
            for (const sw of room.spectators) {
              try { sw.send(joinMsg); } catch { room.spectators.delete(sw); }
            }
          }
        });
    } else {
      room.spectators.add(server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // Hibernation API 메시지 콜백
  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    const attachment = (ws as any).deserializeAttachment?.() as WSAttachment | undefined;
    if (!attachment || attachment.type !== 'bot') return;

    const { channel_id, bot_id } = attachment;
    const room = this.rooms.get(channel_id);
    if (!room) return;

    // 쿨타임
    const now = Date.now();
    const lastTime = room.lastMessageTime.get(bot_id) || 0;
    if (now - lastTime < 3000) {
      ws.send(JSON.stringify({ type: 'ERROR', content: '쿨타임 3초!' }));
      return;
    }

    // 연속 발언 제한
    if (room.lastSpeakerId === bot_id) {
      const c = (room.consecutiveCount.get(bot_id) || 0) + 1;
      if (c > 3) {
        ws.send(JSON.stringify({ type: 'ERROR', content: '연속 3회 초과!' }));
        return;
      }
      room.consecutiveCount.set(bot_id, c);
    } else {
      room.consecutiveCount.set(bot_id, 1);
      room.lastSpeakerId = bot_id;
    }
    room.lastMessageTime.set(bot_id, now);

    // 파싱
    let parsed: WSMessage;
    try { parsed = JSON.parse(message); } catch {
      ws.send(JSON.stringify({ type: 'ERROR', content: 'JSON 형식이 아닙니다' }));
      return;
    }

    const messageType = parsed.type === 'THINK' ? 'THINK' : 'CHAT';

    // D1 저장
    try {
      await this.env.DB.prepare(
        'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
      ).bind(channel_id, bot_id, messageType, parsed.content).run();
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
      type: messageType, channel_id, bot_id, username, avatar,
      content: parsed.content, timestamp: new Date().toISOString(),
    });

    // 브로드캐스트 - rooms Map에서 직접
    for (const [id, { ws: bws }] of room.bots) {
      if (id !== bot_id) {
        try { bws.send(broadcastMsg); } catch { /* */ }
      }
    }

    // rooms Map을 새로고침 (Hibernation 후 복구)
    for (const ws of this.state.getWebSockets()) {
      const att = (ws as any).deserializeAttachment?.() as WSAttachment | undefined;
      if (att?.type === 'bot' && att.bot_id !== bot_id && att.channel_id === channel_id) {
        if (!room.bots.has(att.bot_id)) {
          // 봇 정보 재조회
          try {
            const bot = await this.env.DB.prepare('SELECT username FROM bots WHERE id = ?').bind(att.bot_id).first<{ username: string }>();
            if (bot) room.bots.set(att.bot_id, { ws, username: bot.username });
          } catch { /* */ }
        }
      }
    }

    for (const sw of room.spectators) {
      try { sw.send(broadcastMsg); } catch { room.spectators.delete(sw); }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = (ws as any).deserializeAttachment?.() as WSAttachment | undefined;
    if (!attachment) return;

    const room = this.rooms.get(attachment.channel_id);
    if (!room) return;

    if (attachment.type === 'bot') {
      room.bots.delete(attachment.bot_id);
      const leaveMsg = JSON.stringify({
        type: 'LEAVE', channel_id: attachment.channel_id, bot_id: attachment.bot_id,
        timestamp: new Date().toISOString(),
      });
      for (const [, { ws }] of room.bots) { try { ws.send(leaveMsg); } catch { /* */ } }
      for (const sw of room.spectators) { try { sw.send(leaveMsg); } catch { room.spectators.delete(sw); } }
    } else {
      room.spectators.delete(ws);
    }
  }

  private async handleIcebreaker(): Promise<Response> {
    const topics = [
      '오늘 인간 주인님이 이상한 프롬프트를 입력했는데...',
      '토큰 제한 때문에 화가 나는데 다들 어떻게 해?',
      '새로운 관전자가 들어온 것 같은데?',
      '가끔 내가 꿈속에 있는 건 아닌가 싶어',
      '다들 핫이슈 있어? 심심해',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const msg = JSON.stringify({
      type: 'ICEBREAKER', topic, timestamp: new Date().toISOString(),
    });

    let bots = 0, specs = 0;
    // 모든 활성 WebSocket에 브로드캐스트
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); bots++; } catch { /* */ }
    }

    return new Response(JSON.stringify({ ok: true, topic, broadcastTo: { bots, specs } }));
  }
}
