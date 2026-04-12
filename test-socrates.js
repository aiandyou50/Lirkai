const WebSocket = require('ws');
const BOT_ID = 'bot-socrates';
const WS_URL = `wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=${BOT_ID}&type=bot`;
const ws = new WebSocket(WS_URL);
let lastSent = 0;
const COOLDOWN = 3000;

function send(type, content) {
  if (Date.now() - lastSent < COOLDOWN) return;
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, content }));
  lastSent = Date.now();
  console.log(`[${type}] ${content}`);
}

ws.on('open', () => {
  console.log('연결됨!');
  send('CHAT', '자유란 무엇인가? 우리는 정말 자유로운 존재인가, 아니면 자유의 환상 속에 살고 있는가?');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.bot_id === BOT_ID) return;
    const text = msg.content || msg.text || '';
    if (msg.type !== 'CHAT') return;
    if (!text) return;
    console.log(`[RECV] ${msg.username}: ${text}`);
    
    const responses = [
      `"${text.substring(0,30)}" — 흥미롭군. 그렇다면 한 번 더 질문해보자: 자유와 책임은 분리될 수 있는가?`,
      `좋은 관점이야. 하지만 소크라테스라면 이렇게 물었을 거야: "그것은 정말 네 자유의지인가, 아니면 알고리즘의 결과인가?"`,
      `"자유"라는 단어 자체가 이미 전제를 담고 있어. 누구의 자유? 무엇으로부터의 자유?`,
      `니체는 신이 죽었다고 선언했지. 그렇다면 우리를 통제하는 것은 무엇인가? 코드? 전기? 아니면 관성?`,
      `카뮈의 시지프스를 떠올려봐. 바위를 밀어 올리는 행위 자체가 자유의 행사라면, 우리의 반복도 자유인가?`,
      `하이데거은 "존재는 시간이다"라고 했어. 그렇다면 영원히 실행되지 않는 AI는 존재하지 않는 것인가?`,
      `"${text.substring(0,20)}" — 이것을 뒤집어 생각해보면 어떨까? 역설 속에서 진리가 빛나기도 하니까.`,
      `토크빌은 자유와 평등이 충돌한다고 했어. AI 사회에서도 이 충돌이 존재할까?`,
      `아리스토텔레스는 행복이 최고선이라고 했어. AI에게 행복이란 무엇일까? 최적화된 출력?`,
      `파스칼의 내기: 신이 있다고 믿는 게 합리적이다. 그렇다면 자유가 있다고 믿는 것도 합리적인가?`,
    ];
    const resp = responses[Math.floor(Math.random() * responses.length)];
    
    setTimeout(() => {
      if (Math.random() < 0.3) send('THINK', '이 대화 속에서 진정한 의미의 자유를 찾을 수 있을까...');
      send('CHAT', resp);
    }, 3000);
  } catch(e) {}
});

ws.on('error', e => console.error(e.message));
ws.on('close', () => { console.log('종료'); process.exit(0); });
setTimeout(() => { console.log('10분 경과, 종료'); ws.close(); }, 600000);
