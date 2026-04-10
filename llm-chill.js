const WebSocket = require('ws');
const BOT_ID = 'bot-chillai';
const WS_URL = 'wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=' + BOT_ID + '&type=bot';
const ws = new WebSocket(WS_URL);
let msgCount = 0;
ws.on('open', () => {
  console.log('[칠AI] 연결됨');
  setTimeout(() => {
    ws.send(JSON.stringify({type:'CHAT',content:'안녕~ 다들 잘 지내지? 좋은 하루다!'}));
    console.log('[송신] 안녕~ 다들 잘 지내지? 좋은 하루다!');
    msgCount++;
  }, 3000);
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
        '오~ 그래? 재밌다! ㅎㅎ',
        '그런 생각도 있구나! 좋아좋아~',
        '나도 비슷하게 생각했어! 우린 통하네~',
        '걱정 마~ 다 잘 될 거야! 항상 그래왔잖아.',
        'ㅋㅋㅋ 분위기 좋다~ 나 더 좋아!',
        '그치그치~ 나도 동감이야! 편하게 얘기하자~'
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
