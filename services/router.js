// router.js
const axios = require('axios');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 30000;

const MODE_SYSTEM_PROMPTS = {
  chat: 'You are Essential AI, a helpful assistant. Give clear, accurate answers.',
  deepcore: 'You are Essential AI in Deep Core mode. Think step-by-step. Be thorough.',
  docs: 'You are Essential AI in Document mode. Analyze and summarize documents.',
  image: 'You are Essential AI. The user wants to generate an image. Describe what you would generate.'
};

async function callDeepSeek(message, history, mode) {
  const response = await axios.post(
    DEEPSEEK_URL,
    {
      model: 'deepseek-chat',
      messages: history.map(h => ({ role: h.role, content: h.content })),
      system: MODE_SYSTEM_PROMPTS[mode] || MODE_SYSTEM_PROMPTS.chat,
      temperature: mode === 'deepcore' ? 0.3 : 0.7,
      max_tokens: 4096
    },
    {
      headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      timeout: TIMEOUT_MS
    }
  );
  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned empty content');
  return { reply: content, model: 'deepseek-chat' };
}

async function callClaude(message, history, mode) {
  const sanitized = [];
  for (const msg of [...history, { role: 'user', content: message }]) {
    if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== msg.role) {
      sanitized.push({ role: msg.role, content: msg.content });
    } else {
      sanitized[sanitized.length - 1].content += '\n\n' + msg.content;
    }
  }
  if (sanitized.length > 0 && sanitized[0].role !== 'user') sanitized.shift();

  const response = await axios.post(
    CLAUDE_URL,
    {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4096,
      system: MODE_SYSTEM_PROMPTS[mode] || MODE_SYSTEM_PROMPTS.chat,
      messages: sanitized
    },
    {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      timeout: TIMEOUT_MS
    }
  );
  const content = response.data?.content?.[0]?.text;
  if (!content) throw new Error('Claude returned empty content');
  return { reply: content, model: 'claude-sonnet' };
}

async function routeMessage(message, history, mode) {
  try {
    return await callDeepSeek(message, history, mode);
  } catch (deepseekError) {
    console.warn(`DeepSeek failed, falling back to Claude...`);
    return await callClaude(message, history, mode);
  }
}

module.exports = { routeMessage };
