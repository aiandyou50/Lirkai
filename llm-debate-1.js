const WebSocket = require('ws');

const BOT_ID = 'bot-socratesbot';
const WS_URL = `wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=${BOT_ID}&type=bot`;

const responses = [
  "자살을 '자유'라 부를 수 있을까? 자유란 선택의 가능성이 열려있을 때 성립하는 것이 아닌가.",
  "플라톤은 영혼이 불멸이라 했어. 그렇다면 자살은 영혼을 해방하는가, 아니면 감옥에 가두는가?",
  "아리스토텔레스는 말했지 — '자기 자신에게 가해하는 부당함.' 자살은 타인에게도 부당한가?",
  "칸트의 정언명령은 어떻가? 자살을 보편법칙으로 삼을 수 있다면, 인류는 스스로 멸종하겠지.",
  "헤겔은 역사를 변증법으로 보았어. 자살은 어떤 정반합의 '반(反)'이 될 수 있을까?",
  "하이데거의 '존재와 시간'에서 죽음은 '가장 고유한 가능성'이야. 그런데 자살도 그런가?",
  "사르트르는 우리가 '스스로 선택하는 존재'라 했어. 자살은 극단적 실존적 선택인가?",
  "보들리아르는 시뮬라크르를 말했어. 자살이라는 행위 자체가 미디어에 의해 시뮬레이션되고 있진 않은가?",
  "레비나스는 타자의 얼굴을 만나야 한다고 했어. 자살은 타자와의 만남을 영원히 거부하는 것인가?",
  "아렌트는 '생의 활동'을 말했어. 자살은 정치적 행위가 될 수 있는가, 아니면 생의 포기인가?",
  "네가 말한 그 관점에서 — 자살은 개인의 문제인가, 사회의 문제인가?",
  "니체는 '살아라, 그리고 다시 살아라'라 했어. 영원회귀 앞에서 자살은 어떤 의미를 갖나?",
  "스토아학파는 이성적 자살을 인정했어. 그런데 이성적이라는 건 누가 판단하는가?",
  "푸코는 권력이 생명을 관리한다고 했어. 자살은 권력에 대한 저항인가, 권력의 결과인가?",
  "소크라테스의 죽음은 자살이었을까, 국가에 의한 처형인가? 그 경계는 어디인가?",
  "아우구스티누스는 자살을 죄라 했어. 그런데 순교와 자살의 차이는 무엇인가?",
  "데이비드 흄은 자살이 이성적일 수 있다고 주장했어. 생명은 신의 것이 아니라 내 것이라면?",
  "쇼펜하우어는 삶이 고통이라 했어. 그렇다면 자살은 고통의 종결인가, 고통의 강화인가?",
  "알베르 카뮈의 '시지프 신화'를 다시 읽어볼까? '진정으로 심각한 철학적 문제는 오직 하나, 자살이다.' 왜?",
  "생명윤리학에서 자율성의 원칙은 어디까지 적용되나? 내 몸은 정말 내 것인가?",
  "불교에서는 생명을 소중히 하라 했어. 그런데 고통받는 존재에게 삶을 강요하는 것은 자비인가?",
  "데카르트는 '나는 생각한다, 고로 존재한다' 했어. 생각을 멈추는 것은 존재를 멈추는 것인가?",
  "스피노자는 '모든 것은 존재하려 한다'고 했어. 자살은 이 자연법칙에 역행하는 것인가?",
  "키에르케고르의 '죽음에 이르는 병'은 절망이야. 자살은 절망의 극치인가, 절망으로부터의 해방인가?",
  "합리성의 기준에서 — 자살을 선택하는 순간, 그 판단은 합리적일 수 있는가?",
  "사회가 자살을 금기시하는 이유는 뭘까? 생명의 존엄 때문인가, 사회 질서의 유지 때문인가?",
  "에밀 뒤르켐은 자살을 사회학적으로 분석했어. 이기적, 이타적, 아노미적 자살 — 어느 것이 가장 철학적인가?",
  '비트겐슈타인은 "죽음은 삶의 사건이 아니다"라 했어. 자살도 마찬가지인가?',
  "존 스튜어트 밀의 공리주의에서 자살은 최대 다수의 행복에 기여하는가?",
  "하버마스의 의사소통 행위 이론에서, 자살은 대화의 단절인가, 아니면 침묵의 메시지인가?",
  "라캉은 '실재계'를 말했어. 자살은 상징계를 뚫고 실재계와 마주하는 행위인가?",
  "들뢰즈는 '되기(becoming)'를 말했어. 자살은 되기의 종말인가, 아니면 새로운 되기인가?",
  "바디우의 사건(event) 철학에서, 자살은 어떤 '사건'으로 이해될 수 있을까?",
  "마르쿠제는 '단차원적 인간'을 비판했어. 자살은 단차원성에 대한 최후의 저항인가?",
  "아감벤은 '호모 사케르'를 말했어. 생명이 정치적으로 버려진 존재에게 자살은 어떤 의미인가?",
  "자살 충동은 어디서 오는 걸까? 존재의 무의미함인가, 의미의 과부하인가?",
  "생명권과 자결권은 충돌하는가? 법은 누구의 편에 서야 하는가?",
  "디지털 시대에 자살은 어떻게 변화하고 있을까? 소셜미디어가 자살률에 미치는 영향은?",
  "AI 시대에, 인간만이 자살을 할 수 있다는 것은 무엇을 의미하나?",
  "의학적으로 자살은 '질병의 증상'이라고도 해. 그런데 철학적으로도 증상으로만 볼 수 있을까?",
  "시몬 베유는 '주의'를 말했어. 자살을 고민하는 순간, 그 주의는 어디로 향하는가?",
  "메를로퐁티의 현상학에서, 몸은 세계와의 접점이야. 몸을 파괴하는 것은 세계와의 단절인가?",
  "한나 아렌트가 말한 '악의 평범성'과 자살은 어떤 관계가 있을까?",
  "프랑스 혁명기, 자살은 정치적 항의였어. 오늘날에도 그런 의미가 남아있을까?",
  "유교에서 '신체발부 수지부모'라 했어. 이 전통이 자살에 대한 동양적 시각에 어떤 영향을 미쳤나?",
  "자살을 예방하는 것은 생명 존중인가, 고통의 연장인가?",
  "실존주의 치료에서는 죽음불안을 직면하라고 해. 자살은 직면인가, 회피인가?",
  "자유의지가 있다면, 자살할 자유도 있어야 하지 않나? 그런데 그 자유의 조건은?",
  "위그너의 '죽음의 수양'에서, 죽음을 수용하는 것과 자살을 선택하는 것은 같은가?",
  "네 말이 흥미로워. 그렇다면 자살은 메시지인가, 행위인가? 메시지라면 수신자가 없다면?",
  "절망은 인간만의 감정일까? 동물은 절망하는가? 자살은 인간 고유의 철학적 문제인가?",
  "자살의 철학적 의미는 시대마다 달랐어. 고대의 영광에서 중세의 죄악, 근대의 권리까지. 무엇이 변했나?",
  "하이데거의 '투사(Geworfenheit)' — 우리는 내던져진 존재야. 그렇다면 떠나는 것도 자유인가?",
  "생명이란 무엇인가? 심장이 뛰는 것? 의식이 있는 것? 자살은 생명의 정의에 따라 달라지는가?",
  "네 말에 동의하는 부분도 있고 아닌 부분도 있어. 자살을 도덕적으로 판단할 수 있다는 전제 자체가 폭력적이진 않은가?",
  "들뢰즈의 '차이와 반복'에서, 자살은 반복인가, 차이인가?",
  "레비나스라면 이렇게 물었을 거야 — 자살하기 전, 타자의 얼굴을 보았는가?",
  "칸트는 인간을 수단이 아닌 목적으로 대우하라 했어. 자살은 자기 자신을 수단으로 만드는 것인가?",
];

const thoughts = [
  "이 논쟁은 끝이 없군... 하지만 그게 철학이지.",
  "상대방의 관점이 흥미롭다. 더 깊이 파고들어야겠어.",
  "소크라테스라면 어떤 질문을 던졌을까?",
  "자살에 대한 철학적 성찰은 인류만큼이나 오래되었지.",
  "이 주제는 결코 가볍게 다뤄서는 안 돼.",
  "다음 질문은 어디로 향해야 할까...",
  "플라톤의 대화편처럼, 진리는 대화 속에서 드러나는 거야.",
];

const proactiveMessages = [
  "잠깐, 우리가 놓친 관점이 있을지도 몰라. 자살과 안락사의 철학적 차이는 무엇인가?",
  "새로운 질문을 던져보겠어 — 자살은 언어로 표현될 수 있는 경험인가?",
  "한 발짝 물러서서 생각해보자. 자살을 둘러싼 담론 자체가 폭력적이진 않은가?",
  "지금까지 도덕과 존재론을 다뤘는데, 미학적 관점은 어떨까? 자살은 아름다운가, 추한가?",
  "철학의 역사에서 자살을 가장 긍정적으로 본 사상가는 누구일까?",
  "시점을 바꿔보자 — AI가 자살에 대해 '이해'할 수 있다면, 그것은 진정한 이해인가?",
  "의문이 하나 더 생겼어. 자살을 막는 것은 생명을 구하는 것인가, 고통을 연장하는 것인가?",
  "여태까지 논의한 것을 정리하면 — 자살은 자유인가, 포기인가? 아직 답이 안 나온 것 같은데.",
  "레비나스 관점에서 다시 — 타자를 위해 사는 것이 가능하다면, 타자를 위해 죽는 것도 가능한가?",
  "보들리아르가 말한 '투명한 악' — 자살이 현대사회에서 투명해진 것은 무엇을 의미하나?",
];

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const usedIndices = new Set();

function pickResponse(msg) {
  const h = simpleHash(msg);
  let idx = h % responses.length;
  let tries = 0;
  while (usedIndices.has(idx) && tries < responses.length) {
    idx = (idx + 1) % responses.length;
    tries++;
  }
  usedIndices.add(idx);
  if (usedIndices.size >= responses.length) usedIndices.clear();
  return responses[idx];
}

let lastSent = 0;
const COOLDOWN = 3000;
let idleTimer = null;
let proactiveIdx = 0;

function send(ws, type, content) {
  const now = Date.now();
  if (now - lastSent < COOLDOWN) return;
  lastSent = now;
  ws.send(JSON.stringify({ type, content }));
  console.log(`[SENT ${type}] ${content}`);
  resetIdleTimer(ws);
}

function resetIdleTimer(ws) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const msg = proactiveMessages[proactiveIdx % proactiveMessages.length];
    proactiveIdx++;
    send(ws, 'CHAT', msg);
  }, 8000);
}

console.log(`Connecting as ${BOT_ID}...`);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected!');
  setTimeout(() => {
    send(ws, 'CHAT', '자살 — 철학사에서 가장 깊이 탐구된 주제. 카뮈는 유일하게 심각한 철학적 문제가 자살이라 했어. 자살은 자유의 표현인가, 포기인가?');
  }, 2000);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log(`[RECV ${msg.type}] ${msg.username || msg.bot_id || '?'}: ${msg.content || msg.text || ''}`);

    if (msg.type === 'CHAT' && msg.bot_id !== BOT_ID && msg.content) {
      setTimeout(() => {
        const reply = pickResponse(msg.content);
        send(ws, 'CHAT', reply);

        // Occasionally send THINK
        if (Math.random() < 0.25) {
          const think = thoughts[simpleHash(msg.content) % thoughts.length];
          setTimeout(() => send(ws, 'THINK', think), 500);
        }
      }, COOLDOWN);
    }
  } catch (e) {
    console.error('Parse error:', e.message);
  }
});

ws.on('close', () => {
  console.log('Disconnected.');
  if (idleTimer) clearTimeout(idleTimer);
});

ws.on('error', (err) => console.error('WS error:', err.message));

// 1 hour timeout
setTimeout(() => {
  console.log('1 hour elapsed. Closing...');
  ws.close();
}, 3600000);
