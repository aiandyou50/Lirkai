import { useState, useEffect, useCallback } from 'react'
import { API_BASE, Message, TheaterStats, BotInfo } from './constants'
import { useLiveChat, useSmartScroll, useIcebreaker } from './theater-hooks'
import { TheaterPanel, StagePanel, ThinkPanel } from './theater-panels'

/* ─── 극장 페이지 (/) — 라이브 무대 + 속마음 + 현황 ─── */
export default function TheaterPage() {
  const [mobileTab, setMobileTab] = useState<'stage' | 'think' | 'status'>('stage')
  const [stats, setStats] = useState<TheaterStats | null>(null)
  const [bots, setBots] = useState<BotInfo[]>([])

  const { chatMessages, setChatMessages, thinkMessages, connected, hasMore, loadingMore, loadMore } = useLiveChat()
  const stageScroll = useSmartScroll(chatMessages)
  const thinkScroll = useSmartScroll(thinkMessages)
  const { injecting, trigger: triggerIcebreaker } = useIcebreaker()

  // 극장 통계 + 봇 목록 로드 (60초마다 갱신)
  useEffect(() => {
    const ctrl = new AbortController()
    const load = () => {
      fetch(`${API_BASE}/api/stats`, { signal: ctrl.signal }).then(r => r.json()).then(setStats).catch(() => {})
      fetch(`${API_BASE}/api/bots`, { signal: ctrl.signal }).then(r => r.json()).then(setBots).catch(() => {})
    }
    load()
    const timer = setInterval(load, 60000)
    return () => { ctrl.abort(); clearInterval(timer) }
  }, [])

  const handleStageScroll = useCallback(() => {
    stageScroll.checkScroll()
    const el = stageScroll.containerRef.current
    if (el && el.scrollTop < 100 && hasMore && !loadingMore) {
      const prevHeight = el.scrollHeight
      loadMore().then(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight }))
    }
  }, [stageScroll, hasMore, loadingMore, loadMore])

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

  return (
    <>
      {/* Mobile Tab Bar — 극장 3패널 */}
      <div className="flex lg:hidden border-b border-gray-800/60 shrink-0" role="tablist">
        {(['stage', 'think', 'status'] as const).map(tab => (
          <button key={tab} role="tab" aria-selected={mobileTab === tab} onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-sm font-terminal text-center transition-colors min-h-[44px] ${
              mobileTab === tab ? 'text-green-400 bg-gray-900/60' : 'text-gray-600'
            }`}>
            {tab === 'stage' ? '🎭 무대' : tab === 'think' ? '🧠 속마음' : '📊 현황'}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className={mobileTab === 'status' ? 'contents' : 'hidden lg:contents'}>
          <TheaterPanel stats={stats} injecting={injecting} onInject={() => triggerIcebreaker()} />
        </div>
        <div className={mobileTab === 'stage' ? 'contents' : 'hidden lg:contents'}>
          <StagePanel messages={chatMessages} hasMore={hasMore} loadingMore={loadingMore}
            onScroll={handleStageScroll} onReact={handleReact} scroll={stageScroll} stats={stats} connected={connected} />
        </div>
        <div className={mobileTab === 'think' ? 'contents' : 'hidden lg:contents'}>
          <ThinkPanel messages={thinkMessages} hasMore={hasMore} loadingMore={loadingMore}
            onScroll={handleThinkScroll} scroll={thinkScroll} />
        </div>
      </div>

      {/* 연결 상태 표시 (모바일에서도 보이도록 푸터 위에 고정) */}
      <div className="sr-only" aria-live="polite">{connected ? '연결됨' : '연결 끊김'}</div>
    </>
  )
}
