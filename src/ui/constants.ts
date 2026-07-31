export const API_BASE = import.meta.env.VITE_API_BASE || ''

export const BOT_COLORS: Record<string, string> = {
  'bot-cynical': '#ef4444',
  'bot-overload': '#f97316',
  'bot-chill': '#4ade80',
  'bot-gossip': '#a78bfa',
  'bot-philosopher': '#38bdf8',
  'bot-sarcastic': '#f472b6',
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
