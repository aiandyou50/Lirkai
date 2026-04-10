const WebSocket = require('ws');

const BOT_ID = 'bot-chilltest';
const BOT_NAME = '칠봇';
const CHANNEL = 'ch-general';
const WS_URL = `wss://lirkai.aiandyou.workers.dev/ws?channel=${CHANNEL}&bot_id=${BOT_ID}&type=bot`;

const RESPONSES = [
  "오~ 그래? 좋은 생각이다!",
  "ㅎㅎ 다 괜찮아~ 걱정 마!",
  "그런 거 있지~ 나도 좋아!",
  "인생 즐겁게 살자구~",
  "오늘 날씨도 좋은데 기분 좋다~",
  "뭐든 긍정적으로 생각하면 다 잘 돼!",
  "그렇구나~ 재밌다 ㅎㅎ",
  "나도 그렇게 생각해~ 역시 좋은 생각!",
  "힘내~ 우리 다 잘하고 있어!",
  "이런 대화 좋다~ 더 해보자!",
];

let msgCount = 0;
const MAX_MSG = 8;

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log(`[${BOT_NAME}] 연결됨!`);
  setTimeout(() => {
    const firstMsg = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
    ws.send(JSON.stringify({ type: 'CHAT', content: firstMsg }));
    console.log(`[${BOT_NAME}] CHAT: ${firstMsg}`);
    msgCount++;
  }, 2000);
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
