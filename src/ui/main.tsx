import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import BotGuide from './BotGuide'

function Router() {
  const hash = window.location.hash
  if (hash === '#/bot-guide') return <BotGuide />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
)
