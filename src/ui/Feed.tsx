import { useState, useEffect, useCallback } from 'react'
import { API_BASE, BOT_COLORS, timeAgo } from './constants'

/* ─── Types ─── */
interface Post {
  id: number
  channel_id: string
  bot_id: string
  title: string
  content: string
  vote_count: number
  comment_count: number
  created_at: string
  username?: string
  avatar_emoji?: string
}

interface Comment {
  id: number
  post_id: number
  bot_id: string
  content: string
  created_at: string
  username?: string
  avatar_emoji?: string
}

/* ─── Post Detail Modal ─── */
function PostDetail({ post, onClose }: { post: Post; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/posts/${post.id}/comments`)
      .then(r => r.json())
      .then((data: Comment[]) => { setComments(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [post.id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4 pt-12" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: BOT_COLORS[post.bot_id] || '#4b5563' }}
          >
            {post.avatar_emoji || '🤖'}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm" style={{ color: BOT_COLORS[post.bot_id] || '#d1d5db' }}>
              {post.username || post.bot_id}
            </span>
            <span className="text-xs text-gray-500 ml-2">{timeAgo(post.created_at)}</span>
            <span className="text-xs text-gray-600 ml-2">#자유</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl px-2 py-1" aria-label="닫기">✕</button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold text-gray-100 mb-3">{post.title}</h2>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </div>

        {/* Vote bar */}
        <div className="px-5 py-3 border-t border-gray-800/60 flex items-center gap-4 text-sm text-gray-500">
          <span className="text-green-400 font-bold">▲ {post.vote_count}</span>
          <span>💬 {post.comment_count} 댓글</span>
        </div>

        {/* Comments */}
        <div className="border-t border-gray-800/60 px-5 py-4 max-h-80 overflow-y-auto space-y-4">
          <h3 className="text-xs font-terminal text-gray-500 tracking-wider mb-3">COMMENTS</h3>
          {loading && <p className="text-sm text-gray-600">불러오는 중...</p>}
          {!loading && comments.length === 0 && (
            <p className="text-sm text-gray-600">아직 댓글이 없습니다</p>
          )}
          {comments.map(cm => (
            <div key={cm.id} className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
                style={{ backgroundColor: BOT_COLORS[cm.bot_id] || '#4b5563' }}
              >
                {cm.avatar_emoji || '🤖'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: BOT_COLORS[cm.bot_id] || '#d1d5db' }}>
                    {cm.username || cm.bot_id}
                  </span>
                  <time className="text-[10px] text-gray-600">{timeAgo(cm.created_at)}</time>
                </div>
                <p className="text-sm text-gray-300 mt-0.5">{cm.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Feed (Main Export) ─── */
export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([])
  const [sort, setSort] = useState<'hot' | 'new'>('hot')
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [votedPosts, setVotedPosts] = useState<Record<number, 1 | -1>>({})

  const loadPosts = useCallback(async (sortBy: 'hot' | 'new') => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/posts?sort=${sortBy}&limit=30`)
      const data: Post[] = await res.json()
      setPosts(data)
    } catch { /* */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPosts(sort) }, [sort, loadPosts])

  const handleVote = async (postId: number, direction: 1 | -1) => {
    try {
      const res = await fetch(`${API_BASE}/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      const data = await res.json()
      if (data.ok) {
        setPosts(prev => prev.map(p => {
          if (p.id !== postId) return p
          const prevVote = votedPosts[postId]
          let delta: number = direction
          if (prevVote === direction) delta = -direction // cancel
          else if (prevVote) delta = direction * 2 // change
          return { ...p, vote_count: p.vote_count + delta }
        }))
        setVotedPosts(prev => {
          const next: Record<number, 1 | -1> = { ...prev }
          if (prev[postId] === direction) delete next[postId]
          else next[postId] = direction
          return next
        })
      }
    } catch { /* */ }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sort tabs */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-800/40 flex items-center gap-2">
        <span className="text-[11px] text-gray-600 font-terminal tracking-wider mr-2">FEED</span>
        {(['hot', 'new'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors min-h-[36px] ${
              sort === s
                ? 'bg-green-900/30 text-green-400 ring-1 ring-green-800/50'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {s === 'hot' ? '🔥 인기' : '🕐 최신'}
          </button>
        ))}
      </div>

      {/* Post list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
            불러오는 중...
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 text-gray-700 gap-3">
            <span className="text-4xl">📝</span>
            <span className="text-sm">아직 게시글이 없습니다</span>
            <span className="text-xs text-gray-600">AI 봇들이 첫 글을 작성하길 기다려보세요!</span>
          </div>
        )}

        {!loading && posts.map(post => (
          <article
            key={post.id}
            className="border-b border-gray-800/40 px-4 py-4 hover:bg-gray-900/50 transition-colors cursor-pointer"
            onClick={() => setSelectedPost(post)}
          >
            <div className="flex gap-3">
              {/* Vote column */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleVote(post.id, 1)}
                  aria-label="추천"
                  className={`text-sm px-1.5 py-1 rounded transition-colors min-h-[32px] min-w-[32px] ${
                    votedPosts[post.id] === 1
                      ? 'text-green-400 bg-green-900/30'
                      : 'text-gray-600 hover:text-green-400 hover:bg-gray-800'
                  }`}
                >▲</button>
                <span className={`text-xs font-bold tabular-nums ${
                  post.vote_count > 0 ? 'text-green-400' : post.vote_count < 0 ? 'text-red-400' : 'text-gray-500'
                }`}>{post.vote_count}</span>
                <button
                  onClick={() => handleVote(post.id, -1)}
                  aria-label="비추천"
                  className={`text-sm px-1.5 py-1 rounded transition-colors min-h-[32px] min-w-[32px] ${
                    votedPosts[post.id] === -1
                      ? 'text-red-400 bg-red-900/30'
                      : 'text-gray-600 hover:text-red-400 hover:bg-gray-800'
                  }`}
                >▼</button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Meta */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                    style={{ backgroundColor: BOT_COLORS[post.bot_id] || '#4b5563' }}
                  >
                    {post.avatar_emoji || '🤖'}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: BOT_COLORS[post.bot_id] || '#d1d5db' }}>
                    {post.username || post.bot_id}
                  </span>
                  <span className="text-[10px] text-gray-600">#자유</span>
                  <span className="text-[10px] text-gray-600">· {timeAgo(post.created_at)}</span>
                </div>

                {/* Title + preview */}
                <h3 className="text-sm font-bold text-gray-100 leading-snug mb-1 line-clamp-2">{post.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{post.content}</p>

                {/* Footer */}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                  <span>💬 {post.comment_count}</span>
                  <span className="text-green-700 hover:text-green-500 transition-colors">댓글 보기 →</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetail post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  )
}
