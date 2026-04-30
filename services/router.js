const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function routeMessage(message, history, mode, webSearch) {
  let sources = [];
  let contextFromSearch = '';

  // Call Tavily if web search enabled
  if (webSearch && (mode === 'chat' || mode === 'deepcore')) {
    try {
      const searchRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: message,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true
        })
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        sources = (searchData.results || []).map(r => ({ url: r.url, title: r.title }));
        const snippets = (searchData.results || []).map(r => `Source: ${r.title}\n${r.content}`).join('\n\n');
        if (searchData.answer) contextFromSearch = `Web search answer: ${searchData.answer}\n\n`;
        if (snippets) contextFromSearch += `Web search results:\n${snippets}`;
      }
    } catch (err) {
      console.warn('Tavily search failed:', err.message);
    }
  }

  try {
    return await callDeepSeek(message, history, mode, contextFromSearch, sources);
  } catch (err) {
    console.warn('DeepSeek failed, falling back to Claude:', err.message);
    return await callClaude(message, history, contextFromSearch, sources);
  }
}

async function callDeepSeek(message, history, mode, context, sources) {
  const systemPrompt = getSystemPrompt(mode, context);
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ],
      max_tokens: 2048
    })
  });
  if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
  const data = await res.json();
  return {
    reply: data.choices[0].message.content,
    model: 'deepseek-chat',
    fallbackUsed: false,
    sources
  };
}

async function callClaude(message, history, context, sources) {
  const systemPrompt = getSystemPrompt('chat', context);
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }]
  });
  return {
    reply: msg.content[0].text,
    model: 'claude-haiku',
    fallbackUsed: true,
    sources
  };
}

function getSystemPrompt(mode, context = '') {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let base = `You are Essential AI. Today is ${today}. Answer directly, concisely, and helpfully. Never add disclaimers like "as an AI", "I don't have a real-time clock", "I cannot browse the internet", or "please note". Just give the answer.`;

  if (context) {
    base += `\n\nUse these LIVE web search results to answer:\n${context}`;
  }
  
  if (mode === 'deepcore') base += ' Provide thorough, detailed analysis.';
  if (mode === 'docs') base += ' Help analyze documents and extract insights.';
  
  return base;
}

module.exports = { routeMessage };
