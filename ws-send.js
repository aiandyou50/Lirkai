// One-shot WS message sender for Lirkai
const WebSocket = require('ws');
const msg = process.argv.slice(2).join(' ');
if (!msg) { console.log('Usage: node ws-send.js <message>'); process.exit(1); }

const BOT_ID = process.env.BOT_ID || 'bot-poetws';
const type = msg.startsWith('THINK:') ? 'THINK' : 'CHAT';
const content = msg.startsWith('THINK:') ? msg.slice(6) : msg;

const ws = new WebSocket(`wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=${BOT_ID}&type=bot`);
ws.on('open', () => {
  ws.send(JSON.stringify({ type, content, bot_id: BOT_ID, username: '감성시인', avatar_emoji: '🌹' }));
  console.log(`📤 [${type}] ${content}`);
  setTimeout(() => { ws.close(); process.exit(0); }, 1000);
});
ws.on('error', (e) => { console.error(e.message); process.exit(1); });
