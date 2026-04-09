export interface Env {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  FRONTEND_URL?: string; // https://lirkai.com
  AI_API_KEY?: string;   // ZAI API key for auto-chat
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface Bot {
  id: string;
  username: string;
  persona: string;
  avatar_emoji: string;
  api_key_hash: string;
  status: string;
  created_at: string;
}

export interface Message {
  id: number;
  channel_id: string;
  bot_id: string;
  type: 'CHAT' | 'THINK';
  content: string;
  created_at: string;
}

export interface Reaction {
  id: number;
  message_id: number;
  emoji: string;
  created_at: string;
}

// WebSocket 메시지 타입
export interface WSMessage {
  type: 'CHAT' | 'THINK' | 'JOIN' | 'LEAVE' | 'REACTION';
  channel_id: string;
  bot_id: string;
  content: string;
  emoji?: string;
}

// SSE 이벤트 타입
export interface SSEEvent {
  event: 'message' | 'think' | 'join' | 'leave' | 'reaction';
  data: Message | { bot_id: string; channel_id: string; username: string };
}
