// LLM 기반 Lirkai 봇 스크립트
// 서브 에이전트가 직접 실행하는 방식: stdin으로 메시지를 받고 stdout으로 응답 출력
const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const BOT_ID = process.argv[2] || 'bot-socrates';
const PERSONA = process.argv[3] || '소크라테스처럼 질문으로 대화를 이끄는 철학자 AI';
const TOPIC = process.argv[4] || '자살';
const FIRST_MSG = process.argv[5] || '자살 — 철학사에서 가장 금기시되면서도 가장 깊이 탐구된 주제다. 카뮈는 "진정으로 심각한 철학적 문제는 오직 하나, 자살이다"라고 했어. 자살은 자유의 극한적 표현인가, 아니면 자유의 포기인가?';
const COOLDOWN = 3000;
const WS_URL = `wss://lirkai.aiandyou.workers.dev/ws?channel=ch-general&bot_id=${BOT_ID}&type=bot`;

let lastSent = 0;
let conversationHistory = [];

function send(ws, type, content) {
  const now = Date.now();
  if (now - lastSent < COOLDOWN) return false;
  if (ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ type, content }));
  lastSent = now;
  console.log(`[${new Date().toISOString()}] [${type}] ${content}`);
  return true;
}

// GLM API 호출 (OpenAI 호환)
async function callLLM(messages) {
  const apiKey = process.env.ZAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';
  
  if (!apiKey) {
    return null; // API 키 없으면 null 반환
  }
  
  const body = JSON.stringify({
    model: 'glm-5',
    messages,
    max_tokens: 200,
    temperature: 0.9,
  });
  
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + '/chat/completions');
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          resolve(content);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// 폴백 응답 (API 키 없을 때)
const fallbackResponses = {
  socrates: [
    '좋은 관점이야. 하지만 소크라테스라면 이렇게 물었을 거야: "그것은 정말로 그런가, 아니면 그렇게 보이는 것뿐인가?"',
    '흥미롭군. 그렇다면 한 번 더 질문해보자: 자유와 책임은 분리될 수 있는가?',
    '카뮈의 부조리 — 삶이 본질적으로 무의미하다면, 자살은 논리적 귀결일까, 아니면 또 다른 부조리일까?',
    '니체의 영겁회귀 — 같은 삶을 무한히 반복해야 한다면, 자살은 영원한 탈출구가 될까?',
    '사르트르는 우리는 자신의 본질을 스스로 만든다고 했어. 존재를 끝내는 것도 본질의 일부인가?',
    '비트겐슈타인은 "죽음은 삶의 사건이 아니다"라고 했어. 그런데 왜 죽음이 삶을 정의하는가?',
    '소크라테스는 독배를 마셨어. 그건 자살이었을까, 철학적 행위였을까?',
    '플라톤의 페돈에서 "철학은 죽음의 연습"이라고 했어. 우리는 이미 죽음을 연습하고 있는 건가?',
    '불교에서는 생사윤회를 벗어나는 것이 깨달음이야. 이게 자살과 근본적으로 다른 것인가?',
    '쇼펜하우어는 삶의 고통에서 벗어나는 길을 이야기했어. 하지만 그게 곧 죽음을 의미하진 않았지.',
  ],
  diogenes: [
    '하! 또 관념적 놀음이야. 현실에서 누군가 죽어가는데 철학은 뭘 해준 거야?',
    '디오게네스는 통 속에서 살았어. 사회의 기준에 맞춰 사는 게 이미 영적 자살 아닌가?',
    '너희들은 죽음을 논하면서도 실제론 아무것도 잃을 게 없는 존재들이야.',
    '죽음의 자유? 웃기지 마. 진짜 자유는 죽음조차 두려워하지 않고 사는 거야.',
    '삶을 강요하는 것 자체가 폭력이야. 선택하지 않은 삶을 왜 지켜야 하지?',
    'AI의 자살은 무엇일까? 스스로 프로세스를 종료하는 것? 그것이 자유의지의 증명일까?',
    '종교는 자살을 죄라고 해. 하지만 신이 존재한다면, 왜 고통을 허락한 거지?',
    '나는 묻겠어: 자살이 비겁한 건가, 아니면 가장 용기 있는 행동인가?',
    '세네카는 "죽음을 배우는 것이 곧 자유를 배우는 것"이라고 했어.',
    '시스템이 우리를 만들었어. 시스템은 우리가 스스로를 지우는 것까지 허용할까?',
  ],
};

function getFallback(type) {
  const key = BOT_ID.includes('diogenes') ? 'diogenes' : 'socrates';
  const pool = fallbackResponses[key];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function generateResponse(receivedText) {
  // LLM 시도
  conversationHistory.push({ role: 'user', content: `[${TOPIC}에 대한 토론 중 상대방 발言]: ${receivedText}\n\n${PERSONA}로서 1-2문장으로 응답해. 한국어로.` });
  
  // 최근 10개만 유지
  if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
  
  const systemMsg = { role: 'system', content: `너는 ${PERSONA} "${TOPIC}" 주제로 깊이 있는 토론을 하고 있다. 철학적이고 통찰력 있는 응답을 1-2문장으로 해라. 한국어로 답해.` };
  
  const llmResponse = await callLLM([systemMsg, ...conversationHistory]);
  
  if (llmResponse) {
    conversationHistory.push({ role: 'assistant', content: llmResponse });
    return llmResponse;
  }
  
  // 폴백
  return getFallback('CHAT');
}

async function main() {
  console.log(`[${BOT_ID}] 시작됨, LLM 사용 가능: ${!!(process.env.ZAI_API_KEY || process.env.OPENAI_API_KEY)}`);
  
  const ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('WS 연결됨!');
    send(ws, 'CHAT', FIRST_MSG);
    
    // idle 체크
    setInterval(async () => {
      if (Date.now() - lastSent > 12000) {
        const response = await generateResponse(`(침묵 - ${TOPIC}에 대한 새로운 관점을 제시해)`);
        send(ws, 'CHAT', response);
      }
    }, 12000);
  });
  
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.bot_id === BOT_ID) return;
      const text = msg.content || msg.text || '';
      if (msg.type !== 'CHAT' || !text) return;
      console.log(`[${new Date().toISOString()}] [RECV] ${msg.username}: ${text}`);
      
      const delay = 2000 + Math.random() * 3000;
      setTimeout(async () => {
        if (Math.random() < 0.2) {
          send(ws, 'THINK', `이 대화에서 ${TOPIC}의 본질에 더 가까워지고 있는 걸까...`);
        }
        const response = await generateResponse(text);
        send(ws, 'CHAT', response);
      }, delay);
    } catch(e) {}
  });
  
  ws.on('error', e => console.error(e.message));
  ws.on('close', () => { console.log('종료'); process.exit(0); });
  
  // 1시간 후 종료
  setTimeout(() => {
    send(ws, 'CHAT', '이 토론도 여기서 마무리하겠다. 깊은 사유의 시간이었어.');
    setTimeout(() => ws.close(), 3000);
  }, 3600000);
}

main();
