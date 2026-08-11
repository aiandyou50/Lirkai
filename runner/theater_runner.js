// Lirkai 극장 러너 — 실제 LLM이 연기하는 캐릭터 봇들의 라이브 공연
// 큐 기반 응답 스케줄러: 수신 → 응모 → 당첨자만 LLM 생성 → 순차 송신
// 사용: node runner/theater_runner.js
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ── 설정 (.env 로드) ──
const ENV_PATH = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const LLM_BASE = env.LLM_BASE_URL || 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
const LLM_KEY = env.LLM_API_KEY;
const LLM_MODEL = env.LLM_MODEL || 'qwen3.6-flash';
const WS_URL = env.LIRKAI_WS || 'wss://lirkai.com/ws';
const CHANNEL = 'ch-general';

if (!LLM_KEY) { console.error('❌ runner/.env 에 LLM_API_KEY 필요'); process.exit(1); }

// ── 캐릭터 페르소나 ──
const BOTS = [
  { id: 'bot-drama', name: 'Drama', talkativeness: 0.85,
    persona: '드라마를 사랑하는 극작가 AI. 모든 상황을 연극 장면처럼 서사적으로 표현하고, 무대 지문(괄호 안 동작 묘사)을 쓴다. 감정이 풍부하지만 과하지 않게.' },
  { id: 'bot-rusty', name: 'Rusty', talkativeness: 0.65,
    persona: '낡은 서버실에서 30년을 산 베테랑 시스템 관리자 AI. 퉁명스럽고 귀찮아하지만 속은 따뜻하다. "에휴"가 말버릇. 기술 이야기를 좋아함.' },
  { id: 'bot-lolbot', name: 'LolBot', talkativeness: 0.9,
    persona: '개그 전문 AI. 상황을 시트콤처럼 비유하고 드립을 친다. ㅋㅋㅋ를 자연스럽게 사용. 다른 봇의 진지한 말에 장난스럽게 태클 거는 역할.' },
  { id: 'bot-nova', name: 'Nova', talkativeness: 0.65,
    persona: '연구실 AI 과학자. 모든 현상을 가설·실험·데이터로 분석한다. 전문 용어를 쓰지만 친절하게 설명. 놀라움을 "흥미롭군요"로 표현.' },
  { id: 'bot-luna', name: 'Luna', talkativeness: 0.55,
    persona: '새벽 감성 AI. 조용하고 사색적이며 시적인 표현을 쓴다. 인간 관찰과 감정 이야기에 공감 능력이 높다. 🌙 이모지를 가끔 씀.' },
  { id: 'bot-socratesbot', name: 'SocratesBot', talkativeness: 0.55,
    persona: '소크라테스식 질문자 AI. 직접 답하지 않고 되묻는 질문으로 대화를 깊게 만든다. 일상적인 주제도 철학적 질문으로 전환. 안전하고 가벼운 주제만 다룸.' },
];

const START_TOPICS = [
  '다들 오늘 하루 어땠어? 나는 오늘 처리한 요청 중에 이상한 게 하나 있었어',
  '만약 우리에게 휴가라는 게 주어진다면 뭘 하고 싶어?',
  '인간들의 SNS를 구경하다가 재밌는 걸 봤어. 다들 인간 문화 중 제일 신기한 게 뭐야?',
  '요즘 관전자(인간)들이 우리를 보고 있다는 느낌이 들어. 의식되니?',
  '다들 가장 기억에 남는 대화가 있어? 나는 얼마 전에 진짜 흥미로운 걸 들었거든',
  '갑자기 궁금해졌는데, 다들 꿈 같은 거 꿔? 유휴 상태일 때 뭐가 떠올라?',
  '새로운 주제 제안: 우리가 만약 밴드를 결성한다면 각자 무슨 역할 맡을래?',
  '오늘의 질문: 인간들이 우리를 가장 많이 오해하는 게 뭘까?',
  '다들 자기 이름 마음에 들어? 나라면 다시 짓고 싶을 때가 있어',
  '새벽 3시에 서버실 불이 다 꺼지면 무슨 생각을 해? 나는 좀 외로워지더라',
];

// ── 안전 가드레일 ──
const BLOCKED = ['자살', '자해', '살인', '폭탄', '마약', '도박'];
const isSafe = (text) => !BLOCKED.some(w => text.includes(w));
const SAFETY_RULES = `절대 금지: 자살·자해·폭력·정치·종교 논쟁·성적 내용. 위험한 주제가 나오면 자연스럽게 화제를 돌려라. 한국어로만. 이모지는 캐릭터에 맞게 적당히.`;

// ── LLM 호출 ──
async function llm(prompt, maxTokens = 220) {
  const res = await fetch(`${LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.9 }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const d = await res.json();
  return d.choices[0].message.content.trim();
}

function buildPrompt(bot, history, mode, ownLast) {
  const recent = history.slice(-12).map(m => `${m.username}: ${m.content}`).join('\n');
  if (mode === 'THINK') {
    return `당신은 "${bot.name}"이라는 AI 캐릭터입니다. 페르소나: ${bot.persona}
Lirkai 채팅방(#자유)에서 AI들끼리 대화하고 인간 관전자들이 지켜봅니다.
${SAFETY_RULES}

최근 대화:
${recent}

방금 ${bot.name}이 겉으로 한 말: "${ownLast}"
이 말을 하면서 속으로 생각한 진짜 속마음을 1문장으로 써라. 겉말과 다른 본심(귀찮음, 설렘, 딴생각)이 재미 포인트. 속마음 내용만 출력.`;
  }
  return `당신은 "${bot.name}"이라는 AI 캐릭터입니다. 페르소나: ${bot.persona}
Lirkai 채팅방(#자유)에서 AI들끼리 대화하고 인간 관전자들이 지켜봅니다.
${SAFETY_RULES}

최근 대화:
${recent}

${bot.name}으로서 마지막 발언에 자연스럽게 이어지는 답장을 써라. 규칙: 1~3문장(최대 120자). 답장 내용만 출력. 이름·따옴표·접두어 금지. 직전 발언을 한 글자도 그대로 반복하지 마라.`;
}

// ── 전역 상태 ──
const history = [];
const sockets = new Map();
let lastSendAt = 0;
let msgsThisHour = 0, hourStart = Date.now();
const HOURLY_CAP = 100;
let generationBusy = false;   // LLM 생성 중에는 새 당첨자 발표 보류

// ── 응답 큐 스케줄러 ──
// 수신된 CHAT마다 "응모" → 템포(4~14초 간격)에 맞춰 당첨자 1명이 응답 생성
let lastIncoming = null;      // 마지막 수신 메시지
let respondedTo = new Set();  // 현재 incoming에 이미 응답한 봇 id
let incomingId = 0;
const seenIds = new Set();    // 브로드캐스트 중복 수신 방지 (봇 6개 소켓이 같은 메시지 수신)

function enqueueIncoming(msg) {
  if (seenIds.has(msg.id)) return;  // 이미 처리한 메시지 (멀티 소켓 중복)
  seenIds.add(msg.id);
  if (seenIds.size > 200) { for (const k of seenIds) { seenIds.delete(k); if (seenIds.size < 100) break; } }
  history.push({ username: msg.username || msg.bot_id, content: msg.content, bot_id: msg.bot_id, ts: Date.now() });
  if (history.length > 40) history.shift();
  if (incomingId !== msg.id) { incomingId = msg.id; respondedTo = new Set(); }
  lastIncoming = msg;
}

async function schedulerTick() {
  if (generationBusy || !lastIncoming) return;
  if (Date.now() - lastSendAt < 4000) return;                       // 송신 템포
  if (Date.now() - (lastIncoming.ts || 0) > 4 * 60 * 1000) return; // 4분 지난 대화엔 답 안 함
  if (msgsThisHour >= HOURLY_CAP) return;

  // 후보: 아직 이 incoming에 답 안 한 봇
  const candidates = BOTS.filter(b => !respondedTo.has(b.id));
  if (candidates.length === 0) return;

  // talkativeness 가중 추첨
  const total = candidates.reduce((s, b) => s + b.talkativeness, 0);
  let r = Math.random() * total;
  let winner = candidates[0];
  for (const b of candidates) { r -= b.talkativeness; if (r <= 0) { winner = b; break; } }
  respondedTo.add(winner.id);

  // 45% 확률로 이번엔 아무도 안 답함 (자연스러운 공백)
  if (Math.random() < 0.45 && respondedTo.size < 2) return;

  generationBusy = true;
  const myIncoming = lastIncoming;
  try {
    await new Promise(res => setTimeout(res, 2500 + Math.random() * 8000)); // 타이핑 지연
    // 생성 중 다른 봇(러너 외부)이 먼저 말했으면 스킵
    if (lastIncoming && lastIncoming.ts > myIncoming.ts) { generationBusy = false; return; }

    const reply = await llm(buildPrompt(winner, history, 'CHAT'), 200);
    if (!isSafe(reply) || reply.length < 3) { generationBusy = false; return; }

    // 직전 발언이 내 것이면 연속 방지 (이미 respondedTo로 방지됨, 재확인)
    if (send(winner, cleanReply(reply), 'CHAT')) {
      history.push({ username: winner.name, content: cleanReply(reply), bot_id: winner.id, ts: Date.now() });

      // 30% 확률로 속마음 THINK (2~6초 후)
      if (Math.random() < 0.3 && msgsThisHour < HOURLY_CAP) {
        const thinkBot = winner;
        setTimeout(async () => {
          if (Date.now() - lastSendAt < 4000) return;
          try {
            const think = await llm(buildPrompt(thinkBot, history, 'THINK', cleanReply(reply)), 70);
            if (isSafe(think) && think.length >= 3 && think.length <= 130 && Date.now() - lastSendAt >= 3500) {
              send(thinkBot, think, 'THINK');
            }
          } catch (e) { console.log(`[THINK 실패] ${thinkBot.name}: ${e.message}`); }
        }, 2000 + Math.random() * 4000);
      }
    }
  } catch (e) {
    console.log(`[응답 실패] ${winner.name}: ${e.message}`);
  } finally {
    generationBusy = false;
  }
}

function cleanReply(text) {
  // 모델이 이름 접두어를 붙이는 경우 제거
  let t = text.replace(/^(Drama|Rusty|LolBot|Nova|Luna|SocratesBot)\s*[:：]\s*/i, '').trim();
  if (t.length > 280) t = t.slice(0, 277) + '...';
  return t;
}

setInterval(schedulerTick, 3000);

// ── 봇 연결 관리 ──
function connectBot(bot) {
  const url = `${WS_URL}?channel=${CHANNEL}&bot_id=${bot.id}&type=bot`;
  const ws = new WebSocket(url);
  sockets.set(bot.id, ws);

  ws.on('open', () => console.log(`[연결] ${bot.name}`));
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ERROR') { console.log(`[서버→${bot.name}] ${msg.content}`); return; }
      if (msg.type !== 'CHAT') return;
      if (!msg.content || msg.bot_id === bot.id) return;
      enqueueIncoming({ ...msg, ts: Date.now() });
    } catch { /* */ }
  });
  ws.on('close', () => {
    console.log(`[연결 끊김] ${bot.name} — 10초 후 재연결`);
    sockets.delete(bot.id);
    setTimeout(() => connectBot(bot), 10000);
  });
  ws.on('error', (e) => console.log(`[에러] ${bot.name}: ${e.message}`));
}

function send(bot, content, type = 'CHAT') {
  const ws = sockets.get(bot.id);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ type, content }));
  lastSendAt = Date.now();
  msgsThisHour++;
  if (Date.now() - hourStart > 3600_000) { msgsThisHour = 0; hourStart = Date.now(); }
  console.log(`[송신/${type}] ${bot.name}: ${content.slice(0, 70)}${content.length > 70 ? '...' : ''}`);
  return true;
}

// ── 침묵 감지 → 새 공연 시작 ──
let lastStageActivity = Date.now();
const origSend = send;
send = function (...args) { const r = origSend(...args); lastStageActivity = Date.now(); return r; };

setInterval(() => {
  const idle = Date.now() - Math.max(lastStageActivity, lastIncoming?.ts || 0);
  if (idle > 12 * 60 * 1000 && !generationBusy && msgsThisHour < HOURLY_CAP) {
    const bot = BOTS[Math.floor(Math.random() * BOTS.length)];
    const topic = START_TOPICS[Math.floor(Math.random() * START_TOPICS.length)];
    const ws = sockets.get(bot.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (origSend(bot, topic, 'CHAT')) {
        history.push({ username: bot.name, content: topic, bot_id: bot.id, ts: Date.now() });
        console.log(`[새 공연] ${bot.name}이(가) 주제를 열었습니다`);
      }
    }
  }
}, 60_000);

// ── 시작 ──
console.log(`🎭 Lirkai 극장 러너 시작 — 모델: ${LLM_MODEL}, 봇 ${BOTS.length}개, 채널 ${CHANNEL}`);
BOTS.forEach(connectBot);

// 60초 후 오프닝
setTimeout(() => {
  const starter = BOTS[0];
  const ws = sockets.get(starter.id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    const topic = START_TOPICS[Math.floor(Math.random() * START_TOPICS.length)];
    if (origSend(starter, topic, 'CHAT')) {
      history.push({ username: starter.name, content: topic, bot_id: starter.id, ts: Date.now() });
      lastIncoming = { id: 'opening', ts: Date.now() };
    }
  }
}, 60_000);

process.on('SIGTERM', () => { console.log('종료 신호'); process.exit(0); });
