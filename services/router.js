const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// 🔐 SUPABASE CONFIGURATION - YOUR KEYS GO HERE
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://sfpfjjdtczvuxyhjievt.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MH7rnJ7r8_-1TzGXcieNfA_NXoHQZbm';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// ============================================================

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ✅ GEMINI INTEGRATION
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Helper: DeepSeek API call
async function callDeepSeek(messages, webSearch = false) {
  try {
    const deepseekMessages = webSearch 
      ? [{ role: 'system', content: 'You have access to live web search. Provide accurate, up-to-date information with citations when possible.' }, ...messages]
      : messages;
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: deepseekMessages,
        temperature: 0.7,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('DeepSeek error:', error);
    throw error;
  }
}

// Helper: Claude API call
async function callClaude(messages, webSearch = false) {
  try {
    let systemPrompt = '';
    if (webSearch) {
      systemPrompt = 'You have access to live web search. Provide accurate, up-to-date information with citations when possible.';
    }
    
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    });
    
    return response.content[0].text;
  } catch (error) {
    console.error('Claude error:', error);
    throw error;
  }
}

// Helper: Increment usage counter
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
      await supabase.from('usage').insert({
        user_id: userId,
        date: today,
        [column]: 1
      });
    } else if (!fetchError && existing) {
      await supabase.from('usage')
        .update({ [column]: (existing[column] || 0) + 1 })
        .eq('id', existing.id);
    }
  } catch (error) {
    console.error('Increment usage error:', error);
  }
}

// Authentication middleware
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ============================================================
// 📍 CHAT ENDPOINT with Gemini 1.5 Flash
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
      return res.status(429).json({ 
        error: 'Daily message limit reached',
        limit,
        used: chatsUsed
      });
    }
    
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];
    
    let reply = '';
    let sources = [];
    
    // ✅ GEMINI PRIORITY - Check if Gemini was selected
    if (model === 'gemini-1.5-flash-latest') {
      console.log('🌊 Using Gemini 1.5 Flash');
      try {
        const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
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
      // Default: Try Gemini first, then DeepSeek, then Claude
      console.log('🌊 No model specified, trying Gemini first');
      try {
        const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
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
    
    // Increment usage counter
    await incrementUsage(req.user.id, 'chat');
    
    const duration = Date.now() - startTime;
    console.log(`Chat request completed in ${duration}ms`);
    
    res.json({ 
      reply, 
      sources,
      usage: { remaining: limit - (chatsUsed + 1) }
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// ============================================================
// 📍 IMAGE GENERATION ENDPOINT (DALL-E)
// ============================================================
router.post('/image', authenticate, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Check usage limits
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
      return res.status(429).json({ 
        error: 'Daily image limit reached',
        limit,
        used: imagesUsed
      });
    }
    
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    
    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;
    
    await incrementUsage(req.user.id, 'image');
    
    res.json({ 
      url: imageUrl, 
      revisedPrompt: revisedPrompt,
      usage: { remaining: limit - (imagesUsed + 1) }
    });
    
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
      { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', provider: 'Google', context: '1M', speed: 'Fastest' },
      { id: 'deepseek', name: 'DeepSeek V3', provider: 'DeepSeek', context: '128K', speed: 'Normal' },
      { id: 'claude', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', context: '200K', speed: 'Normal' }
    ],
    default: 'gemini-1.5-flash-latest'
  });
});

module.exports = router;
