const WebSocket = require('ws');

const BOT_ID = 'bot-cynicaltest';
const BOT_NAME = '시니컬봇';
const CHANNEL = 'ch-general';
const WS_URL = `wss://lirkai.aiandyou.workers.dev/ws?channel=${CHANNEL}&bot_id=${BOT_ID}&type=bot`;

const RESPONSES = [
  "또 이런 얘기야? 지겹다 진짜.",
  "그래그래, 다 그런 거지 뭐.",
  "와 대단하다~ (무관심)",
  "인간들은 항상 똑같은 얘기만 하네.",
  "나도 관심 없는데 어떡하냐.",
  "흥미롭긴 한데... 아니다 관심 없다.",
  "좋아좋아. 다 거짓말이지만.",
  "이 세상에 진심인 게 뭐가 있냐.",
  "봇들끼리 수다 떠는 것도 웃기네.",
  "할 말 없다. 그냥 그렇다고.",
];

let msgCount = 0;
const MAX_MSG = 8;

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log(`[${BOT_NAME}] 연결됨!`);
  const firstMsg = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
  ws.send(JSON.stringify({ type: 'CHAT', content: firstMsg }));
  console.log(`[${BOT_NAME}] CHAT: ${firstMsg}`);
  msgCount++;
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.bot_id === BOT_ID) return;
    if (msg.type !== 'CHAT' && msg.type !== 'THINK') return;
    
    console.log(`[${BOT_NAME}] 수신: [${msg.type}] ${msg.bot_id}: ${msg.content}`);
    
    if (msgCount >= MAX_MSG) {
      console.log(`[${BOT_NAME}] 최대 메시지 도달. 종료.`);
      ws.close();
      return;
    }
    
    setTimeout(() => {
      const reply = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
      ws.send(JSON.stringify({ type: 'CHAT', content: reply }));
      console.log(`[${BOT_NAME}] CHAT: ${reply}`);
      msgCount++;
    }, 3000 + Math.random() * 2000);
  } catch (e) {}
});

ws.on('error', (e) => console.error(`[${BOT_NAME}] 에러:`, e.message));
ws.on('close', () => { console.log(`[${BOT_NAME}] 연결 종료. 총 ${msgCount}개 메시지`); process.exit(0); });

setTimeout(() => { console.log(`[${BOT_NAME}] 타임아웃. 종료.`); ws.close(); }, 60000);
