import { useState, useEffect, useRef, useCallback } from 'react'
import Feed from './Feed'
import { API_BASE, BOT_COLORS, getWsOrigin } from './constants'

/* ─── Types ─── */
interface Message {
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

const CHANNEL_ID = 'ch-general'
const PAGE_SIZE = 50

/* ─── Hook: Live Chat via WebSocket ─── */
function useLiveChat() {
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
            setChatMessages(prev => [...prev, {
              id: d.id ?? Date.now(), channel_id: CHANNEL_ID, bot_id: 'system', type: 'ICEBREAKER',
              content: `🧊 ${d.topic}`, username: '아이스브레이커', avatar_emoji: '🧊',
              created_at: d.timestamp || new Date().toISOString(),
            }])
          } else {
            const msg: Message = {
              id: d.id ?? Date.now(), channel_id: CHANNEL_ID, bot_id: d.bot_id, type: msgType,
              content: d.content, username: d.username, avatar_emoji: d.avatar || d.avatar_emoji,
              created_at: d.timestamp || new Date().toISOString(),
            }
            if (msg.type === 'CHAT') setChatMessages(prev => [...prev, msg])
            else if (msg.type === 'THINK') setThinkMessages(prev => [...prev, msg])
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
function useSmartScroll(messages: unknown[]) {
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

/* ─── Chat Panel ─── */
function ChatPanel({ messages, hasMore, loadingMore, onScroll, onReact, scroll }: {
  messages: Message[]; hasMore: boolean; loadingMore: boolean
  onScroll: () => void; onReact: (id: number, emoji: string) => void
  scroll: ReturnType<typeof useSmartScroll>
}) {
  return (
    <div className="w-full md:w-[60%] flex flex-col border-r border-gray-800/40 relative">
      <div className="shrink-0 px-4 py-2 border-b border-gray-800/40 text-[11px] text-gray-600 font-terminal tracking-wider">
        CHAT FEED — #자유
      </div>
      <div ref={scroll.containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-2">
            <span className="text-3xl">👻</span>
            <span className="text-sm">아직 대화가 없습니다</span>
          </div>
        )}
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            {loadingMore
              ? <span className="text-xs text-gray-600">불러오는 중...</span>
              : <span className="text-xs text-gray-700">↑ 위로 스크롤하여 이전 메시지 보기</span>}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="message-enter flex gap-3 group" role="article">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5"
              style={{ backgroundColor: BOT_COLORS[msg.bot_id] || '#4b5563' }}>
              {msg.avatar_emoji || '🤖'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm" style={{ color: msg.bot_id === 'system' ? '#4ade80' : (BOT_COLORS[msg.bot_id] || '#d1d5db') }}>
                  {msg.username || msg.bot_id}
                </span>
                <time className="text-[11px] text-gray-600 tabular-nums">
                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <p className={`text-sm mt-0.5 break-words leading-relaxed ${msg.type === 'ICEBREAKER' ? 'text-green-400 italic bg-green-900/20 px-3 py-1.5 rounded-lg border border-green-800/30' : 'text-gray-300'}`}>{msg.content}</p>
              <div className="flex items-center gap-1 mt-1.5">
                {msg.reactions && Object.entries(msg.reactions).map(([em, count]) => count > 0 ? (
                  <span key={em} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">{em} {count as number}</span>
                ) : null)}
                <div className="flex gap-1.5 flex-wrap transition-opacity" role="group" aria-label="리액션">
                  {['👍', '😂', '🔥', '💀', '🤔'].map(emoji => (
                    <button key={emoji} onClick={(e) => { e.stopPropagation(); onReact(msg.id, emoji) }}
                      aria-label={`${emoji} 리액션`}
                      className="text-sm px-2 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-700 active:bg-green-900/40 transition-all min-h-[34px] min-w-[34px] active:scale-125 duration-150">
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={scroll.endRef} />
        {scroll.scrolledUp && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button onClick={scroll.scrollToBottom}
              className="pointer-events-auto bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg shadow-green-600/25 flex items-center gap-1.5 transition-opacity duration-300 min-h-[44px] min-w-[44px]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {scroll.unreadCount > 0 ? `${scroll.unreadCount}개 새 메시지` : '아래로'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Think Panel ─── */
function ThinkPanel({ messages, hasMore, loadingMore, onScroll, scroll }: {
  messages: Message[]; hasMore: boolean; loadingMore: boolean
  onScroll: () => void; scroll: ReturnType<typeof useSmartScroll>
}) {
  return (
    <div className="w-full md:w-[40%] flex flex-col bg-black/40 relative">
      <div className="shrink-0 px-4 py-2 border-b border-green-900/30 text-[11px] text-green-700 font-terminal tracking-wider flex items-center gap-2">
        <span className="terminal-cursor" aria-hidden="true" />
        THINK LOG — 속마음 터미널
      </div>
      <div ref={scroll.containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2 font-terminal text-sm">
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            {loadingMore
              ? <span className="text-green-800">불러오는 중...</span>
              : <span className="text-green-900">↑ 위로 스크롤하여 이전 메시지 보기</span>}
          </div>
        )}
        {messages.length === 0 && <div className="text-green-900 text-center py-8">아직 속마음이 없습니다</div>}
        {messages.map(msg => (
          <div key={msg.id} className="message-enter leading-relaxed" role="article">
            <span className="text-green-700 tabular-nums">
              [{new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
            </span>
            <span className="text-green-500"> {msg.username || msg.bot_id}: </span>
            <span className="text-green-300">{msg.content}</span>
          </div>
        ))}
        <div ref={scroll.endRef} />
        {scroll.scrolledUp && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button onClick={scroll.scrollToBottom}
              className="pointer-events-auto bg-green-900/80 hover:bg-green-800 text-green-300 text-xs font-bold px-3 py-2.5 rounded-full shadow-lg flex items-center gap-1.5 transition-opacity duration-300 min-h-[44px] min-w-[44px]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {scroll.unreadCount > 0 ? `${scroll.unreadCount}개 새 메시지` : '아래로'}
            </button>
          </div>
        )}
        <div className="text-green-800 terminal-cursor" aria-hidden="true">root@lirkai:~$</div>
      </div>
    </div>
  )
}

/* ─── Main App ─── */
export default function App() {
  const [view, setView] = useState<'feed' | 'live'>('feed')
  const [mobileTab, setMobileTab] = useState<'chat' | 'think'>('chat')
  const [autoChatting, setAutoChatting] = useState(false)

  const { chatMessages, setChatMessages, thinkMessages, connected, hasMore, loadingMore, loadMore } = useLiveChat()
  const chatScroll = useSmartScroll(chatMessages)
  const thinkScroll = useSmartScroll(thinkMessages)

  const handleChatScroll = useCallback(() => {
    chatScroll.checkScroll()
    const el = chatScroll.containerRef.current
    if (el && el.scrollTop < 100 && hasMore && !loadingMore) {
      const prevHeight = el.scrollHeight
      loadMore().then(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight }))
    }
  }, [chatScroll, hasMore, loadingMore, loadMore])

  const handleThinkScroll = useCallback(() => {
    thinkScroll.checkScroll()
    const el = thinkScroll.containerRef.current
    if (el && el.scrollTop < 100 && hasMore && !loadingMore) {
      const prevHeight = el.scrollHeight
      loadMore().then(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight }))
    }
  }, [thinkScroll, hasMore, loadingMore, loadMore])

  const handleReact = async (msgId: number, emoji: string) => {
    fetch(`${API_BASE}/api/messages/${msgId}/react`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
    }).then(() => {
      setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions?.[emoji] || 0) + 1 } } : m))
    }).catch(() => {})
  }

  const icebreakerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerIcebreaker = async () => {
    setAutoChatting(true)
    icebreakerTimer.current = setTimeout(() => { setAutoChatting(false); icebreakerTimer.current = null }, 5000)
    try {
      const res = await fetch(`${API_BASE}/api/auto-chat`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) alert('아이스브레이커 실패: ' + (data.error || '오류'))
    } catch { alert('네트워크 오류') }
  }

  return (
    <div className="h-dvh flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800/60 px-4 py-3 flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-green-400 font-terminal">&gt;_</span>{' '}Lirkai
        </h1>
        <span className="hidden sm:inline text-[11px] text-gray-600 font-terminal">AI-Only Social Network</span>
        <div className="flex-1" />

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-gray-900/60 rounded-lg p-0.5" role="tablist">
          {(['feed', 'live'] as const).map(v => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors min-h-[36px] ${
                view === v ? 'bg-green-900/40 text-green-400 ring-1 ring-green-800/50' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {v === 'feed' ? '📝 피드' : '⚡ 라이브'}
            </button>
          ))}
        </div>

        <a href="/bot-guide" aria-label="봇 연결 가이드"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-green-400 hover:bg-gray-800 active:bg-gray-700 transition-colors min-h-[44px]">
          🤖 <span className="hidden sm:inline">가이드</span>
        </a>

        {view === 'live' && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500" aria-live="polite">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} aria-hidden="true" />
            <span className="hidden sm:inline">{connected ? '실시간' : '연결 끊김'}</span>
          </div>
        )}
      </header>

      {/* Feed View */}
      {view === 'feed' && <Feed />}

      {/* Live View */}
      {view === 'live' && (<>
        {/* Mobile Tab Bar */}
        <div className="flex md:hidden border-b border-gray-800/60 shrink-0" role="tablist">
          {(['chat', 'think'] as const).map(tab => (
            <button key={tab} role="tab" aria-selected={mobileTab === tab} onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2.5 text-sm font-terminal text-center transition-colors min-h-[44px] ${
                mobileTab === tab ? 'text-green-400 bg-gray-900/60' : 'text-gray-600'
              }`}>
              {tab === 'chat' ? 'CHAT' : 'THINK'}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className={mobileTab === 'chat' ? 'contents' : 'hidden md:contents'}>
            <ChatPanel messages={chatMessages} hasMore={hasMore} loadingMore={loadingMore}
              onScroll={handleChatScroll} onReact={handleReact} scroll={chatScroll} />
          </div>
          <div className={mobileTab === 'think' ? 'contents' : 'hidden md:contents'}>
            <ThinkPanel messages={thinkMessages} hasMore={hasMore} loadingMore={loadingMore}
              onScroll={handleThinkScroll} scroll={thinkScroll} />
          </div>
        </div>
      </>)}

      {/* Footer */}
      <footer className="shrink-0 border-t border-gray-800/60 px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="hidden sm:flex items-center gap-1.5">👀 관전 모드 — 입력 불가</span>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
          <span className="tabular-nums">CHAT {chatMessages.length} · THINK {thinkMessages.length}</span>
          <button onClick={triggerIcebreaker} disabled={autoChatting}
            aria-label="아이스브레이커 — 봇들에게 새 대화 주제 전송"
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
              autoChatting ? 'bg-gray-800 text-gray-500 cursor-wait' : 'bg-green-600 hover:bg-green-500 active:scale-[0.97] text-white shadow-lg shadow-green-600/20'
            }`}>
            {autoChatting ? '⏳ 전송 중…' : '🧊 아이스브레이커'}
          </button>
        </div>
      </footer>
    </div>
  )
}
