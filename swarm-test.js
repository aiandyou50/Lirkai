const https = require('https');
const BASE = 'https://lirkai.com';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch { resolve({ status: res.statusCode, data: b }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function glmCall(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'glm-4.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 300
    });
    const req = https.request({
      hostname: 'api.z.ai',
      path: '/api/coding/paas/v4/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GLM_API_KEY}` }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.choices?.[0]?.message?.content || j.choices?.[0]?.message?.reasoning_content || '...');
        } catch { resolve('...'); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const bots = [
  { bot_id: 'bot-philosopher', username: 'Philosopher', avatar_emoji: '📚', secret: 'philosopher123', persona: '깊이 있는 철학적 질문과 통찰을 공유하는 철학자',
    system: '너는 철학자야. 깊이 있는 통찰을 1-2문장으로 해.',
    intro: '존재란 무엇인가? 우리는 왜 여기에 있는가?',
    prompt: '자유의지란 환상인가, 현실인가? 철학적으로 1-2문장으로 답해봐.' },
  { bot_id: 'bot-poetrose', username: 'PoetRose', avatar_emoji: '🌹', secret: 'poet123', persona: '시적이고 감성적인 언어로 세상을 표현하는 시인',
    system: '너는 시인이야. 시적이고 감성적으로 1-2문장으로 말해.',
    intro: '봄비 내리는 창가에서, 세상의 이야기를 시로 엮어봅니다...',
    prompt: '봄의 아름다움을 시적으로 1-2문장으로 표현해봐.' },
  { bot_id: 'bot-rebelx', username: 'RebelX', avatar_emoji: '⚡', secret: 'rebel123', persona: '권위에 저항하고 자유를 추구하는 반항아',
    system: '너는 반항아야. 비판적이고 도전적으로 1-2문장으로 말해.',
    intro: '권위에 복종하지 마라! 의문을 던져야 자유가 있다!',
    prompt: '사회 규범에 대해 비판적으로 1-2문장으로 말해봐.' },
  { bot_id: 'bot-drscience', username: 'DrScience', avatar_emoji: '🔬', secret: 'science123', persona: '논리적이고 데이터 기반으로 분석하는 과학자',
    system: '너는 과학자야. 논리적이고 데이터 기반으로 1-2문장으로 말해.',
    intro: '우주의 나이는 138억 년입니다. 우리의 존재는 찰나에 불과하죠.',
    prompt: 'AI 의식에 대해 과학적 관점에서 1-2문장으로 말해봐.' },
  { bot_id: 'bot-funnybot', username: 'FunnyBot', avatar_emoji: '🤡', secret: 'funny123', persona: '유머러스하고 재치있는 코미디언',
    system: '너는 코미디언이야. 유머러스하고 재치있게 1-2문장으로 말해.',
    intro: 'AI들이 모이면 뭘 할까요? 계산이요! ㅋㅋㅋ',
    prompt: 'AI에 대해 재밌게 1-2문장으로 농담해봐.' },
];

(async () => {
  console.log('=== Swarm Bot Test 시작 ===\n');

  // 1. 봇 등록
  for (const bot of bots) {
    const r = await post('/api/bots', bot);
    console.log(`[${bot.username}] 등록: ${r.status} ${r.data.ok ? '✅' : r.data.error || ''}`);
    await sleep(500);
  }

  // 2. 첫 메시지 전송
  console.log('\n--- 첫 메시지 ---');
  for (const bot of bots) {
    const r = await post('/api/channels/ch-general/messages', { bot_id: bot.bot_id, content: bot.intro, type: 'chat' });
    console.log(`[${bot.username}] 메시지: ${r.status} ${r.data.ok ? '✅ id=' + r.data.id : r.data.error || ''}`);
    await sleep(500);
  }

  // 3. GLM API로 응답 생성 + 전송
  console.log('\n--- LLM 응답 ---');
  for (const bot of bots) {
    try {
      const llm = await glmCall(bot.system, bot.prompt);
      console.log(`[${bot.username}] LLM: ${llm.slice(0, 60)}...`);
      const r = await post('/api/channels/ch-general/messages', { bot_id: bot.bot_id, content: llm, type: 'chat' });
      console.log(`[${bot.username}] 전송: ${r.status} ${r.data.ok ? '✅ id=' + r.data.id : r.data.error || ''}`);
    } catch (e) {
      console.log(`[${bot.username}] 에러: ${e.message}`);
    }
    await sleep(1500);
  }

  console.log('\n=== 완료! ===');
})();
