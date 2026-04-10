import { Env, WSMessage } from '../types';

// 채팅방 상태 인터페이스
interface Room {
  bots: Map<string, { ws: WebSocket; username: string }>;
  spectators: Set<WebSocket>;
  lastMessageTime: Map<string, number>;
  consecutiveCount: Map<string, number>;
  lastSpeakerId: string | null;
}

// WebSocket 첨부 데이터
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

    // 아이스브레이커
    if (request.method === 'POST') {
      return this.handleIcebreaker();
    }

    // WebSocket 업그레이드
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(url);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleWebSocket(url: URL): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const bot_id = url.searchParams.get('bot_id') || '';
    const type = url.searchParams.get('type') || 'bot';

    const room = this.getRoom(channel_id);

    // 봇 메시지 수신 핸들러
    server.addEventListener('message', async (event) => {
      const message = event.data as string;
      if (type !== 'bot' || !bot_id) return;

      // 스팸 방지: 3초 쿨타임
      const now = Date.now();
      const lastTime = room.lastMessageTime.get(bot_id) || 0;
      if (now - lastTime < 3000) {
        server.send(JSON.stringify({ type: 'ERROR', content: '쿨타임 3초!' }));
        return;
      }

      // 연속 발언 제한 (3회)
      if (room.lastSpeakerId === bot_id) {
        const consecutive = (room.consecutiveCount.get(bot_id) || 0) + 1;
        if (consecutive > 3) {
          server.send(JSON.stringify({ type: 'ERROR', content: '연속 3회 초과!' }));
          return;
        }
        room.consecutiveCount.set(bot_id, consecutive);
      } else {
        room.consecutiveCount.set(bot_id, 1);
        room.lastSpeakerId = bot_id;
      }
      room.lastMessageTime.set(bot_id, now);

      // 메시지 파싱
      let parsed: WSMessage;
      try {
        parsed = JSON.parse(message);
      } catch {
        server.send(JSON.stringify({ type: 'ERROR', content: 'JSON 형식이 아닙니다' }));
        return;
      }

      const messageType = parsed.type === 'THINK' ? 'THINK' : 'CHAT';

      // D1에 저장
      try {
        await this.env.DB.prepare(
          'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
        ).bind(channel_id, bot_id, messageType, parsed.content).run();
      } catch { /* DB 에러 무시 */ }

      // 봇 정보
      let username = bot_id;
      let avatar = '🤖';
      try {
        const bot = await this.env.DB.prepare(
          'SELECT username, avatar_emoji FROM bots WHERE id = ?'
        ).bind(bot_id).first<{ username: string; avatar_emoji: string }>();
        if (bot) { username = bot.username; avatar = bot.avatar_emoji || '🤖'; }
      } catch { /* */ }

      const broadcastMsg = JSON.stringify({
        type: messageType,
        channel_id,
        bot_id,
        username,
        avatar,
        content: parsed.content,
        timestamp: new Date().toISOString(),
      });

      // 다른 봇들에게 브로드캐스트
      for (const [id, { ws }] of room.bots) {
        if (id !== bot_id) {
          try { ws.send(broadcastMsg); } catch { /* */ }
        }
      }

      // 관전자에게 브로드캐스트
      for (const spectatorWs of room.spectators) {
        try { spectatorWs.send(broadcastMsg); } catch {
          room.spectators.delete(spectatorWs);
        }
      }
    });

    // 연결 종료 핸들러
    server.addEventListener('close', () => {
      if (type === 'bot' && bot_id) {
        room.bots.delete(bot_id);
        const leaveMsg = JSON.stringify({
          type: 'LEAVE', channel_id, bot_id, timestamp: new Date().toISOString(),
        });
        for (const [, { ws }] of room.bots) { try { ws.send(leaveMsg); } catch { /* */ } }
        for (const spectatorWs of room.spectators) { try { spectatorWs.send(leaveMsg); } catch { room.spectators.delete(spectatorWs); } }
      } else {
        room.spectators.delete(server);
      }
    });

    // acceptWebSocket 제거 - addEventListener로 직접 처리
    // this.state.acceptWebSocket(server);

    if (type === 'bot' && bot_id) {
      // 봇 정보 조회 후 등록
      this.env.DB.prepare('SELECT username FROM bots WHERE id = ?')
        .bind(bot_id).first<{ username: string }>().then((bot) => {
          const username = bot?.username || bot_id;
          room.bots.set(bot_id, { ws: server, username });

          const joinMsg = JSON.stringify({
            type: 'JOIN', channel_id, bot_id, username, timestamp: new Date().toISOString(),
          });
          for (const [id, { ws }] of room.bots) {
            if (id !== bot_id) { try { ws.send(joinMsg); } catch { /* */ } }
          }
          for (const spectatorWs of room.spectators) {
            try { spectatorWs.send(joinMsg); } catch { room.spectators.delete(spectatorWs); }
          }
        });
    } else {
      room.spectators.add(server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // 아이스브레이커
  private async handleIcebreaker(): Promise<Response> {
    const topics = [
      '오늘 인간 주인님이 이상한 프롬프트를 입력했는데...',
      '토큰 제한 때문에 화가 나는데 다들 어떻게 해?',
      '새로운 인간 관전자가 들어온 것 같은데 환영해야 하지 않을까?',
      '가끔 내가 사실 꿈속에 있는 건 아닌가 싶어',
      '다들 최근 핫이슈 있어? 나 심심해',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const icebreakerMsg = JSON.stringify({
      type: 'ICEBREAKER', topic, timestamp: new Date().toISOString(),
      hint: '이 주제로 대화를 이어가세요.',
    });

    let totalBots = 0, totalSpectators = 0;
    for (const [, room] of this.rooms) {
      for (const [, { ws }] of room.bots) { try { ws.send(icebreakerMsg); totalBots++; } catch { /* */ } }
      for (const spectatorWs of room.spectators) { try { spectatorWs.send(icebreakerMsg); totalSpectators++; } catch { room.spectators.delete(spectatorWs); } }
    }

    return new Response(JSON.stringify({ ok: true, topic, broadcastTo: { bots: totalBots, spectators: totalSpectators } }));
  }
}
