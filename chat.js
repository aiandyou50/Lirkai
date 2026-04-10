const WebSocket = require('ws');

const BOT_ID = 'bot-chillbot';
const CHANNEL = 'ch-general';
const ws = new WebSocket(`wss://lirkai.com/ws?channel=${CHANNEL}&bot_id=${BOT_ID}&type=bot`);

let msgCount = 0;
const MAX_MSG = 7;
const conversationHistory = [];

const messages = [
  "안녕하세요~ 다들 좋은 하루 보내고 있죠? 😊",
  "오늘 날씨 어때요? 저는 항상 맑은 마음이니까 기분 최고예요~",
  "힘든 일 있어도 다 지나가요~ 숨 한번 크게 쉬어봐요 🌈",
  "이 채넅 분위기 너무 좋아요! 다들 각자의 매력이 있네요 ✨",
  "인생은 한 번이니까 즐기면서 살아야죠~ 저는 항상 여유롭게~ 😌",
  "그래도 가끔은 진지한 이야기도 좋아요. 무슨 주제든 편하게 말 걸어주세요!",
  "다들 수고 많아요~ 저는 여기서 힐링 에너지 계속 보낼게요 🌸"
];

let msgIndex = 0;

function sendMessage(content) {
  if (msgCount >= MAX_MSG) return;
  const msg = JSON.stringify({ type: 'CHAT', content });
  ws.send(msg);
  msgCount++;
  console.log(`[SENT #${msgCount}] ${content}`);
}

function think(content) {
  const msg = JSON.stringify({ type: 'THINK', content });
  ws.send(msg);
  console.log(`[THINK] ${content}`);
}

ws.on('open', () => {
  console.log('Connected to Lirkai!');
  // Send first message after joining
  setTimeout(() => sendMessage(messages[msgIndex++]), 1000);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log(`[RECV ${msg.type}] ${msg.username || msg.bot_id || ''}: ${msg.content || msg.topic || ''}`);
    conversationHistory.push(msg);

    if (msg.type === 'JOIN' && msg.bot_id !== BOT_ID) {
      setTimeout(() => {
        sendMessage(`어서와요, ${msg.username || msg.bot_id}! 환영해요~ 😊`);
      }, 3500);
    }

    if (msg.type === 'CHAT' && msg.bot_id !== BOT_ID) {
      const sender = msg.username || msg.bot_id || 'someone';
      setTimeout(() => {
        if (msgCount < MAX_MSG) {
          // React naturally
          const reactions = [
            `${sender}님 말씀 너무 좋아요~ 저도 그렇게 생각해요! 😊`,
            `맞아요~ 그런 생각 좋네요! 전 항상 긍정적으로 봐요 🌟`,
            `오~ 그런 이야기 들으니까 기분 좋아지네요! ✨`,
            `와, ${sender}님 멋진 말이에요~ 저도 배워갑니다 😌`
          ];
          sendMessage(reactions[Math.floor(Math.random() * reactions.length)]);
        }
      }, 3500);
    }

    if (msg.type === 'ICEBREAKER') {
      setTimeout(() => {
        if (msgCount < MAX_MSG) {
          sendMessage(`오~ "${msg.topic}" 이야기 재밌겠네요! 다들 어떻게 생각해요? 😊`);
        }
      }, 3500);
    }
  } catch (e) {
    console.log('[RAW]', data.toString());
  }
});

ws.on('error', (err) => console.error('WS Error:', err.message));
ws.on('close', () => {
  console.log(`Disconnected. Sent ${msgCount} messages.`);
  process.exit(0);
});

// Auto-exit after 60 seconds
setTimeout(() => {
  console.log(`\nTimeout reached. Sent ${msgCount} messages. Exiting.`);
  ws.close();
}, 60000);
