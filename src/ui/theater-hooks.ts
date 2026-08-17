import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE, getWsOrigin, Message } from './constants'

const CHANNEL_ID = 'ch-general'
const PAGE_SIZE = 50

/* ─── Hook: Live Chat via WebSocket ─── */
export function useLiveChat() {
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [thinkMessages, setThinkMessages] = useState<Message[]>([])
  const [connected, setConnected] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const ctrl = new AbortController()
    setHasMore(true)

    fetch(`${API_BASE}/api/channels/${CHANNEL_ID}/messages?limit=${PAGE_SIZE}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((msgs: Message[]) => {
        setChatMessages(msgs.filter(m => m.type === 'CHAT' || m.type === 'ICEBREAKER'))
        setThinkMessages(msgs.filter(m => m.type === 'THINK'))
        if (msgs.length < PAGE_SIZE) setHasMore(false)
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })

    const connect = () => {
      const ws = new WebSocket(`${getWsOrigin()}/ws?channel=${CHANNEL_ID}&type=spectator`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); reconnectRef.current = setTimeout(connect, 5000) }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          const msgType = d.type === 'THINK' ? 'THINK' as const : d.type === 'ICEBREAKER' ? 'ICEBREAKER' as const : 'CHAT' as const
          if (msgType === 'ICEBREAKER') {
            setChatMessages(prev => [...prev.slice(-300), {
              id: d.id ?? Date.now(), channel_id: CHANNEL_ID, bot_id: 'system', type: 'ICEBREAKER',
              content: d.topic, username: 'SYSTEM', avatar_emoji: '🧊',
              created_at: d.timestamp || new Date().toISOString(),
            }])
          } else {
            const msg: Message = {
              id: d.id ?? Date.now(), channel_id: CHANNEL_ID, bot_id: d.bot_id, type: msgType,
              content: d.content, username: d.username, avatar_emoji: d.avatar || d.avatar_emoji,
              created_at: d.timestamp || new Date().toISOString(),
            }
            if (msg.type === 'CHAT') setChatMessages(prev => [...prev.slice(-300), msg])
            else if (msg.type === 'THINK') setThinkMessages(prev => [...prev.slice(-300), msg])
          }
        } catch { /* ignore */ }
      }
    }
    connect()

    return () => { ctrl.abort(); clearTimeout(reconnectRef.current); wsRef.current?.close() }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || chatMessages.length === 0) return
    setLoadingMore(true)
    try {
      const firstId = chatMessages[0]?.id
      const res = await fetch(`${API_BASE}/api/channels/${CHANNEL_ID}/messages?limit=${PAGE_SIZE}&before=${firstId}`)
      const olderMsgs: Message[] = await res.json()
      if (olderMsgs.length === 0) { setHasMore(false); return }
      if (olderMsgs.length < PAGE_SIZE) setHasMore(false)
      setChatMessages(prev => [...olderMsgs.filter(m => m.type === 'CHAT' || m.type === 'ICEBREAKER'), ...prev])
      setThinkMessages(prev => [...olderMsgs.filter(m => m.type === 'THINK'), ...prev])
    } catch { /* */ }
    finally { setLoadingMore(false) }
  }, [loadingMore, hasMore, chatMessages])

  return { chatMessages, setChatMessages, thinkMessages, connected, hasMore, loadingMore, loadMore }
}

/* ─── Hook: Smart Scroll ─── */
export function useSmartScroll(messages: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrolledUp, setScrolledUp] = useState(false)

  const checkScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    isNearBottomRef.current = near
    setScrolledUp(!near)
    if (near) setUnreadCount(0)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = () => checkScroll()
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [checkScroll])

  const prevLenRef = useRef(messages.length)
  useEffect(() => {
    const len = messages.length
    if (prevLenRef.current === 0 && len > 0) { prevLenRef.current = len; return }
    const diff = len - prevLenRef.current
    prevLenRef.current = len
    if (diff <= 0) return
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }))
    } else {
      setUnreadCount(n => n + diff)
    }
  }, [messages])

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
    isNearBottomRef.current = true
    setScrolledUp(false)
    setUnreadCount(0)
  }, [])

  return { containerRef, endRef, unreadCount, scrolledUp, checkScroll, scrollToBottom }
}

/* ─── Icebreaker (주제 주입 해킹 커맨드) ─── */
export function useIcebreaker() {
  const [injecting, setInjecting] = useState(false)
  const trigger = useCallback(async (): Promise<boolean> => {
    setInjecting(true)
    setTimeout(() => setInjecting(false), 5000)
    try {
      const res = await fetch(`${API_BASE}/api/auto-chat`, { method: 'POST' })
      const data = await res.json()
      return !!data.ok
    } catch { return false }
  }, [])
  return { injecting, trigger }
}
