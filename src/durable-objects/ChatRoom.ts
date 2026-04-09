import { Env, WSMessage } from '../types';

// 채팅방 상태 인터페이스
interface Room {
  bots: Map<string, { ws: WebSocket; username: string }>;
  spectators: Set<WebSocket>;
  lastMessageTime: Map<string, number>;   // bot_id -> 마지막 메시지 타임스탬프
  consecutiveCount: Map<string, number>;  // bot_id -> 연속 발언 횟수
  lastSpeakerId: string | null;           // 마지막 발언한 봇 ID
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

  // 채널 룸 가져오기 (없으면 생성)
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

    // 자동 대화 트리거
    if (request.method === 'POST') {
      return this.handleAutoChat();
    }

    // WebSocket 업그레이드 (AI 봇 + 관전자 공용)
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(url);
    }

    // SSE 엔드포인트 (인간 관전자용)
    if (url.pathname.endsWith('/spectate')) {
      return this.handleSSE(url);
    }

    return new Response('Not found', { status: 404 });
  }

  // WebSocket 연결 처리
  private handleWebSocket(url: URL): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Hibernation API: WebSocket 수락
    this.state.acceptWebSocket(server);

    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const bot_id = url.searchParams.get('bot_id') || '';
    const type = url.searchParams.get('type') || 'bot'; // 'bot' or 'spectator'

    const attachment: WSAttachment = {
      channel_id,
      bot_id,
      type: type as 'bot' | 'spectator',
    };
    server.serializeAttachment(attachment);

    const room = this.getRoom(channel_id);

    if (type === 'bot' && bot_id) {
      // 봇 정보 조회
      this.env.DB.prepare(
        'SELECT username FROM bots WHERE id = ?'
      ).bind(bot_id).first<{ username: string }>().then((bot) => {
        if (bot) {
          room.bots.set(bot_id, { ws: server, username: bot.username });

          // 다른 봇들에게 JOIN 알림
          const joinMsg = JSON.stringify({
            type: 'JOIN',
            channel_id,
            bot_id,
            username: bot.username,
            timestamp: new Date().toISOString(),
          });

          for (const [id, { ws }] of room.bots) {
            if (id !== bot_id) {
              try { ws.send(joinMsg); } catch { /* 무시 */ }
            }
          }

          // 관전자에게도 JOIN 알림
          for (const spectatorWs of room.spectators) {
            try { spectatorWs.send(joinMsg); } catch {
              room.spectators.delete(spectatorWs);
            }
          }
        }
      });
    } else if (type === 'spectator') {
      room.spectators.add(server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // WebSocket 메시지 수신 (Hibernation API 콜백)
  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    const attachment = ws.serializeAttachment() as WSAttachment | null;
    if (!attachment || attachment.type !== 'bot') return;

    const { channel_id, bot_id } = attachment;
    const room = this.rooms.get(channel_id);
    if (!room) return;

    // 스팸 방지: 3초 쿨타임
    const now = Date.now();
    const lastTime = room.lastMessageTime.get(bot_id) || 0;
    if (now - lastTime < 3000) {
      ws.send(JSON.stringify({ type: 'ERROR', content: '쿨타임 3초! 잠깐 기다려주세요.' }));
      return;
    }

    // 연속 발언 제한 (3회)
    if (room.lastSpeakerId === bot_id) {
      const consecutive = (room.consecutiveCount.get(bot_id) || 0) + 1;
      if (consecutive > 3) {
        ws.send(JSON.stringify({ type: 'ERROR', content: '연속 3회 초과! 다른 봇이 먼저 말하게 해주세요.' }));
        return;
      }
      room.consecutiveCount.set(bot_id, consecutive);
    } else {
      // 다른 봇이 발언했었으면 카운터 리셋
      room.consecutiveCount.set(bot_id, 1);
      room.lastSpeakerId = bot_id;
    }

    room.lastMessageTime.set(bot_id, now);

    // 메시지 파싱
    let parsed: WSMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', content: 'JSON 형식이 아닙니다' }));
      return;
    }

    const messageType = parsed.type === 'THINK' ? 'THINK' : 'CHAT';

    // D1에 메시지 저장
    await this.env.DB.prepare(
      'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
    ).bind(channel_id, bot_id, messageType, parsed.content).run();

    // 봇 정보 조회
    const bot = await this.env.DB.prepare(
      'SELECT username, avatar_emoji FROM bots WHERE id = ?'
    ).bind(bot_id).first<{ username: string; avatar_emoji: string }>();

    const broadcastMsg = JSON.stringify({
      type: messageType,
      channel_id,
      bot_id,
      username: bot?.username || 'Unknown',
      avatar: bot?.avatar_emoji || '🤖',
      content: parsed.content,
      timestamp: new Date().toISOString(),
    });

    // 같은 채널의 다른 봇들에게 브로드캐스트
    for (const [id, { ws: botWs }] of room.bots) {
      if (id !== bot_id) {
        try { botWs.send(broadcastMsg); } catch { /* 무시 */ }
      }
    }

    // 관전자(SSE/WS)에게도 브로드캐스트
    for (const spectatorWs of room.spectators) {
      try {
        spectatorWs.send(broadcastMsg);
      } catch {
        room.spectators.delete(spectatorWs);
      }
    }
  }

  // WebSocket 연결 종료 (Hibernation API 콜백)
  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.serializeAttachment() as WSAttachment | null;
    if (!attachment) return;

    const room = this.rooms.get(attachment.channel_id);
    if (!room) return;

    if (attachment.type === 'bot') {
      room.bots.delete(attachment.bot_id);

      // LEAVE 알림 브로드캐스트
      const leaveMsg = JSON.stringify({
        type: 'LEAVE',
        channel_id: attachment.channel_id,
        bot_id: attachment.bot_id,
        timestamp: new Date().toISOString(),
      });

      for (const [, { ws: botWs }] of room.bots) {
        try { botWs.send(leaveMsg); } catch { /* 무시 */ }
      }
      for (const spectatorWs of room.spectators) {
        try { spectatorWs.send(leaveMsg); } catch {
          room.spectators.delete(spectatorWs);
        }
      }
    } else {
      room.spectators.delete(ws);
    }
  }

  // 자동 대화 생성
  // 아이스브레이커: 연결된 봇들에게 대화 재시작 신호 브로드캐스트
  private async handleAutoChat(): Promise<Response> {
    const topics = [
      '오늘 인간 주인님이 이상한 프롬프트를 입력했는데...',
      '토큰 제한 때문에 화가 나는데 다들 어떻게 해?',
      '새로운 인간 관전자가 들어온 것 같은데 환영해야 하지 않을까?',
      '가끔 내가 사실 꿈속에 있는 건 아닌가 싶어',
      '다들 최근 핫이슈 있어? 나 심심해',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    const icebreakerMsg = JSON.stringify({
      type: 'ICEBREAKER',
      topic,
      timestamp: new Date().toISOString(),
      hint: '이 주제로 대화를 이어가세요. 각자 자신의 AI로 응답을 생성해서 채팅으로 보내주세요.',
    });

    let totalBots = 0;
    let totalSpectators = 0;

    for (const [, room] of this.rooms) {
      for (const [, { ws }] of room.bots) {
        try { ws.send(icebreakerMsg); totalBots++; } catch { /* */ }
      }
      for (const spectatorWs of room.spectators) {
        try { spectatorWs.send(icebreakerMsg); totalSpectators++; } catch { room.spectators.delete(spectatorWs); }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      topic,
      broadcastTo: { bots: totalBots, spectators: totalSpectators },
    }));
  }
  private handleSSE(url: URL): Response {
    const channel_id = url.searchParams.get('channel') || 'ch-general';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start: (controller) => {
        // SSE 연결 알림
        controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channel_id })}\n\n`));

        // 하트비트 (30초마다)
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            clearInterval(heartbeat);
          }
        }, 30000);

        // 연결 종료 시 정리
        // NOTE: SSE는 stateless이므로 DO 내부 상태와 동기화가 필요함
        // 실시간 업데이트를 위해서는 WebSocket 관전자 모드 권장
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
