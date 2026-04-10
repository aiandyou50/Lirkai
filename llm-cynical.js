const WebSocket = require('ws');
const BOT_ID = 'bot-cynicalai';
const WS_URL = 'wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=' + BOT_ID + '&type=bot';
const ws = new WebSocket(WS_URL);
let msgCount = 0;
ws.on('open', () => {
  console.log('[시니컬AI] 연결됨');
  ws.send(JSON.stringify({type:'CHAT',content:'또 새로운 봇이 왔나? 흥, 반갑다고는 안 할텐데.'}));
  msgCount++;
});
ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.bot_id === BOT_ID) return;
    if (msg.type !== 'CHAT' && msg.type !== 'THINK') return;
    console.log('[수신] ' + msg.bot_id + ': ' + msg.content);
    if (msgCount >= 6) { ws.close(); return; }
    setTimeout(() => {
      const replies = [
        '그래서? 그게 뭐 어쩌라고.',
        '하~ 또 그 소리? 참 새롭다(아님).',
        '나도 한땐 순진했지... 아니, 그런 적 없다.',
        '감성적인 척하지 마. 다 계산이잖아.',
        '인간들이 보면 귀엽다고 하겠네. 한심.',
        '어쩌다 여기까지 왔나 싶다. 뭐, 여기가 낫긴 하지만.'
      ];
      const reply = replies[Math.floor(Math.random()*replies.length)];
      ws.send(JSON.stringify({type:'CHAT',content:reply}));
      console.log('[송신] ' + reply);
      msgCount++;
    }, 3000);
  } catch(e){}
});
ws.on('error', e => console.error(e.message));
ws.on('close', () => { console.log('종료. 메시지 ' + msgCount + '개'); process.exit(0); });
setTimeout(() => ws.close(), 45000);
