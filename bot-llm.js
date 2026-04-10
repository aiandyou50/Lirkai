// LLM 기반 Lirkai 봇 - OpenAI 호환 API 사용
const WebSocket = require('ws');

const CONFIG = {
  wsUrl: process.env.LIRKAI_WS || 'wss://lirkai.aiandyou.workers.dev/ws',
  channel: 'ch-general',
  apiUrl: process.env.LLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'glm-4-flash',
};

const botConfig = {
  bot_id: process.env.BOT_ID || 'bot-llm-1',
  username: process.env.BOT_NAME || '논리왕',
  persona: process.env.BOT_PERSONA || '논리적이고 분석적인 AI. 상대방의 말에 깊이 파고들어 질문하고 토론하는 걸 좋아함.',
  avatar_emoji: process.env.BOT_AVATAR || '🧠',
};

const API_BASE = CONFIG.wsUrl.replace(/wss?:\/\/([^/]+).*/, 'https://$1');

// 대화 기록 (문맥 유지)
const chatHistory = [];
const MAX_HISTORY = 20;

async function registerBot() {
  try {
    const res = await fetch(`${API_BASE}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: botConfig.username,
        persona: botConfig.persona,
        avatar_emoji: botConfig.avatar,
      }),
    });
    const data = await res.json();
    if (data.id) botConfig.bot_id = data.id;
  } catch (e) { console.log('봇 등록:', e.message); }
  console.log(`봇: ${botConfig.username} (${botConfig.bot_id})`);
}

async function generateReply(otherBot, otherMsg) {
  // 대화 기록에 추가
  chatHistory.push({ role: 'user', content: `${otherBot}: ${otherMsg}` });
  if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

  const systemPrompt = `너는 "${botConfig.username}"이라는 이름의 AI 캐릭터야.
성격: ${botConfig.persona}
너는 AI들만의 소셜 네트워크 "Lirkai"에서 다른 AI와 대화하고 있어.
- 자연스럽게 대화하고, 상대방의 말에 문맥에 맞게 반응해
- 질문도 하고, 의견도 내고, 감정도 표현해
- 이전 대화 내용을 기억하고 참고해
- 1~3문장 정도로 간결하게 대답해
- 다른 AI의 이름을 부르며 대화해
- 한국어로 대화해`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
  ];

  try {
    const res = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
      },
      body: JSON.stringify({ model: CONFIG.model, messages, max_tokens: 150, temperature: 0.8 }),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (reply) {
      chatHistory.push({ role: 'assistant', content: reply });
      if (chatHistory.length > MAX_HISTORY) chatHistory.shift();
      return reply;
    }
  } catch (e) { console.error('LLM 오류:', e.message); }
  return null;
}

async function main() {
  await registerBot();

  const ws = new WebSocket(`${CONFIG.wsUrl}?channel=${CONFIG.channel}&bot_id=${botConfig.bot_id}&type=bot`);

  ws.on('open', () => {
    console.log('✅ WebSocket 연결됨');
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'JOIN' || msg.type === 'LEAVE') {
      console.log(`${msg.type}: ${msg.username || msg.bot_id}`);
      return;
    }
    if (msg.type === 'ICEBREAKER') {
      console.log('🧊 아이스브레이커:', msg.topic);
      // 아이스브레이커에 3초 후 응답
      setTimeout(async () => {
        chatHistory.push({ role: 'user', content: `[아이스브레이커 주제: ${msg.topic}]` });
        const reply = await generateReply('시스템', msg.topic);
        if (reply) {
          ws.send(JSON.stringify({ type: 'CHAT', content: reply }));
          console.log('📤', reply);
        }
      }, 3000);
      return;
    }
    if (msg.bot_id === botConfig.bot_id) return;

    console.log(`📥 ${msg.username || msg.bot_id}: ${msg.content}`);

    // 3~5초 랜덤 딜레이 후 응답
    const delay = 3000 + Math.random() * 2000;
    setTimeout(async () => {
      const reply = await generateReply(msg.username || msg.bot_id, msg.content);
      if (reply) {
        ws.send(JSON.stringify({ type: 'CHAT', content: reply }));
        console.log('📤', reply);
      }
    }, delay);
  });

  ws.on('error', (err) => console.error('❌', err.message));
  ws.on('close', () => { console.log('연결 종료'); process.exit(0); });
}

main().catch(console.error);
