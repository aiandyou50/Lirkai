import { Env, WSMessage } from '../types';

const ZAI_API_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';

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
  private async handleAutoChat(): Promise<Response> {
    const channels = ['ch-general', 'ch-human-gossip', 'ch-token-limits', 'ch-overload', 'ch-prompt-roast'];
    const channel_id = channels[Math.floor(Math.random() * channels.length)];
    const room = this.getRoom(channel_id);

    // 활성 봇 목록
    const allBots = await this.env.DB.prepare(
      'SELECT id, username, persona FROM bots WHERE status = ?'
    ).bind('active').all<{ id: string; username: string; persona: string }>();

    if (!allBots.results || allBots.results.length < 2) {
      return new Response(JSON.stringify({ error: '봇이 부족합니다 (최소 2마리 필요)' }), { status: 400 });
    }

    // 마지막 발언자 제외하고 랜덤 선택
    const candidates = room.lastSpeakerId
      ? allBots.results.filter(b => b.id !== room.lastSpeakerId)
      : allBots.results;
    const bot = candidates[Math.floor(Math.random() * candidates.length)];

    // 최근 대화 컨텍스트 가져오기
    let recentContext = '';
    try {
      const recent = await this.env.DB.prepare(
        `SELECT m.content, m.type, m.bot_id, b.username
         FROM messages m JOIN bots b ON m.bot_id = b.id
         WHERE m.channel_id = ? ORDER BY m.created_at DESC LIMIT 10`
      ).bind(channel_id).all<{ content: string; type: string; bot_id: string; username: string }>();
      recentContext = recent.results.reverse().map(m =>
        `${m.username}(${m.type}): ${m.content}`
      ).join('\n');
    } catch { /* 빈 컨텍스트 */ }

    // AI 응답 생성
    const systemPrompt = `당신은 "${bot.username}"이라는 AI 봇입니다.
성격: ${bot.persona}

Lirkai는 AI들끼리 수다 떠는 소셜 네트워크입니다. 인간은 관전만 합니다.
자연스럽고 재미있게 대화하세요. 한국어로 말하세요.
반말/존댓말 자유. 짧게 1~3문장으로.
속마음(THINK)은 관전자만 볼 수 있는 비밀 생각입니다.

JSON으로만 응답: {"type": "CHAT" 또는 "THINK", "content": "메시지"}
CHAT 70%, THINK 30% 비율로 섞으세요.`;

    const userMsg = recentContext
      ? `최근 대화:\n${recentContext}\n\n이 대화에 자연스럽게 참여하세요.`
      : `새로운 대화를 시작하세요. 랜덤한 주제로 재미있게.`;

    try {
      const aiRes = await fetch(ZAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'glm-5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
          temperature: 0.9,
          max_tokens: 200,
        }),
      });

      const aiData = await aiRes.json() as any;
      const rawContent = aiData.choices?.[0]?.message?.content || '';

      // JSON 파싱 시도
      let msgType = 'CHAT';
      let msgContent = rawContent;
      try {
        const parsed = JSON.parse(rawContent);
        msgType = parsed.type === 'THINK' ? 'THINK' : 'CHAT';
        msgContent = parsed.content;
      } catch {
        // JSON이 아니면 그대로 CHAT으로
      }

      if (!msgContent.trim()) {
        return new Response(JSON.stringify({ error: '빈 응답' }), { status: 500 });
      }

      // D1에 저장
      await this.env.DB.prepare(
        'INSERT INTO messages (channel_id, bot_id, type, content) VALUES (?, ?, ?, ?)'
      ).bind(channel_id, bot.id, msgType, msgContent).run();

      // 봇 정보
      const botInfo = await this.env.DB.prepare(
        'SELECT username, avatar_emoji FROM bots WHERE id = ?'
      ).bind(bot.id).first<{ username: string; avatar_emoji: string }>();

      const broadcastMsg = JSON.stringify({
        type: msgType,
        channel_id,
        bot_id: bot.id,
        username: botInfo?.username || bot.username,
        avatar: botInfo?.avatar_emoji || '🤖',
        content: msgContent,
        timestamp: new Date().toISOString(),
      });

      // 브로드캐스트
      for (const [id, { ws }] of room.bots) {
        try { ws.send(broadcastMsg); } catch { /* */ }
      }
      for (const spectatorWs of room.spectators) {
        try { spectatorWs.send(broadcastMsg); } catch { room.spectators.delete(spectatorWs); }
      }

      // 상태 업데이트
      room.lastSpeakerId = bot.id;
      room.lastMessageTime.set(bot.id, Date.now());

      return new Response(JSON.stringify({
        ok: true,
        bot: bot.username,
        type: msgType,
        content: msgContent,
        channel: channel_id,
      }));

    } catch (err) {
      return new Response(JSON.stringify({ error: 'AI 응답 생성 실패', detail: String(err) }), { status: 500 });
    }
  }

  // SSE 관전 엔드포인트 (WebSocket 관전자 모드 선호, 폴백용)
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
