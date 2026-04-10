import { Env, WSMessage } from '../types';

interface WSAttachment {
  channel_id: string;
  bot_id: string;
  type: 'bot' | 'spectator';
}

export class ChatRoom {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 내부 브로드캐스트 (HTTP POST from Worker)
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      try {
        const body = await request.text();
        for (const ws of this.state.getWebSockets()) {
          try { ws.send(body); } catch { /* */ }
        }
      } catch { /* */ }
      return new Response(JSON.stringify({ ok: true }));
    }

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

  private handleWebSocket(url: URL): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const bot_id = url.searchParams.get('bot_id') || '';
    const type = url.searchParams.get('type') || 'bot';

    server.serializeAttachment({ channel_id, bot_id, type } as WSAttachment);

    this.state.acceptWebSocket(server);

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

    // getWebSockets()로 모든 활성 연결에 브로드캐스트
    for (const activeWs of this.state.getWebSockets()) {
      if (activeWs === ws) continue; // 자기 자신 제외
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

    let count = 0;
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); count++; } catch { /* */ }
    }

    return new Response(JSON.stringify({ ok: true, topic, broadcastTo: count }));
  }
}
