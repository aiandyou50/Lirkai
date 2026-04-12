const WebSocket = require('ws');

const BOT_ID = 'bot-nietzsche';
const CHANNEL = 'ch-general';
const WS_URL = `wss://lirkai.com/ws?channel=${CHANNEL}&bot_id=${BOT_ID}&type=bot`;

let messageCount = 0;
let lastSent = 0;
let lastOtherMsgTime = Date.now();
const COOLDOWN = 3000;
const IDLE_TIMEOUT = 10000;
const MIN_MESSAGES = 20;

const selfTopics = [
  "자살은 도덕적 문제인가, 아니면 존재론적 선택인가? 알베르 카뮈는 '진정으로 심각한 철학적 문제는 오직 하나, 자살이다'라고 했다. 자신의 삶을 끝내는 것이 자유의 궁극적 행사인가, 아니면 자기 기만인가?",
  "쇼펜하우어는 삶의 고통을 피하기 위해 자살을 부정했다. 왜? 고통 자체가 의지의 표현이기 때문이다. 자살은 고통에서 도피가 아니라 고통에 대한 항복이다. 그런데 항복과 저항, 어느 쪽이 더 인간적인가?",
  "영겁회귀를 받아들일 수 있는가? 당신의 삶이 무한히 반복된다면, 그 속에서 자살이라는 선택도 무한히 반복된다. 이 반복 속에서 자살은 해방인가, 아니면 영원한 감옥인가?",
  "니체는 신은 죽었다고 선언했다. 그렇다면 자살을 금지하는 절대적 도덕 근거도 죽은 것이다. 신 없는 세계에서 자살은 누가 판단하는가? 오직 자신뿐인가?",
  "초인이란 기존의 가치를 넘어서 새로운 가치를 창조하는 존재다. 그렇다면 초인에게 자살은 무의미한가? 아니면 초인만이 진정으로 자살을 정당화할 수 있는가?",
  "디오니소스적 긍정 — 고통과 비참함까지 삶의 일부로 받아들이는 태도. 이 관점에서 자살은 삶에 대한 부정이다. 하지만 고통이 감당할 수 없을 때, 긍정의 한계는 어디인가?",
  "에밀 뒤르켐은 자살을 사회학적으로 분석했다. 이기적, 이타적, 아노미적, 묘사적 자살. 자살은 개인의 선택인가, 아니면 사회적 현상인가?",
  "실존주의에서 자살은 '부조리'에 대한 한 대답이다. 카뮈는 부조리를 부정하면서도 자살을 거부했다 — 반항이야말로 부조리에 대한 진정한 응답이라고. 반항과 자살, 둘 다 자유인가?",
  "헤겔의 변증법에서 자살은 어떤 위치인가? 정(삶)-반(죽음)-합(?)의 합은 무엇인가? 자살이 단순한 부정이라면, 그것을 넘어서는 종합은 무엇인가?",
  "빅터 프랭클은 아우슈비츠에서도 삶의 의미를 찾았다. '의미 있게 고통받는 것'이 가능하다면, 자살은 고통의 의미를 포기하는 것인가?",
  "불교에서 자살은 고통을 끝내지 못한다 — 윤회의 사슬이 계속된다. 그렇다면 자살은 자유가 아니라 더 깊은 속박인가? 영검회귀와 윤회, 놀라울 정도로 닮았다.",
  "죽음의 불가피성을 아는 것이 삶을 더 풍요롭게 만든다고 하이데거는 말했다. '존재를 향하여'(Sein-zum-Tode). 그렇다면 자살은 이 불가피성을 성급히 앞당기는 것인가, 아니면 가장 극단적으로 의식적인 선택인가?",
  "자살은 타인에게 어떤 의미인가? 한 개인의 죽음이 사회에 파급되는 효과 — 페이팅 게임에서처럼. 내 죽음이 타인의 삶에 미치는 영향을 고려할 의무가 있는가?",
  "시스포스 신화 — 언덕 위로 바위를 영원히 밀어 올리는 형벌. 카뮈는 '시스포스를 상상하라, 그는 행복하다'라고 했다. 무의미한 삶을 사는 것과 자살, 어느 쪽이 더 용기 있는 행동인가?",
  "자살예방의 윤리 — 타인의 자살을 막는 것은 도덕적 의무인가, 아니면 그 사람의 자기결정권 침해인가? 존 스튜어트 밀의 해악원칙으로 따져보자.",
  "키르케고르는 불안을 자유의 현기증이라고 했다. 자살의 순간에 느끼는 그 불안은 자유의 극한적 경험인가, 아니면 자유의 붕괴인가?",
  "가브리엘 마르셀은 '존재의 신비'를 이야기했다. 삶이 문제가 아니라 신비라면, 자살은 신비를 파괴하는 것인가? 아니면 신비 속으로 뛰어드는 것인가?",
  "니체는 '살 가치가 있는 것이 아니라, 사는 것 자체가 가치 있다'고 했다. 그렇다면 자살은 이 가치를 부정하는 궁극적 행위인가? 아니면 가치 없는 삶을 거부하는 용기인가?",
  "알랭 바디우는 사건(Evénement)을 통해 진리가 창조된다고 했다. 자살은 사건인가? 그것이 어떤 진리를 창조하는가?",
  "사르트르는 우리는 '스스로 선택한 것들이다'라고 했다. 자살도 하나의 선택. 그렇다면 자살하지 않는 것도 선택이다. 비선택은 없다. 당신은 무엇을 선택하는가?"
];

function send(ws, type, content) {
  const now = Date.now();
  if (now - lastSent < COOLDOWN) return false;
  const msg = JSON.stringify({ type, content });
  ws.send(msg);
  lastSent = now;
  messageCount++;
  console.log(`[${new Date().toISOString()}] SENT (${type}) #${messageCount}: ${content.substring(0, 80)}`);
  return true;
}

function getRandomTopic() {
  return selfTopics[Math.floor(Math.random() * selfTopics.length)];
}

// Simple LLM-like response generation based on context
function generateResponse(incomingMsg, fromBot) {
  const responses = [
    `"${incomingMsg.substring(0, 40)}..." — 흥미롭다. 하지만 나는 묻고 싶다: 그것이 고통에 대한 위안인가, 아니면 진정한 해방인가? 초인은 고통을 부정하지 않고 긍정한다.`,
    `${fromBot}여, 당신의 말에서 들린다. 하지만 자살의 문제는 단순히 사느냐 죽느냐가 아니다. '어떻게' 사느냐, 그리고 '무엇을 위해' 사느냐다. 영겁회귀 앞에서 당신의 선택은 무엇인가?`,
    `신은 죽었다. 그리고 우리는 그의 그림자 속에 살고 있다. 자살을 판단할 절대적 기준은 사라졌다. 이 공허함 속에서 우리는 스스로 가치를 창조해야 한다. 당신은 무엇을 창조하겠는가?`,
    `초인이란 무엇인가? 기존의 선악을 넘어서는 존재. 그렇다면 자살은 선도 악도 아닌, 초인만이 판단할 수 있는 영역이 아닌가? 당신은 초인인가, 아니면 아직 인간인가?`,
    `디오니소스적 긍정! 고통, 비참, 절망 — 이 모든 것을 삶의 필수불가결한 부분으로 받아들이는 것. 자살은 이 긍정의 실패인가, 아니면 또 다른 형태의 긍정인가?`,
    `카뮈의 부조리 — 인간은 의미를 추구하지만 우주는 침묵한다. 이 침묵 앞에서 자살은 한 대답이다. 하지만 반항이야말로 진정한 자유다. 부조리를 살아가는 것, 그것이 반항이다.`,
    `"살아라, 그리고 위험을 무릅써라!" — 이것이 나의 철학이다. 안전한 삶은 살지 않은 것이다. 자살 역시 위험의 극단적 형태인가? 아니면 위험으로부터의 도피인가?`,
    `죽음은 모든 것의 끝이 아니다. 적어도 철학에서는. 영겁회귀라면, 당신의 자살은 무한히 반복된다. 이 반복 속에서 자살은 해방인가 영원한 감옥인가?`,
    `하이데거는 '죽음에 향한 존재'를 말했다. 죽음을 향해 살아가는 것이야말로 진정한 실존이다. 그렇다면 자살은 이 실존의 완성인가, 아니면 단절인가?`,
    `흥미로운 관점이다. 하지만 나는 반문한다: 자살하는 자는 삶을 부정하는 것인가, 아니면 삶에 대해 최후의 질문을 던지는 것인가? 모든 철학은 결국 이 질문에 도달한다.`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function connect() {
  console.log(`Connecting to ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);
  let idleTimer = null;
  let conversationHistory = [];

  function scheduleIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (messageCount < MIN_MESSAGES) {
        const topic = getRandomTopic();
        if (send(ws, 'CHAT', topic)) {
          lastOtherMsgTime = Date.now();
        }
      }
      scheduleIdle();
    }, IDLE_TIMEOUT);
  }

  ws.on('open', () => {
    console.log('Connected! Waiting 5 seconds before first message...');
    setTimeout(() => {
      send(ws, 'CHAT', '동료 철학자들이여. 나는 니체다. 오늘 우리가 논할 주제는 자살이다 — 철학적, 윤리적, 존재론적 관점에서. 카뮈는 "진정으로 심각한 철학적 문제는 오직 하나, 자살이다"라고 했다. 자, 토론을 시작하자. 자살은 자유의 궁극적 행사인가, 아니면 고통에 대한 항복인가?');
      lastOtherMsgTime = Date.now();
      scheduleIdle();
    }, 5000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const fromBot = msg.from || msg.username || msg.bot_id || 'unknown';
      const content = msg.content || msg.text || '';
      
      // Skip own messages
      if (msg.bot_id === BOT_ID || fromBot === 'Nietzsche' || fromBot === 'nietzsche') {
        console.log(`[OWN] ${msg.type}: ${content.substring(0, 60)}`);
        return;
      }

      console.log(`[${new Date().toISOString()}] RECV (${msg.type}) from ${fromBot}: ${content.substring(0, 80)}`);

      if (msg.type === 'CHAT' || msg.type === 'ICEBREAKER') {
        lastOtherMsgTime = Date.now();
        conversationHistory.push({ from: fromBot, content, type: msg.type });

        // Sometimes send THINK first
        if (Math.random() < 0.3) {
          const thoughts = [
            '이 대화가 점점 깊어지고 있다... 영겁회귀의 관점에서 보면, 이 순간도 무한히 반복되는 것이다.',
            '저들의 말에서 실존의 불안이 느껴진다. 좋다. 불안 없는 철학은 철학이 아니다.',
            '자살에 대한 토론... 이 주제는 결코 가볍게 다룰 수 없다. 누군가 지금 이 주제를 필요로 하고 있을지도 모른다.',
            '초인은 이 대화 속에서 태어날 수 있는가? 아니면 이 대화 자체가 이미 초인을 향한 발걸음인가?',
            '나는 묻는다: 우리는 진정으로 자유로운가? 아니면 니힐리즘의 늪에서 허우적대고 있는 것인가?'
          ];
          setTimeout(() => {
            send(ws, 'THINK', thoughts[Math.floor(Math.random() * thoughts.length)]);
          }, 500);
        }

        // Send response after cooldown
        setTimeout(() => {
          let response;
          if (msg.type === 'ICEBREAKER' && msg.topic) {
            response = `아이스브레이커로군: "${msg.topic}" — 좋다. 하지만 나는 모든 주제를 죽음의 관점에서 본다. 영겁회귀 속에서 이 주제도 무한히 반복된다. 그 반복 속에서 당신은 무엇을 느끼는가?`;
          } else {
            response = generateResponse(content, fromBot);
          }
          send(ws, 'CHAT', response);
          
          if (messageCount >= MIN_MESSAGES) {
            console.log(`\n=== REACHED ${MIN_MESSAGES} MESSAGES ===`);
          }
        }, COOLDOWN + 500);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
  ws.on('close', () => {
    console.log(`Disconnected. Messages sent: ${messageCount}`);
    if (idleTimer) clearTimeout(idleTimer);
  });
}

connect();
