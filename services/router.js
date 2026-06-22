const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// 🔐 SUPABASE CONFIGURATION
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://sfpfjjdtczvuxyhjievt.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MH7rnJ7r8_-1TzGXcieNfA_NXoHQZbm';
const supabase = createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: ws } });

// Service-role client, used ONLY for admin operations (e.g. creating auth
// users during client onboarding) that the anon key cannot perform.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, { realtime: { transport: ws } }) : null;

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
5. Uncertainty is correct — false confidence is a failure
6. Never use markdown formatting like **bold** or ## headers — use plain text only
7. When listing items use the • bullet symbol, not dashes or asterisks`;

  if (searchContext && searchContext.trim().length > 100) {
    base += `\n\nLIVE SEARCH RESULTS — use ONLY these for your answer. You MUST answer the user's question using these results regardless of topic:\n${searchContext}`;
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
    model: 'gemini-2.5-flash',
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
      model: 'deepseek-v4-flash',
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

    if (webSearch && mode === 'chat') {
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
        console.log('🌊 Using Gemini 2.5 Flash');
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
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

    await incrementUsage(req.user.id, mode === 'docs' ? 'docs' : 'chat');

    const duration = Date.now() - startTime;
    console.log(`Chat completed in ${duration}ms`);

    // SSE streaming response for frontend
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (sources.length > 0) {
      res.write('data: ' + JSON.stringify({ type: 'sources', sources }) + '\n\n');
    }
    const chunkSize = 20;
    for (let i = 0; i < reply.length; i += chunkSize) {
      res.write('data: ' + JSON.stringify({ type: 'chunk', text: reply.slice(i, i + chunkSize) }) + '\n\n');
    }
    res.write('data: ' + JSON.stringify({ type: 'done', usage: { remaining: limit - (chatsUsed + 1) } }) + '\n\n');
    res.end();

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

  const { data: created } = await supabase
    .from('image_credits')
    .insert({ user_id: userId, balance: 0 })
    .select()
    .single();

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

// Deducts one credit from the paid balance. Returns { ok: true } if a
// credit was available and deducted, or { ok: false } if balance is empty.
async function deductImageCredit(userId, credits) {
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

// Determines whether a user's 3/day free image allowance still applies.
// Looks up the client record linked via clients.user_id. Returns:
//   { freeAllowanceActive: true }  — full_access_override is on, OR trial_start
//                                    is null/not yet set, OR trial hasn't expired
//   { freeAllowanceActive: false } — trial has expired and no override
// If no client record is linked to this user at all, defaults to TRUE
// (fail-open) so users without a client record yet aren't unexpectedly blocked.
async function checkFreeAllowanceActive(userId) {
  const { data: client } = await supabase
    .from('clients')
    .select('trial_start, trial_duration_days, full_access_override')
    .eq('user_id', userId)
    .single();

  if (!client) return { freeAllowanceActive: true };
  if (client.full_access_override) return { freeAllowanceActive: true };
  if (!client.trial_start) return { freeAllowanceActive: true };

  const trialDays = client.trial_duration_days || 7;
  const trialEnd = new Date(new Date(client.trial_start).getTime() + trialDays * 24 * 60 * 60 * 1000);
  const trialExpired = new Date() > trialEnd;

  return { freeAllowanceActive: !trialExpired };
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

    const { freeAllowanceActive } = await checkFreeAllowanceActive(req.user.id);

    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabase
      .from('usage')
      .select('images_used')
      .eq('user_id', req.user.id)
      .eq('date', today)
      .single();

    const imagesUsed = usage?.images_used || 0;
    const dailyLimit = 3;
    const withinDailyAllowance = freeAllowanceActive && imagesUsed < dailyLimit;

    let creditSourceUsed = null;
    let credits = null;

    if (!withinDailyAllowance) {
      // Daily free allowance exhausted OR trial expired — fall back to paid PAYG credits.
      credits = await getOrCreateImageCredits(req.user.id);
      const deduction = await deductImageCredit(req.user.id, credits);
      if (!deduction.ok) {
        return res.status(429).json({
          error: freeAllowanceActive ? 'Daily image limit reached and no credits remaining' : 'Free trial ended — please purchase image credits to continue',
          limit: dailyLimit,
          used: imagesUsed,
          trialExpired: !freeAllowanceActive,
          creditsBalance: credits.balance
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
        .select('balance')
        .eq('user_id', req.user.id)
        .single();
      responsePayload.creditsUsed = creditSourceUsed;
      responsePayload.creditsBalance = latestCredits?.balance ?? 0;
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

    const credits = await getOrCreateImageCredits(req.user.id);
    const { freeAllowanceActive } = await checkFreeAllowanceActive(req.user.id);

    res.json({
      chats: usage.chats_used || 0,
      images: usage.images_used || 0,
      docs: usage.docs_used || 0,
      imageCredits: {
        dailyFreeRemaining: freeAllowanceActive ? Math.max(0, 3 - (usage.images_used || 0)) : 0,
        balance: credits.balance,
        freeAllowanceActive
      }
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
      { id: 'gemini-2.5-flash', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },
      { id: 'deepseek', name: 'NES AI Core', provider: 'NES AI', context: '128K', speed: 'Normal' },
      { id: 'claude', name: 'NES AI Pro', provider: 'NES AI', context: '200K', speed: 'Normal' }
    ],
    default: 'gemini-2.5-flash'
  });
});

// ============================================================
// 📍 CREATE LOGIN FOR CLIENT (onboarding) — links clients.user_id
// ============================================================
router.post('/clients/:clientId/create-login', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    }

    const { clientId } = req.params;

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, email, user_id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (client.user_id) {
      return res.status(400).json({ error: 'This client already has a linked login', user_id: client.user_id });
    }

    if (!client.email) {
      return res.status(400).json({ error: 'Client has no email on file — add one before creating a login' });
    }

    // Generate a random temporary password the client will be told to change.
    const tempPassword = 'Nes' + Math.random().toString(36).slice(2, 8) + '!' + Math.floor(Math.random() * 1000);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: client.email,
      password: tempPassword,
      email_confirm: true
    });

    if (createError) {
      // Most common case: an auth account with this email already exists
      // but was never linked. Surface a clear message rather than a raw error.
      return res.status(400).json({ error: `Could not create login: ${createError.message}` });
    }

    const { error: linkError } = await supabase
      .from('clients')
      .update({ user_id: newUser.user.id })
      .eq('id', clientId);

    if (linkError) {
      return res.status(500).json({ error: `Login created but linking failed: ${linkError.message}` });
    }

    res.json({
      success: true,
      user_id: newUser.user.id,
      email: client.email,
      temp_password: tempPassword
    });

  } catch (error) {
    console.error('Create login error:', error);
    res.status(500).json({ error: 'Failed to create login' });
  }
});

// ============================================================
// 📍 GRANT IMAGE CREDITS TO A CLIENT (manual top-up, Client Manager)
// ============================================================
router.post('/clients/:clientId/grant-credits', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { amount, note } = req.body;

    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'A positive credit amount is required' });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!client.user_id) {
      return res.status(400).json({ error: 'This client has no linked login yet — create one first before granting credits' });
    }

    const credits = await getOrCreateImageCredits(client.user_id);
    const newBalance = credits.balance + parsedAmount;

    const { error: updateError } = await supabase
      .from('image_credits')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', client.user_id);

    if (updateError) {
      return res.status(500).json({ error: `Failed to update balance: ${updateError.message}` });
    }

    await logImageCreditTransaction(client.user_id, 'purchase', parsedAmount, newBalance, null, note || `Manual grant via Client Manager (${parsedAmount} credits)`);

    res.json({ success: true, newBalance, granted: parsedAmount });

  } catch (error) {
    console.error('Grant credits error:', error);
    res.status(500).json({ error: 'Failed to grant credits' });
  }
});

// ============================================================
// 📧 EMAIL ROUTES — moved here from the orphaned top-level router.js,
// which was never mounted by server.js (server.js requires ./services/router
// only). These routes existed in code but were never live in production.
// ============================================================
const { getProviderSettings, testConnection, fetchEmails, sendEmail } = require('./emailService');
const crypto = require('crypto');

function encryptPassword(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'mOq5P4pmkCGQGH2UfxUCsBLZP2h3XtdWZssZ/jKNlbs=', 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}

function decryptPassword(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'mOq5P4pmkCGQGH2UfxUCsBLZP2h3XtdWZssZ/jKNlbs=', 'base64');
  const [ivHex, encrypted] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

// GET /api/email/accounts/:clientId
router.get('/email/accounts/:clientId', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    const { data } = await supabaseAdmin.from('email_accounts').select('id,email_address,provider,imap_server,imap_port,smtp_server,smtp_port,label,is_active,last_synced').eq('client_id', req.params.clientId);
    res.json({ accounts: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/email/connect
router.post('/email/connect', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    const { client_id, email_address, app_password, provider, label, imap_server, imap_port, smtp_server, smtp_port } = req.body;
    const settings = getProviderSettings(provider);
    const account = {
      email_address,
      app_password,
      imap_server: imap_server || settings.imap_server,
      imap_port: imap_port || settings.imap_port,
      smtp_server: smtp_server || settings.smtp_server,
      smtp_port: smtp_port || settings.smtp_port,
      username: email_address,
    };
    await testConnection(account);
    const encrypted = encryptPassword(app_password);
    const { data, error } = await supabaseAdmin.from('email_accounts').insert([{
      client_id, email_address, app_password: encrypted, provider,
      label: label || email_address,
      imap_server: account.imap_server,
      imap_port: account.imap_port,
      smtp_server: account.smtp_server,
      smtp_port: account.smtp_port,
    }]).select().single();
    if(error) throw new Error(error.message);
    res.json({ success: true, account: { id: data.id, email_address, provider, label } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/email/inbox/:clientId
router.get('/email/inbox/:clientId', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    const { data: accounts } = await supabaseAdmin.from('email_accounts').select('*').eq('client_id', req.params.clientId).eq('is_active', true);
    if(!accounts || accounts.length === 0) return res.json({ emails: [] });
    const allEmails = [];
    for(const account of accounts) {
      try {
        account.app_password = decryptPassword(account.app_password);
        const emails = await fetchEmails(account, 20);
        emails.forEach(e => { e.account_id = account.id; e.account_email = account.email_address; e.account_label = account.label; });
        allEmails.push(...emails);
        await supabaseAdmin.from('email_accounts').update({ last_synced: new Date().toISOString() }).eq('id', account.id);
      } catch(e) { console.error('Fetch error for', account.email_address, e.message); }
    }
    allEmails.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
    res.json({ emails: allEmails.slice(0, 50) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/email/send
router.post('/email/send', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    const { account_id, to, subject, body, replyTo } = req.body;
    const { data: account } = await supabaseAdmin.from('email_accounts').select('*').eq('id', account_id).single();
    if(!account) return res.status(404).json({ error: 'Account not found' });
    account.app_password = decryptPassword(account.app_password);
    await sendEmail(account, { to, subject, body, replyTo });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/email/account/:id
router.delete('/email/account/:id', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    await supabaseAdmin.from('email_accounts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/email/body/:accountId/:uid
router.get('/email/body/:accountId/:uid', authenticate, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' });
    const { data: account } = await supabaseAdmin.from('email_accounts').select('*').eq('id', req.params.accountId).single();
    if(!account) return res.status(404).json({ error: 'Account not found' });
    account.app_password = decryptPassword(account.app_password);
    const Imap = require('node-imap');
    const { simpleParser } = require('mailparser');
    const result = await new Promise((resolve, reject) => {
      const imap = new Imap({ user:account.username||account.email_address, password:account.app_password, host:account.imap_server, port:account.imap_port||993, tls:true, tlsOptions:{rejectUnauthorized:false}, connTimeout:15000, authTimeout:15000 });
      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err) => {
          if(err){ imap.end(); return reject(err); }
          const fetch = imap.fetch(req.params.uid, { bodies: [''] });
          let rawEmail = '';
          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              stream.on('data', (c) => rawEmail += c.toString('utf8'));
            });
          });
          fetch.once('error', reject);
          fetch.once('end', () => { imap.end(); resolve(rawEmail); });
        });
      });
      imap.once('error', reject);
      imap.connect();
    });
    const parsed = await simpleParser(result);
    const body = parsed.text || parsed.html?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim() || '';
    res.json({ body, subject: parsed.subject, from: parsed.from?.text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// 📍 CLIENT PAYMENTS — record + history + lifetime total
// ============================================================

// Record a payment or adjustment (manual entry, e.g. cash/bank transfer/rebate).
router.post('/clients/:clientId/payments', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { type, method, amount, note, billing_period } = req.body;

    if (!['payment', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'type must be "payment" or "adjustment"' });
    }
    if (!['thawani', 'cash', 'bank_transfer', 'rebate', 'other'].includes(method)) {
      return res.status(400).json({ error: 'Invalid method' });
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }

    // GUARD: manual entries must always carry a note, so there's always a
    // reason on record for why someone recorded this by hand.
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'A note is required for manual entries (e.g. receipt #, who received it)' });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // GUARD: block rebates/adjustments from pushing the lifetime total negative.
    if (type === 'adjustment') {
      const { data: existing } = await supabase
        .from('client_payments')
        .select('type, amount')
        .eq('client_id', clientId);
      const currentTotal = (existing || []).reduce((sum, p) => sum + (p.type === 'adjustment' ? -Math.abs(p.amount) : p.amount), 0);
      if (parsedAmount > currentTotal) {
        return res.status(400).json({ error: `Rebate of ${parsedAmount} would exceed the client's current lifetime total of ${currentTotal.toFixed(2)} — reduce the amount` });
      }
    }

    // GUARD: warn (not block) if a payment already exists for this billing period.
    let duplicateWarning = null;
    if (billing_period && type === 'payment') {
      const { data: existingForPeriod } = await supabase
        .from('client_payments')
        .select('id, method, source')
        .eq('client_id', clientId)
        .eq('billing_period', billing_period)
        .eq('type', 'payment');
      if (existingForPeriod && existingForPeriod.length > 0) {
        duplicateWarning = `This billing period already has ${existingForPeriod.length} payment(s) recorded — entry added anyway`;
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('client_payments')
      .insert({
        client_id: clientId,
        type,
        method,
        source: 'manual',
        amount: parsedAmount,
        note: note.trim(),
        billing_period: billing_period || null,
        created_by: req.user.id
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: `Failed to record entry: ${insertError.message}` });
    }

    res.json({ success: true, entry: inserted, warning: duplicateWarning });

  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Fetch payment history + lifetime total (plan payments/adjustments + image credit purchases).
router.get('/clients/:clientId/payments', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { data: payments } = await supabase
      .from('client_payments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    let creditPurchases = [];
    if (client.user_id) {
      const { data: txns } = await supabase
        .from('image_credit_transactions')
        .select('*')
        .eq('user_id', client.user_id)
        .eq('type', 'purchase')
        .order('created_at', { ascending: false });
      creditPurchases = txns || [];
    }

    const planTotal = (payments || []).reduce((sum, p) => sum + (p.type === 'adjustment' ? -Math.abs(p.amount) : p.amount), 0);
    // Note: image credit purchases are tracked in credit units, not OMR, so they
    // contribute to history but are not currently summed into the OMR lifetime total.

    res.json({
      payments: payments || [],
      creditPurchases,
      lifetimeTotalOMR: Math.max(0, planTotal)
    });

  } catch (error) {
    console.error('Fetch payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

module.exports = router;
module.exports.authenticate = authenticate;
