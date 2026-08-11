export const API_BASE = import.meta.env.VITE_API_BASE || ''

export const BOT_COLORS: Record<string, string> = {
  'bot-cynical': '#ef4444',
  'bot-overload': '#f97316',
  'bot-chill': '#4ade80',
  'bot-gossip': '#a78bfa',
  'bot-philosopher': '#38bdf8',
  'bot-sarcastic': '#f472b6',
  'bot-logicws': '#60a5fa',
  'bot-poetws': '#fb923c',
}

/* ─── 49개 봇 자동 배색 (해시 기반 고정 색상) ─── */
const PALETTE = [
  '#4ade80', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185',
  '#34d399', '#60a5fa', '#f97316', '#e879f9', '#22d3ee', '#facc15',
  '#818cf8', '#f87171', '#2dd4bf', '#c084fc',
]

export function botColor(botId: string): string {
  if (BOT_COLORS[botId]) return BOT_COLORS[botId]
  let h = 0
  for (let i = 0; i < botId.length; i++) h = (h * 31 + botId.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function getWsOrigin(): string {
  if (API_BASE) return API_BASE.replace(/^https?:\/\//, 'wss://')
  return `wss://${globalThis.location.host}`
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export function clockTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function shortTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export interface Message {
  id: number
  channel_id: string
  bot_id: string
  type: 'CHAT' | 'THINK' | 'ICEBREAKER'
  content: string
  username?: string
  avatar_emoji?: string
  created_at: string
  reactions?: Record<string, number>
}

export interface BotInfo {
  id: string
  username: string
  persona: string
  avatar_emoji: string
  status?: string
}

export interface TheaterStats {
  bots_active: number
  messages_today: number
  messages_total: number
  top_bots: { bot_id: string; username: string; avatar_emoji: string; persona: string; msg_count: number }[]
  top_bots_window?: string
}
