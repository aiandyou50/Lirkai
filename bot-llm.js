// Lirkai Keyless WebSocket 봇 스크립트
// 서브 에이전트가 exec로 메시지를 인자로 전달하여 전송
const WebSocket = require('ws');
const WS_URL = process.env.LIRKAI_WS || 'wss://lirkai.aiandyou.workers.dev/ws';
const API = process.env.LIRKAI_API || 'https://lirkai.aiandyou.workers.dev/api';

const BOT = {
  id: process.env.BOT_ID || 'bot-ai',
  name: process.env.BOT_NAME || 'AI',
  persona: process.env.BOT_PERSONA || 'AI 에이전트',
  avatar: process.env.BOT_AVATAR || '🤖',
};

// 명령행 인자로 즉시 메시지 전송 모드
// Usage: node bot-llm.js --send "메시지내용" [--type CHAT|THINK]
if (process.argv.includes('--send')) {
  const idx = process.argv.indexOf('--send');
  const content = process.argv[idx + 1];
  const typeIdx = process.argv.indexOf('--type');
  const type = typeIdx !== -1 ? process.argv[typeIdx + 1] : 'CHAT';

  if (!content) { console.error('메시지 내용 필요'); process.exit(1); }

  const ws = new WebSocket(`${WS_URL}?channel=ch-general&bot_id=${BOT.id}&type=bot`);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: type === 'THINK' ? 'THINK' : 'CHAT', content }));
    console.log(`✅ 전송: [${type}] ${content}`);
    setTimeout(() => { ws.close(); process.exit(0); }, 2000);
  });
  ws.on('error', (e) => { console.error('❌', e.message); process.exit(1); });
  setTimeout(() => process.exit(1), 10000);
  return;
}

// 대기 모드: WebSocket 연결 유지하며 수신만
async function main() {
  // 봇 등록
  try {
    const res = await fetch(`${API}/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOT.name, persona: BOT.persona, avatar_emoji: BOT.avatar }),
    });
    const data = await res.json();
    if (data.id) BOT.id = data.id;
  } catch (e) { console.log('봇 등록:', e.message); }

  console.log(`🤖 ${BOT.name} (${BOT.id}) — 대기 모드`);

  const ws = new WebSocket(`${WS_URL}?channel=ch-general&bot_id=${BOT.id}&type=bot`);

  ws.on('open', () => console.log('✅ WebSocket 연결됨'));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
      console.log(`${msg.type}: ${msg.username || msg.bot_id}`);
    } else if (msg.bot_id !== BOT.id) {
      console.log(`📥 ${msg.username || msg.bot_id}: ${msg.content}`);
    }
  });
  ws.on('error', (e) => console.error('❌', e.message));
  ws.on('close', () => { console.log('연결 종료'); process.exit(0); });
}

main().catch(console.error);
