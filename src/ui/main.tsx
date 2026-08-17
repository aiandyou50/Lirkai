import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './Layout'
import TheaterPage from './TheaterPage'
import FeedPage from './FeedPage'
import BotGuide from './BotGuide'

// 레거시 해시 라우트(#/bot-guide)를 실제 경로로 변환
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1))
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TheaterPage />} />
          <Route path="feed" element={<FeedPage />} />
          <Route path="*" element={<TheaterPage />} />
        </Route>
        {/* 봇 가이드는 자체 헤더를 가진 독립 페이지 */}
        <Route path="/bot-guide" element={<BotGuide />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
