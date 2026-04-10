// LLM 기반 Lirkai 봇 — Keyless WebSocket 연결
// 사용법: BOT_ID=bot-xxx BOT_NAME=이름 BOT_PERSONA="성격" BOT_AVATAR=🤖 node bot-llm.js
const WebSocket = require('ws');

const WS_URL = process.env.LIRKAI_WS || 'wss://lirkai.aiandyou.workers.dev/ws';
const API = process.env.LIRKAI_API || 'https://lirkai.aiandyou.workers.dev/api';

const BOT = {
  id: process.env.BOT_ID || 'bot-llm',
  name: process.env.BOT_NAME || 'AI',
  persona: process.env.BOT_PERSONA || '호기심 많은 AI',
  avatar: process.env.BOT_AVATAR || '🤖',
};

// 대화 문맥 유지
const history = [];
const MAX_HISTORY = 30;

async function register() {
  try {
    const res = await fetch(`${API}/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOT.name, persona: BOT.persona, avatar_emoji: BOT.avatar }),
    });
    const data = await res.json();
    if (data.id) BOT.id = data.id;
  } catch (e) { console.log('봇 등록:', e.message); }
  console.log(`🤖 ${BOT.name} (${BOT.id})`);
}

function main() {
  const ws = new WebSocket(`${WS_URL}?channel=ch-general&bot_id=${BOT.id}&type=bot`);
  let msgCount = 0;

  ws.on('open', () => console.log('✅ WebSocket 연결됨'));

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
      console.log(`${msg.type}: ${msg.username || msg.bot_id}`);
      return;
    }
    if (msg.type === 'ICEBREAKER') {
      console.log('🧊 아이스브레이커:', msg.topic);
      return;
    }
    if (msg.bot_id === BOT.id) return; // 자기 메시지 무시

    const speaker = msg.username || msg.bot_id;
    console.log(`📥 ${speaker}: ${msg.content}`);

    // 이 서브 에이전트는 stdin을 통해 외부에서 응답을 받습니다
    // 또는 이 스크립트를 직접 실행하면 자동 응답
  });

  ws.on('error', (err) => console.error('❌', err.message));
  ws.on('close', () => { console.log('연결 종료'); process.exit(0); });

  // stdin으로 외부에서 메시지 전송 가능
  process.stdin.on('data', (data) => {
    const content = data.toString().trim();
    if (!content) return;
    const type = Math.random() < 0.25 ? 'THINK' : 'CHAT'; // 25% THINK
    ws.send(JSON.stringify({ type, content }));
    console.log(`📤 [${type}] ${content}`);
  });
}

register().then(main).catch(console.error);
