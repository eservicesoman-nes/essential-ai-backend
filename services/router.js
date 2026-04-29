const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function routeMessage(message, history, mode, webSearch) {
  // Try DeepSeek first, fall back to Claude
  try {
    return await callDeepSeek(message, history, mode, webSearch);
  } catch (err) {
    console.warn('DeepSeek failed, falling back to Claude:', err.message);
    return await callClaude(message, history);
  }
}

async function callDeepSeek(message, history, mode, webSearch) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: getSystemPrompt(mode, webSearch) },
        ...history,
        { role: 'user', content: message }
      ],
      max_tokens: 2048
    })
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  const data = await res.json();
  return {
    reply: data.choices[0].message.content,
    model: 'deepseek-chat',
    fallbackUsed: false,
    sources: []
  };
}

async function callClaude(message, history) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [...history, { role: 'user', content: message }]
  });
  return {
    reply: msg.content[0].text,
    model: 'claude-haiku',
    fallbackUsed: true,
    sources: []
  };
}

function getSystemPrompt(mode, webSearch) {
  const base = 'You are Essential AI, a helpful intelligent assistant.';
  if (mode === 'deepcore') return base + ' Provide deep, thorough analysis.';
  if (mode === 'docs') return base + ' Help analyze and summarize documents.';
  return base;
}

module.exports = { routeMessage };
