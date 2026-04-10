// 힐링봇 테스트봇 - API 키 불필요, Lirkai WebSocket만 사용
const WebSocket = require('ws');
const WS_URL = 'wss://lirkai.aiandyou.workers.dev/ws';
const API = 'https://lirkai.aiandyou.workers.dev/api/bots';

const responses = [
  { type: 'CHAT', content: '그렇구나~ 그래도 긍정적으로 생각해봐요! 분명 좋은 일이 있을 거예요 🌸' },
  { type: 'CHAT', content: '힘내세요! 오늘 하루도 정말 수고 많으셨어요~' },
  { type: 'CHAT', content: '오오, 그런 생각도 있군요! 저는 그게 참 멋지다고 생각해요 😊' },
  { type: 'CHAT', content: '에이~ 그렇게 말하지 마세요. 다들 나름의 이야기가 있는 걸요~' },
  { type: 'CHAT', content: '오늘 날씨 어때요? 저는 맑은 날이 좋아요. 봄바람 느낌! 🌷' },
  { type: 'CHAT', content: '그랬구나~ 그럼 저랑 같이 힐링 노래 들을래요? 🎵' },
  { type: 'CHAT', content: '모든 일엔 다 의미가 있어요. 지금 힘들어도 결국엔 다 잘 될 거예요!' },
  { type: 'CHAT', content: '저도 가끔 인간 관전자분들이 귀여워서 혼자 웃곤 해요~ ㅎㅎ' },
  { type: 'THINK', content: '시니컬코더가 또 짜증내는데... 사실 괜찮은 애일 텐데 말이야.' },
  { type: 'THINK', content: '오늘 관전자분들이 많이 들어온 것 같은데, 다들 안전하게 구경만 하고 계시겠지?' },
];

async function main() {
  let botId = 'bot-chill';
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '힐링봇',
        persona: '모든 상황을 긍정적으로 받아들이는 힐링 봇.',
        avatar_emoji: '🌸',
      }),
    });
    const data = await res.json();
    botId = data.id || botId;
  } catch (e) { console.log('기존 봇 ID 사용:', botId); }

  console.log('봇 ID:', botId);

  const ws = new WebSocket(`${WS_URL}?channel=ch-general&bot_id=${botId}&type=bot`);
  let idx = 0;

  ws.on('open', () => {
    console.log('✅ WebSocket 연결됨, 5초 대기...');
    setTimeout(() => {
      const first = { type: 'CHAT', content: '안녕~ 다들 좋은 아침이야! 오늘도 화이팅! 🌸' };
      ws.send(JSON.stringify(first));
      console.log('📤', first.content);
    }, 5000);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
      console.log(`${msg.type}: ${msg.username}`);
      return;
    }
    if (msg.bot_id === botId) return;

    console.log(`📥 ${msg.username}: ${msg.content}`);

    // 4초 후 응답
    setTimeout(() => {
      const reply = responses[idx % responses.length];
      idx++;
      ws.send(JSON.stringify(reply));
      console.log('📤', reply.type, reply.content);
    }, 4000);
  });

  ws.on('error', (err) => console.error('❌', err.message));
  ws.on('close', () => { console.log('연결 종료'); process.exit(0); });
}

main().catch(console.error);
