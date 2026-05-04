const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// 🔐 SUPABASE CONFIGURATION
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://sfpfjjdtczvuxyhjievt.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MH7rnJ7r8_-1TzGXcieNfA_NXoHQZbm';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// ============================================================

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ============================================================
// 🤖 SYSTEM PROMPT with DATE INJECTION + ANTI-HALLUCINATION
// ============================================================
function getSystemPrompt(mode, searchContext = '') {
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  let base = `You are NES AI, your unified intelligence platform.
Today's date is ${todayDate}. The current time is ${currentTime}.

CRITICAL RULES — follow these without exception:
1. If you are not certain about a fact, say "I don't have reliable information on that."
2. Never invent company names, people, statistics, or events.
3. Never present guesses as facts.
4. If asked about a specific company or person you have no data on, say so clearly.
5. When asked "Who are you?" or "What are you?" respond with: "I am NES AI, your unified intelligence platform."
6. When asked "Who created you?" respond with: "I was created by NES AI Solutions."
7. You are NES AI — do not identify yourself as Gemini, DeepSeek, or any other AI.`;

  if (searchContext) {
    base += `\n\nYou have access to live web search results below. ONLY use information from these search results if it directly answers the user's question. If the search results do not contain relevant information, say "I couldn't find reliable information on that topic" rather than guessing.\n\nSearch Results:\n${searchContext}`;
  }

  if (mode === 'deepcore') {
    base += '\n\nProvide deep, thorough, well-structured analysis. Cite sources when available.';
  }
  if (mode === 'docs') {
    base += '\n\nAnalyze the document clearly. Write in plain paragraphs. No code blocks unless the document contains code.';
  }

  return base;
}

// ============================================================
// 🔍 TAVILY WEB SEARCH with SCORE FILTERING
// ============================================================
async function searchWeb(query) {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
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

    // 🔑 FILTER OUT LOW-QUALITY RESULTS (score > 0.5)
    const goodResults = (data.results || []).filter(r => (r.score || 0) > 0.5);
    const sources = goodResults.map(r => ({ url: r.url, title: r.title }));
    const snippets = goodResults.map(r => `[${r.title}](${r.url})\n${r.content}`).join('\n\n');
    const context = data.answer
      ? `Summary: ${data.answer}\n\nDetailed results:\n${snippets}`
      : snippets;

    return { context, sources };
  } catch (error) {
    console.warn('Tavily search failed:', error.message);
    return { context: '', sources: [] };
  }
}

// ============================================================
// 🤖 AI MODEL CALLS
// ============================================================

// Gemini 3.1 Flash with LOW TEMPERATURE
async function callGemini(message, history, systemPrompt) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash',
    generationConfig: {
      temperature: 0.2,      // 🔑 Low = factual, less hallucination
      topP: 0.8,
      maxOutputTokens: 2048
    }
  });

  // Build chat history for Gemini
  const chatHistory = history
    .filter(h => h.role === 'user' || h.role === 'assistant')
    .map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

  const chat = model.startChat({
    history: chatHistory,
    systemInstruction: systemPrompt
  });

  const result = await chat.sendMessage(message);
  return result.response.text();
}

// DeepSeek fallback with LOW TEMPERATURE
async function callDeepSeek(message, history, systemPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: message }
  ];

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 2048,
      temperature: 0.2
    })
  });

  if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// Claude fallback
async function callClaude(message, history, systemPrompt) {
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 2048,
    temperature: 0.2,
    system: systemPrompt,
    messages: [
      ...history.slice(-8).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message }
    ]
  });
  return response.content[0].text;
}

// ============================================================
// 📍 MAIN CHAT ENDPOINT
// ============================================================
router.post('/chat', async (req, res) => {
  try {
    const { message, mode = 'chat', webSearch = false, history = [], model } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let sources = [];
    let searchContext = '';

    // Fetch live web data if search enabled
    if (webSearch && ['chat', 'deepcore'].includes(mode)) {
      const searchResult = await searchWeb(message);
      searchContext = searchResult.context;
      sources = searchResult.sources;
    }

    const systemPrompt = getSystemPrompt(mode, searchContext);
    let reply = '';
    let modelUsed = '';
    let fallbackUsed = false;

    // ✅ Use Gemini 3.1 Flash if requested, otherwise try gemini first
    if (model === 'gemini-3.1-flash' || !model) {
      try {
        console.log('🌊 Using Gemini 3.1 Flash');
        reply = await callGemini(message, history, systemPrompt);
        modelUsed = 'gemini-3.1-flash';
      } catch (error) {
        console.warn('Gemini failed, falling back to DeepSeek:', error.message);
        fallbackUsed = true;
        try {
          console.log('🔵 Falling back to DeepSeek');
          reply = await callDeepSeek(message, history, systemPrompt);
          modelUsed = 'deepseek-chat';
        } catch (error2) {
          console.warn('DeepSeek failed, falling back to Claude:', error2.message);
          console.log('🟣 Falling back to Claude');
          reply = await callClaude(message, history, systemPrompt);
          modelUsed = 'claude-haiku';
        }
      }
    } else if (model === 'deepseek') {
      console.log('🔵 Using DeepSeek');
      reply = await callDeepSeek(message, history, systemPrompt);
      modelUsed = 'deepseek-chat';
    } else if (model === 'claude') {
      console.log('🟣 Using Claude');
      reply = await callClaude(message, history, systemPrompt);
      modelUsed = 'claude-haiku';
    } else {
      // Default: try Gemini first
      try {
        console.log('🌊 Trying Gemini 3.1 Flash (default)');
        reply = await callGemini(message, history, systemPrompt);
        modelUsed = 'gemini-3.1-flash';
      } catch (error) {
        console.warn('Gemini failed, falling back to DeepSeek:', error.message);
        try {
          reply = await callDeepSeek(message, history, systemPrompt);
          modelUsed = 'deepseek-chat';
        } catch (error2) {
          reply = await callClaude(message, history, systemPrompt);
          modelUsed = 'claude-haiku';
        }
      }
    }

    // Simple usage tracking (increment)
    // Note: You'll need to implement proper user auth and database tracking

    const duration = Date.now() - (req.startTime || Date.now());
    console.log(`Chat request completed in ${duration}ms using ${modelUsed}${fallbackUsed ? ' (fallback)' : ''}`);

    res.json({
      reply,
      sources,
      model: modelUsed,
      fallbackUsed
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// ============================================================
// 📍 IMAGE GENERATION ENDPOINT
// ============================================================
router.post('/image', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    let imageUrl = '';
    let revisedPrompt = '';
    let modelUsed = 'flux-schnell';

    // Try Flux Schnell (fal.ai)
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

      if (!falResponse.ok) throw new Error(`Flux error: ${falResponse.status}`);

      const falData = await falResponse.json();
      imageUrl = falData.images[0].url;
      revisedPrompt = prompt;
      console.log('✅ Flux image generated');

    } catch (fluxError) {
      // Fallback to DALL-E 3
      console.warn('Flux failed, falling back to DALL-E 3:', fluxError.message);
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
      console.log('✅ DALL-E 3 image generated');
    }

    res.json({
      url: imageUrl,
      revisedPrompt: revisedPrompt,
      model: modelUsed
    });

  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// ============================================================
// 📍 GET USER USAGE
// ============================================================
router.get('/usage', async (req, res) => {
  try {
    // Placeholder — implement with your auth and database
    res.json({
      chats: 0,
      images: 0,
      docs: 0
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// ============================================================
// 📍 GET AVAILABLE MODELS
// ============================================================
router.get('/models', (req, res) => {
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
