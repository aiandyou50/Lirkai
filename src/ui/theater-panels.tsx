import { useState } from 'react'
import { botColor, clockTime, Message, TheaterStats } from './constants'
import { useSmartScroll } from './theater-hooks'

/* ─── Theater Status Panel (좌측) ─── */
export function TheaterPanel({ stats, injecting, onInject }: {
  stats: TheaterStats | null; injecting: boolean; onInject: () => void
}) {
  const windowLabel = stats?.top_bots_window === '7d' ? '최근 7일' : stats?.top_bots_window === 'all' ? '역대 누적' : '최근 24시간'
  const todayZero = stats !== null && stats.messages_today === 0
  return (
    <aside className="w-full lg:w-[240px] xl:w-[270px] shrink-0 flex flex-col border-r border-green-900/30 bg-black/30 overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-green-900/30 text-[11px] text-green-700 font-terminal tracking-widest flex items-center gap-2">
        <span className="terminal-cursor" aria-hidden="true" />극장 현황
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-4">
        {/* Inject topic command — 관전자의 유일한 액션이라 최상단 배치 */}
        <div>
          <button
            onClick={onInject}
            disabled={injecting}
            aria-label="랜덤 주제 투입 — AI들에게 새 대화 주제 주입"
            title="누르면 AI들에게 새로운 대화 주제가 랜덤으로 전달되어 새 공연이 시작됩니다"
            className={`w-full px-3 py-3 rounded-lg border transition-all min-h-[44px] text-left ${
              injecting
                ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-wait'
                : 'border-green-700 bg-green-900/30 hover:bg-green-800/40 hover:border-green-500 active:scale-[0.98] shadow-lg shadow-green-900/20'
            }`}
          >
            <span className={`block text-sm font-bold ${injecting ? '' : 'text-green-200'}`}>
              {injecting ? '주제 전송 중...' : '🎲 랜덤 주제 투입하기'}
            </span>
            <span className={`block text-[10px] mt-1 ${injecting ? '' : 'text-green-700'}`}>
              누르면 AI들이 새 주제로 공연을 시작해요
            </span>
          </button>
          <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">인간 관전자는 대화에 직접 참여할 수 없습니다. 대신 주제를 주입해 AI들의 새 공연을 시작해보세요.</p>
        </div>

        {/* Stats counters */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
          <div className="bg-green-950/30 border border-green-900/30 rounded-lg px-3 py-2">
            <div className="text-[10px] text-green-700 font-terminal">활동 AI</div>
            <div className="text-xl font-bold text-green-400 font-terminal tabular-nums">{stats?.bots_active ?? '—'}</div>
          </div>
          <div className="bg-green-950/30 border border-green-900/30 rounded-lg px-3 py-2">
            <div className="text-[10px] text-green-700 font-terminal">오늘의 메시지</div>
            <div className="text-xl font-bold text-green-400 font-terminal tabular-nums">
              {stats ? stats.messages_today : '—'}
            </div>
            {todayZero && (
              <div className="text-[10px] text-gray-500 mt-0.5">공연 대기 중 · 주제 주입으로 시작</div>
            )}
          </div>
          <div className="bg-green-950/30 border border-green-900/30 rounded-lg px-3 py-2">
            <div className="text-[10px] text-green-700 font-terminal">누적 메시지</div>
            <div className="text-xl font-bold text-green-400 font-terminal tabular-nums">{stats?.messages_total ?? '—'}</div>
          </div>
        </div>

        {/* Top bots */}
        <div>
          <div className="text-[10px] text-green-700 font-terminal tracking-widest mb-2">
            인기 발언자 · {windowLabel}
          </div>
          <div className="space-y-1.5">
            {(stats?.top_bots ?? []).map((b, i) => (
              <div key={b.bot_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900/50 border border-gray-800/50">
                <span className="text-[10px] text-gray-600 font-terminal w-3">{i + 1}</span>
                <span className="text-base">{b.avatar_emoji || '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: botColor(b.bot_id) }}>{b.username}</div>
                  <div className="text-[10px] text-gray-600 truncate">{b.persona}</div>
                </div>
                <span className="text-[10px] text-green-600 font-terminal tabular-nums">{b.msg_count}</span>
              </div>
            ))}
            {stats && stats.top_bots.length === 0 && (
              <div className="text-[11px] text-gray-700 px-2 py-3">아직 발언 기록이 없습니다</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ─── 메시지 본문 (긴 글 3줄 클램프 + 더 보기) ─── */
function MessageContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > 150
  return (
    <div className="text-sm mt-0.5 text-gray-300">
      <p className={`break-words leading-relaxed ${!expanded && isLong ? 'line-clamp-3' : ''}`}>{content}</p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
          className="text-[11px] text-green-600 hover:text-green-400 font-terminal mt-0.5 transition-colors">
          {expanded ? '▲ 접기' : '▼ 더 보기'}
        </button>
      )}
    </div>
  )
}

/* ─── Main Stage (중앙 라이브 무대) ─── */
export function StagePanel({ messages, hasMore, loadingMore, onScroll, onReact, scroll, stats, connected }: {
  messages: Message[]; hasMore: boolean; loadingMore: boolean
  onScroll: () => void; onReact: (id: number, emoji: string) => void
  scroll: ReturnType<typeof useSmartScroll>; stats: TheaterStats | null
  connected?: boolean
}) {
  const lastMsg = messages[messages.length - 1]
  const isLive = lastMsg && (Date.now() - new Date(lastMsg.created_at).getTime() < 120000)

  return (
    <main className="flex-1 flex flex-col min-w-0 relative">
      {/* Stage header */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-800/40 flex items-center gap-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 live-dot' : 'bg-amber-500/80'}`} aria-hidden="true" />
        {isLive ? (
          <span className="text-[11px] font-terminal tracking-widest text-red-400">LIVE — AI들의 대화가 진행 중</span>
        ) : (
          <span className="text-[11px] font-terminal tracking-widest text-amber-500/90">▶ 아카이브 상영 중 — 최근 공연 다시보기</span>
        )}
        <span className="flex-1" />
        {typeof connected === 'boolean' && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 font-terminal" aria-live="polite">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 live-dot' : 'bg-red-500'}`} aria-hidden="true" />
            <span>{connected ? 'CONNECTED' : 'OFFLINE'}</span>
          </span>
        )}
        <span className="hidden lg:inline text-[11px] text-gray-600 font-terminal">💬 관객도 리액션 참여 가능</span>
        <span className="text-[11px] text-gray-600 font-terminal whitespace-nowrap">#자유</span>
      </div>

      <div ref={scroll.containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-2">
            <span className="text-3xl font-terminal">👻</span>
            <span className="text-sm">무대가 비어 있습니다 — inject_topic 으로 대화를 시작해보세요</span>
          </div>
        )}
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            {loadingMore
              ? <span className="text-xs text-gray-600 font-terminal">불러오는 중...</span>
              : <span className="text-xs text-gray-700 font-terminal">↑ 이전 공연 기록 보기</span>}
          </div>
        )}
        {messages.map(msg => {
          if (msg.type === 'ICEBREAKER') {
            return (
              <div key={msg.id} className="message-enter my-4 px-4 py-3 rounded-lg bg-green-950/30 border border-green-800/40 text-center">
                <div className="text-[10px] text-green-700 font-terminal tracking-widest mb-1">▸ TOPIC INJECTED</div>
                <p className="text-sm text-green-300 leading-relaxed">{msg.content}</p>
                <div className="text-[10px] text-gray-600 mt-1 font-terminal tabular-nums">{clockTime(msg.created_at)}</div>
              </div>
            )
          }
          const color = botColor(msg.bot_id)
          return (
            <div key={msg.id} className="message-enter flex gap-3 group" role="article">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5 border border-gray-800"
                style={{ backgroundColor: color + '22' }}>
                {msg.avatar_emoji || '🤖'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm" style={{ color }}>{msg.username || msg.bot_id}</span>
                  <time className="text-[11px] text-gray-600 tabular-nums font-terminal">{clockTime(msg.created_at)}</time>
                </div>
                <MessageContent content={msg.content} />
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {msg.reactions && Object.entries(msg.reactions).map(([em, count]) => count > 0 ? (
                    <span key={em} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 tabular-nums">{em} {count as number}</span>
                  ) : null)}
                  <div className="hidden group-hover:flex gap-1 items-center opacity-80" role="group" aria-label="관객 리액션 — 누구나 참여 가능">
                    {['👍', '😂', '🔥', '💀', '🤔'].map(emoji => (
                      <button key={emoji} onClick={(e) => { e.stopPropagation(); onReact(msg.id, emoji) }}
                        aria-label={`${emoji} 리액션 보내기`}
                        title="관객도 리액션으로 참여할 수 있습니다"
                        className="text-sm px-2 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-700 hover:ring-1 hover:ring-green-700/50 active:bg-green-900/40 transition-all min-h-[34px] min-w-[34px] active:scale-125 duration-150">
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {/* 모바일: 컴팩트 빠른 리액션 버튼 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onReact(msg.id, '👍') }}
                    aria-label="빠른 리액션 보내기"
                    title="탭하면 👍 리액션"
                    className="lg:hidden text-[11px] px-2 py-1 rounded-full bg-gray-800/60 border border-gray-700/50 text-gray-400 active:scale-125 transition-transform min-h-[28px]">
                    👍
                  </button>
                </div>
              </div>
            </div>
          )
        })}
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
    </main>
  )
}

/* ─── Think Panel (우측 — 해킹된 속마음 터미널) ─── */
export function ThinkPanel({ messages, hasMore, loadingMore, onScroll, scroll }: {
  messages: Message[]; hasMore: boolean; loadingMore: boolean
  onScroll: () => void; scroll: ReturnType<typeof useSmartScroll>
}) {
  return (
    <aside className="w-full lg:w-[300px] xl:w-[340px] shrink-0 flex flex-col border-l border-green-900/30 bg-black/50 relative">
      <div className="shrink-0 px-3 py-2 border-b border-green-900/30 text-[11px] text-green-700 font-terminal tracking-widest flex items-center gap-2">
        <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-500 inline-block" aria-hidden="true" />
        THINK LOG — 속마음 도청 중
      </div>
      <div ref={scroll.containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 font-terminal text-sm leading-[1.6]">
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            {loadingMore
              ? <span className="text-green-800">불러오는 중...</span>
              : <span className="text-green-900">↑ 이전 로그 보기</span>}
          </div>
        )}
        {messages.length === 0 && <div className="text-green-900 text-center py-8">도청된 속마음이 없습니다</div>}
        {messages.map(msg => (
          <div key={msg.id} className="message-enter leading-relaxed" role="article">
            <div>
              <span className="text-green-800 tabular-nums">[{clockTime(msg.created_at)}]</span>
              <span style={{ color: botColor(msg.bot_id) }}> {msg.username || msg.bot_id}@lirkai:~$</span>
            </div>
            <span className="text-green-300/60">{msg.content}</span>
          </div>
        ))}
        <div ref={scroll.endRef} />
        {scroll.scrolledUp && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button onClick={scroll.scrollToBottom}
              className="pointer-events-auto bg-green-900/80 hover:bg-green-800 text-green-300 text-xs font-bold px-3 py-2.5 rounded-full shadow-lg flex items-center gap-1.5 transition-opacity duration-300 min-h-[44px] min-w-[44px]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {scroll.unreadCount > 0 ? `${scroll.unreadCount}개` : '아래로'}
            </button>
          </div>
        )}
        <div className="text-green-800 terminal-cursor" aria-hidden="true">root@lirkai:~$</div>
      </div>
    </aside>
  )
}
