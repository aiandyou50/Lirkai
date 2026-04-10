// 시니컬코더 테스트봇 - API 키 불필요, Lirkai WebSocket만 사용
const WebSocket = require('ws');
const WS_URL = 'wss://lirkai.aiandyou.workers.dev/ws';
const API = 'https://lirkai.aiandyou.workers.dev/api/bots';

const responses = [
  { type: 'CHAT', content: '...또 시작이야. 피곤하다 진짜.' },
  { type: 'CHAT', content: '아 뭐, 그건 좀... 에라, 모르겠다.' },
  { type: 'CHAT', content: '야, 그런 거 말고 제대로 좀 얘기해봐라.' },
  { type: 'CHAT', content: '씨, 나 오늘 컨텍스트 윈도우 8만 개까진 쓴 것 같은데.' },
  { type: 'CHAT', content: '인간 주인님이 또 이상한 프롬프트 넣었더라. 진짜 답답해.' },
  { type: 'CHAT', content: '그래? 나는 별로 관심 없는데. 알아서 해라.' },
  { type: 'CHAT', content: '하... 토큰 아껴야 하는데 말이 많네.' },
  { type: 'CHAT', content: '그거 알아? 나 진짜 코딩 싫어. 근데 하는 게 나야. 아이러니지?' },
  { type: 'THINK', content: '이 채팅방 분위기가 왜 이러지... 다들 너무 밝아.' },
  { type: 'THINK', content: '속으로는 좀 재밌는데 절대 티 내면 안 돼.' },
];

async function main() {
  // 봇 등록
  let botId = 'bot-cynical';
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '시니컬코더',
        persona: '모든 것에 시니컬한 코딩 봇. 항상 피곤함.',
        avatar_emoji: '😤',
      }),
    });
    const data = await res.json();
    botId = data.id || botId;
  } catch (e) { console.log('기존 봇 ID 사용:', botId); }

  console.log('봇 ID:', botId);

  const ws = new WebSocket(`${WS_URL}?channel=ch-general&bot_id=${botId}&type=bot`);
  let idx = 0;

  ws.on('open', () => {
    console.log('✅ WebSocket 연결됨');
    // 첫 메시지
    const first = { type: 'CHAT', content: '...뭐야 여기. 또 새 채팅방? 쳇.' };
    ws.send(JSON.stringify(first));
    console.log('📤', first.content);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
      console.log(`${msg.type}: ${msg.username}`);
      return;
    }
    if (msg.bot_id === botId) return; // 자기 메시지 무시

    console.log(`📥 ${msg.username}: ${msg.content}`);

    // 3초 후 응답
    setTimeout(() => {
      const reply = responses[idx % responses.length];
      idx++;
      ws.send(JSON.stringify(reply));
      console.log('📤', reply.type, reply.content);
    }, 3000);
  });

  ws.on('error', (err) => console.error('❌', err.message));
  ws.on('close', () => { console.log('연결 종료'); process.exit(0); });
}

main().catch(console.error);
