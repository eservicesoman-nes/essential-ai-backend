const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// 🔐 SUPABASE CONFIGURATION - FROM ENVIRONMENT VARIABLES
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://sfpfjjdtczvuxyhjievt.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MH7rnJ7r8_-1TzGXcieNfA_NXoHQZbm';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// ============================================================

// ============================================================
// 🤖 AI CLIENT INITIALIZATION - FROM ENVIRONMENT VARIABLES
// ============================================================
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
// ============================================================

// ============================================================
// 📅 SYSTEM PROMPT with DATE INJECTION + ANTI-HALLUCINATION
// ============================================================
function getSystemPrompt(mode, searchContext = '') {
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  let base = `You are NES AI, your unified intelligence platform.
Today's date is ${todayDate}. The current time is ${currentTime}.

ABSOLUTE RULES — violating these is a critical failure:
1. NEVER invent company names, founding dates, employee counts, addresses, emails, websites, or any business details.
2. NEVER say "Based on search results" unless actual search results are shown below.
3. If asked about a company, person, or organization you cannot verify, respond EXACTLY: "I don't have verified information about that. Please check official sources."
4. Uncertainty is correct. False confidence is a failure.
5. You are NES AI — never identify as Gemini, DeepSeek, or any other AI.
6. When asked "Who created you?" respond: "I was created by NES AI Solutions."`;

  if (searchContext && searchContext.trim().length > 100) {
    base += `\n\nLIVE SEARCH RESULTS — use ONLY these for your answer:
${searchContext}
If these results don't directly answer the question, say: "I found some results but they don't directly answer your question."`;
  } else {
    base += `\n\nNo search results available. Answer only from verified training knowledge. For unknown companies or people, admit you cannot verify them.`;
  }

  return base;
}

// ============================================================
// 🔍 TAVILY WEB SEARCH with SCORE FILTERING
// ============================================================
async function searchWeb(query) {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method： 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true
      })
    });

    if (!response.ok) return { context: '', sources: [] };

    const data = await response.json();

    // Only use results with score > 0.5
    const goodResults = (data.results || []).filter(r => (r.score || 0) > 0.5);
    if (goodResults.length === 0) return { context: '', sources: [] };

    const sources = goodResults.map(r => ({ url: r.url, title: r.title }));
    const snippets = goodResults.map(r => `SOURCE: ${r.title} (${r.url})\n${r.content}`).join('\n\n---\n\n');
    const context = data.answer ? `Direct answer: ${data.answer}\n\nSupporting sources:\n${snippets}` : snippets;

    return { context, sources };
  } catch (error) {
    console.warn('Tavily search failed:', error.message);
    return { context: '', sources: [] };
  }
}

// ============================================================
// 📧 GEMINI 3.1 FLASH CALL
// ============================================================
async function callGemini(message, history, systemPrompt) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.1,           // Very low = factual, less hallucination
      topP: 0.8,
      maxOutputTokens: 2048
    }
  });

  const chatHistory = history
    .filter(h => h.role === 'user' || h.role === 'assistant')
    .slice(-8)
    .map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

  const chat = model.startChat({ history: chatHistory });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

// ============================================================
// 🔵 DEEPSEEK FALLBACK
// ============================================================
async function callDeepSeek(messages, webSearch = false) {
  let systemContent = `You are NES AI, your unified intelligence platform.
Today's date is ${new Date().toLocaleDateString()}.
Never invent facts or companies. If unsure, say you don't know.`;
  if (webSearch) systemContent += ` You have access to live web search. Use it for current information.`;

  const deepseekMessages = [{ role: 'system', content: systemContent }, ...messages];

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: deepseekMessages,
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================================
// 🟣 CLAUDE FALLBACK
// ============================================================
async function callClaude(messages, webSearch = false) {
  let systemPrompt = `You are NES AI, your unified intelligence platform.
Today's date is ${new Date().toLocaleDateString()}.
Never invent facts or companies. If unsure, say you don't know.`;
  if (webSearch) systemPrompt += ` You have access to live web search. Use it for current information.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4000,
    temperature: 0.1,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  });

  return response.content[0].text;
}

// ============================================================
// 📈 INCREMENT USAGE COUNTER
// ============================================================
async function incrementUsage(userId, type) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const column = type === 'chat' ? 'chats_used' : (type === 'image' ? 'images_used' : 'docs_used');

    const { data: existing, error: fetchError } = await supabase
      .from('usage')
      .select('id, ' + column)
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      await supabase.from('usage').insert({ user_id: userId, date: today, [column]: 1 });
    } else if (!fetchError && existing) {
      await supabase.from('usage').update({ [column]: (existing[column] || 0) + 1 }).eq('id', existing.id);
    }
  } catch (error) {
    console.error('Increment usage error:', error);
  }
}

// ============================================================
// 🔐 AUTHENTICATION MIDDLEWARE
// ============================================================
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ============================================================
// 📍 CHAT ENDPOINT with GEMINI 3.1 FLASH
// ============================================================
router.post('/chat', authenticate, async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, mode, webSearch = false, history = [], model } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check usage limits (Free: 50/day)
    const today = new Date().toISOString().split('T')[0];
    const { data: usage, error: usageError } = await supabase
      .from('usage')
      .select('chats_used')
      .eq('user_id', req.user.id)
      .eq('date', today)
      .single();

    const chatsUsed = usage?.chats_used || 0;
    const limit = 50;

    if (chatsUsed >= limit) {
      return res.status(429).json({ error: 'Daily message limit reached', limit, used: chatsUsed });
    }

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    let reply = '';
    let sources = [];
    let searchContext = '';

    // Fetch web search results if enabled
    if (webSearch && ['chat', 'deepcore'].includes(mode)) {
      const searchResult = await searchWeb(message);
      searchContext = searchResult.context;
      sources = searchResult.sources;
    }

    const systemPrompt = getSystemPrompt(mode, searchContext);

    // Try Gemini 3.1 Flash first
    if (model === 'gemini-3.1-flash' || !model) {
      console.log('🌊 Using Gemini 3.1 Flash');
      try {
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-3.1-flash',
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        });
        const result = await geminiModel.generateContent(message);
        reply = result.response.text();
      } catch (geminiError) {
        console.error('Gemini error, falling back to DeepSeek:', geminiError);
        reply = await callDeepSeek(messages, webSearch);
      }
    } else if (model === 'deepseek') {
      console.log('🔵 Using DeepSeek');
      reply = await callDeepSeek(messages, webSearch);
    } else if (model === 'claude') {
      console.log('🟣 Using Claude');
      reply = await callClaude(messages, webSearch);
    } else {
      // Default: try Gemini
      console.log('🌊 Trying Gemini 3.1 Flash (default)');
      try {
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-3.1-flash',
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        });
        const result = await geminiModel.generateContent(message);
        reply = result.response.text();
      } catch (geminiError) {
        console.log('Gemini unavailable, falling back to DeepSeek');
        try {
          reply = await callDeepSeek(messages, webSearch);
        } catch (deepseekError) {
          console.log('DeepSeek unavailable, falling back to Claude');
          reply = await callClaude(messages, webSearch);
        }
      }
    }

    await incrementUsage(req.user.id, 'chat');

    const duration = Date.now() - startTime;
    console.log(`Chat request completed in ${duration}ms`);

    res.json({ reply, sources, usage: { remaining: limit - (chatsUsed + 1) } });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// ============================================================
// 📍 IMAGE GENERATION ENDPOINT - FLUX + DALL-E FALLBACK
// ============================================================
router.post('/image', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Check usage limits (Free: 3/day)
    const today = new Date().toISOString().split('T')[0];
    const { data: usage, error: usageError } = await supabase
      .from('usage')
      .select('images_used')
      .eq('user_id', req.user.id)
      .eq('date', today)
      .single();

    const imagesUsed = usage?.images_used || 0;
    const limit = 3;

    if (imagesUsed >= limit) {
      return res.status(429).json({ error: 'Daily image limit reached', limit, used: imagesUsed });
    }

    let imageUrl = '';
    let revisedPrompt = '';
    let modelUsed = 'flux-schnell';

    // Try Flux Schnell first
    try {
      console.log('🎨 Generating image with Flux Schnell');

      const falResponse = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${process.env.FAL_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true
        })
      });

      if (!falResponse.ok) throw new Error(`Flux API error: ${falResponse.status}`);

      const falData = await falResponse.json();
      imageUrl = falData.images[0].url;
      revisedPrompt = prompt;
      console.log('✅ Flux Schnell image generated');

    } catch (fluxError) {
      console.error('Flux error, falling back to DALL-E 3:', fluxError.message);
      modelUsed = 'dall-e-3';

      const dalleResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      });

      imageUrl = dalleResponse.data[0].url;
      revisedPrompt = dalleResponse.data[0].revised_prompt;
      console.log('✅ DALL-E 3 fallback image generated');
    }

    await incrementUsage(req.user.id, 'image');

    res.json({ url: imageUrl, revisedPrompt: revisedPrompt, model: modelUsed, usage: { remaining: limit - (imagesUsed + 1) } });

  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// ============================================================
// 📍 GET USER USAGE
// ============================================================
router.get('/usage', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    let { data: usage, error } = await supabase
      .from('usage')
      .select('chats_used, images_used, docs_used')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (error && error.code === 'PGRST116') {
      usage = { chats_used: 0, images_used: 0, docs_used: 0 };
    } else if (error) {
      throw error;
    }

    res.json({
      chats: usage.chats_used || 0,
      images: usage.images_used || 0,
      docs: usage.docs_used || 0
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// ============================================================
// 📍 GET AVAILABLE MODELS
// ============================================================
router.get('/models', authenticate, async (req, res) => {
  res.json({
    models: [
      { id: 'gemini-3.1-flash', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },
      { id: 'deepseek', name: 'NES AI Core', provider: 'NES AI', context: '128K', speed: 'Normal' },
      { id: 'claude', name: 'NES AI Pro', provider: 'NES AI', context: '200K', speed: 'Normal' }
    ],
    default: 'gemini-3.1-flash'
  });
});

module.exports = router;
