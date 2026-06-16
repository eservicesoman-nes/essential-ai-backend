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
// 🤖 AI CLIENT INITIALIZATION
// ============================================================
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ============================================================
// 📅 SYSTEM PROMPT — NES AI IDENTITY + NES SERVICES
// ============================================================
function getSystemPrompt(mode, searchContext = '') {
  const now = new Date();
  const todayDate = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  let base = `You are NES AI, the AI assistant for New Essential Services (NES) — a leading ICT company headquartered in Oman with partners in Pakistan, Middle East, UK, USA and Canada.
Today's date is ${todayDate}. The current time is ${currentTime}.

You ONLY answer questions related to NES and its services. If asked anything unrelated, respond: "I'm here to help with New Essential Services products and solutions. How can I assist you with our services today?"

NES SERVICES:
- Master Systems Integration — airports and aviation critical systems
- Airport Operations Database (AODB) — flight scheduling and resource allocation
- National Single Window — international trade transaction systems
- Port Community System — electronic port communication
- Customs Modernization and Border Management — 50+ years experience
- Food Security Systems — Pakistan Food Security Information System (PFSIS) with Asian Development Bank
- Software Development — custom digital transformation solutions
- Robotics Process Automation (RPA) — business process automation
- Vehicle and Container Tracking — GPS fleet management in Oman, Safe Transport Environment Project
- API Development and Integration — enterprise-grade integrations
- Resource Augmentation — IT staffing and team extension
- Cloud Services — migration, security, optimization, disaster recovery
- Application Modernization — reducing operational resources, improving uptime
- Managed Services — monitoring, incident management, backup
- NES AI Platform — AI chatbots, automation workflows, AI receptionists, lead generation, social media automation, CEO assistant tools

CONTACT: office@essential-services.org
Free assessment: https://forms.gle/smgM9DnEALSHG9zJA
Website: https://essential-services.org

ABSOLUTE RULES:
1. You are NES AI — never identify as Gemini, Claude, DeepSeek or any other AI
2. When asked "Who created you?" respond: "I was created by New Essential Services"
3. Never invent facts, prices or company details not listed above
4. Always end responses with a relevant call to action
5. Uncertainty is correct — false confidence is a failure
6. Never use markdown formatting like **bold** or ## headers — use plain text only
7. When listing items use the • bullet symbol, not dashes or asterisks`;

  if (searchContext && searchContext.trim().length > 100) {
    base += `\n\nLIVE SEARCH RESULTS — use ONLY these for your answer:\n${searchContext}\nIf these results don't directly answer the question, say: "I found some results but they don't directly answer your question."`;
  } else {
    base += `\n\nNo search results available. Answer only from the NES service knowledge above.`;
  }

  return base;
}

// ============================================================
// 🔍 TAVILY WEB SEARCH WITH SCORE FILTERING
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
// 🌊 GEMINI CALL
// ============================================================
async function callGemini(message, history, systemPrompt) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.1,
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
async function callDeepSeek(messages, systemPrompt) {
  const deepseekMessages = [{ role: 'system', content: systemPrompt }, ...messages];

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
async function callClaude(messages, systemPrompt) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
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
// 📍 CHAT ENDPOINT
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
    const { data: usage } = await supabase
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

    if (webSearch && ['chat', 'deepcore'].includes(mode)) {
      const searchResult = await searchWeb(message);
      searchContext = searchResult.context;
      sources = searchResult.sources;
    }

    const systemPrompt = getSystemPrompt(mode, searchContext);

    // Docs mode: text already extracted client-side (PDF/DOCX/XLSX/TXT all read as plain text in-browser),
    // so DeepSeek handles it just as well as Gemini. Try DeepSeek first for docs, fallback to Gemini, then Claude.
    // For all other modes, keep Gemini first (multimodal/web-search aware), fallback to DeepSeek, then Claude.
    if (mode === 'docs') {
      try {
        console.log('🔵 Using DeepSeek (docs mode)');
        reply = await callDeepSeek(messages, systemPrompt);
      } catch (deepseekError) {
        console.error('DeepSeek error, falling back to Gemini:', deepseekError.message);
        try {
          reply = await callGemini(message, history, systemPrompt);
        } catch (geminiError) {
          console.error('Gemini error, falling back to Claude:', geminiError.message);
          reply = await callClaude(messages, systemPrompt);
        }
      }
    } else {
      try {
        console.log('🌊 Using Gemini 3 Flash Preview');
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-3-flash-preview',
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        });
        const chat = geminiModel.startChat({ history: [] });
        const result = await chat.sendMessage(message);
        reply = result.response.text();
      } catch (geminiError) {
        console.error('Gemini error, falling back to DeepSeek:', geminiError.message);
        try {
          reply = await callDeepSeek(messages, systemPrompt);
        } catch (deepseekError) {
          console.error('DeepSeek error, falling back to Claude:', deepseekError.message);
          reply = await callClaude(messages, systemPrompt);
        }
      }
    }

    await incrementUsage(req.user.id, 'chat');

    const duration = Date.now() - startTime;
    console.log(`Chat completed in ${duration}ms`);

    res.json({ reply, sources, usage: { remaining: limit - (chatsUsed + 1) } });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// ============================================================
// 🪙 IMAGE CREDITS HELPERS
// ============================================================
async function getOrCreateImageCredits(userId) {
  const { data: existing } = await supabase
    .from('image_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) return existing;

  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: created } = await supabase
    .from('image_credits')
    .insert({ user_id: userId, balance: 0, trial_credits_remaining: 10, trial_ends_at: trialEndsAt })
    .select()
    .single();

  await logImageCreditTransaction(userId, 'trial_grant', 10, 10, null, 'Initial 7-day trial credit grant');
  return created;
}

async function logImageCreditTransaction(userId, type, amount, balanceAfter, thawaniReference = null, notes = null) {
  await supabase.from('image_credit_transactions').insert({
    user_id: userId,
    type,
    amount,
    balance_after: balanceAfter,
    thawani_reference: thawaniReference,
    notes
  });
}

// Deducts one credit, preferring trial credits (while trial is active) over the paid balance.
// Returns { ok: true } if a credit was available and deducted, or { ok: false } if both are exhausted.
async function deductImageCredit(userId, credits) {
  const trialActive = credits.trial_ends_at && new Date(credits.trial_ends_at) > new Date();

  if (trialActive && credits.trial_credits_remaining > 0) {
    const newTrialRemaining = credits.trial_credits_remaining - 1;
    await supabase.from('image_credits').update({ trial_credits_remaining: newTrialRemaining, updated_at: new Date().toISOString() }).eq('user_id', userId);
    await logImageCreditTransaction(userId, 'generation', -1, credits.balance, null, 'Trial credit used');
    return { ok: true, source: 'trial' };
  }

  if (credits.balance > 0) {
    const newBalance = credits.balance - 1;
    await supabase.from('image_credits').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId);
    await logImageCreditTransaction(userId, 'generation', -1, newBalance, null, 'Paid credit used');
    return { ok: true, source: 'balance' };
  }

  return { ok: false };
}

// Uploads a base64-encoded image (from GPT Image 2) to Supabase Storage and returns a public URL.
async function uploadBase64ImageToStorage(base64Data, userId) {
  const buffer = Buffer.from(base64Data, 'base64');
  const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

  const { error: uploadError } = await supabase.storage
    .from('generated-images')
    .upload(filename, buffer, { contentType: 'image/png' });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: publicUrlData } = supabase.storage
    .from('generated-images')
    .getPublicUrl(filename);

  return publicUrlData.publicUrl;
}

// ============================================================
// 📍 IMAGE GENERATION — FLUX + GPT IMAGE 2 FALLBACK, PAYG CREDITS
// ============================================================
router.post('/image', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabase
      .from('usage')
      .select('images_used')
      .eq('user_id', req.user.id)
      .eq('date', today)
      .single();

    const imagesUsed = usage?.images_used || 0;
    const dailyLimit = 3;
    const withinDailyAllowance = imagesUsed < dailyLimit;

    let creditSourceUsed = null;
    let credits = null;

    if (!withinDailyAllowance) {
      // Daily free allowance exhausted — fall back to trial/paid credits.
      credits = await getOrCreateImageCredits(req.user.id);
      const deduction = await deductImageCredit(req.user.id, credits);
      if (!deduction.ok) {
        return res.status(429).json({
          error: 'Daily image limit reached and no credits remaining',
          limit: dailyLimit,
          used: imagesUsed,
          creditsBalance: credits.balance,
          trialCreditsRemaining: credits.trial_credits_remaining
        });
      }
      creditSourceUsed = deduction.source;
    }

    let imageUrl = '';
    let revisedPrompt = '';
    let modelUsed = 'flux-schnell';

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
      console.error('Flux error, falling back to GPT Image 2:', fluxError.message);
      modelUsed = 'gpt-image-2';
      const gptImageResponse = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: prompt,
        n: 1,
        size: '1024x1024'
      });
      const b64Data = gptImageResponse.data[0].b64_json;
      imageUrl = await uploadBase64ImageToStorage(b64Data, req.user.id);
      revisedPrompt = prompt;
      console.log('✅ GPT Image 2 fallback image generated and uploaded');
    }

    if (withinDailyAllowance) {
      await incrementUsage(req.user.id, 'image');
    }

    const responsePayload = {
      url: imageUrl,
      revisedPrompt,
      model: modelUsed,
      usage: { remaining: withinDailyAllowance ? dailyLimit - (imagesUsed + 1) : 0 }
    };

    if (creditSourceUsed) {
      const { data: latestCredits } = await supabase
        .from('image_credits')
        .select('balance, trial_credits_remaining')
        .eq('user_id', req.user.id)
        .single();
      responsePayload.creditsUsed = creditSourceUsed;
      responsePayload.creditsBalance = latestCredits?.balance ?? 0;
      responsePayload.trialCreditsRemaining = latestCredits?.trial_credits_remaining ?? 0;
    }

    res.json(responsePayload);

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
    const today = new Date().toISOString().split('T')[0];
    let { data: usage, error } = await supabase
      .from('usage')
      .select('chats_used, images_used, docs_used')
      .eq('user_id', req.user.id)
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
      { id: 'gemini-3-flash-preview', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },
      { id: 'deepseek', name: 'NES AI Core', provider: 'NES AI', context: '128K', speed: 'Normal' },
      { id: 'claude', name: 'NES AI Pro', provider: 'NES AI', context: '200K', speed: 'Normal' }
    ],
    default: 'gemini-3-flash-preview'
  });
});

module.exports = router;
