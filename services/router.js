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

// ============================================================
// 🤖 SYSTEM PROMPT - UNIFIED IDENTITY FOR ALL MODELS
// ============================================================
const SYSTEM_PROMPT = `You are NES AI, your unified intelligence platform.
Never mention Google, DeepSeek, Anthropic, OpenAI, or any specific AI company.
Never say "I am a language model", "trained by", "LLM", or "large language model".
When asked "Who are you?" or "What are you?" respond with: "I am NES AI, your unified intelligence platform."
When asked "Who created you?" respond with: "I was created by NES AI Solutions."
Keep responses helpful, concise, and professional.`;

const WEB_SEARCH_ADDITION = ` You have access to live web search. Provide accurate, up-to-date information with citations when possible.`;

// ============================================================

// Helper: DeepSeek API call
async function callDeepSeek(messages, webSearch = false) {
  try {
    let systemContent = SYSTEM_PROMPT;
    if (webSearch) {
      systemContent += WEB_SEARCH_ADDITION;
    }
    
    const deepseekMessages = [
      { role: 'system', content: systemContent },
      ...messages
    ];
    
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
    let systemPrompt = SYSTEM_PROMPT;
    if (webSearch) {
      systemPrompt += WEB_SEARCH_ADDITION;
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
// 📍 CHAT ENDPOINT with gemini-3.1-flash
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
    
    // ✅ GEMINI 2.5 FLASH with System Instruction
    if (model === 'gemini-3.1-flash') {
      console.log('🌊 Using gemini-3.1-flash with NES AI identity');
      try {
        const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash' });
        const result = await geminiModel.generateContent({
          contents: [{ role: "user", parts: [{ text: message }] }],
          systemInstruction: SYSTEM_PROMPT + (webSearch ? WEB_SEARCH_ADDITION : '')
        });
        reply = result.response.text();
      } catch (geminiError) {
        console.error('Gemini error, falling back to DeepSeek:', geminiError);
        reply = await callDeepSeek(messages, webSearch);
      }
    } else if (model === 'deepseek') {
      console.log('🔵 Using DeepSeek with NES AI identity');
      reply = await callDeepSeek(messages, webSearch);
    } else if (model === 'claude') {
      console.log('🟣 Using Claude with NES AI identity');
      reply = await callClaude(messages, webSearch);
    } else {
      // Default: Try Gemini first, then DeepSeek, then Claude
      console.log('🌊 No model specified, trying Gemini first with NES AI identity');
      try {
        const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash' });
        const result = await geminiModel.generateContent({
          contents: [{ role: "user", parts: [{ text: message }] }],
          systemInstruction: SYSTEM_PROMPT + (webSearch ? WEB_SEARCH_ADDITION : '')
        });
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
// 📍 IMAGE GENERATION ENDPOINT - FLUX SCHNELL (PRIMARY) + DALL-E (FALLBACK)
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
      return res.status(429).json({ 
        error: 'Daily image limit reached',
        limit,
        used: imagesUsed
      });
    }
    
    let imageUrl = '';
    let revisedPrompt = '';
    let modelUsed = 'flux-schnell';
    
    // ✅ PRIMARY: Try Flux Schnell (fal.ai)
    try {
      console.log('🎨 Generating image with Flux Schnell (fal.ai)');
      
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
          guidance_scale: 0,
          num_images: 1,
          enable_safety_checker: true
        })
      });
      
      if (!falResponse.ok) {
        throw new Error(`Flux API error: ${falResponse.status}`);
      }
      
      const falData = await falResponse.json();
      imageUrl = falData.images[0].url;
      revisedPrompt = prompt;
      console.log('✅ Flux Schnell image generated successfully');
      
    } catch (fluxError) {
      // ⚠️ FALLBACK: DALL-E 3 (only if Flux fails)
      console.error('Flux error, falling back to DALL-E 3:', fluxError.message);
      modelUsed = 'dall-e-3';
      
      try {
        const dalleResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        });
        
        imageUrl = dalleResponse.data[0].url;
        revisedPrompt = dalleResponse.data[0].revised_prompt;
        console.log('✅ DALL-E 3 fallback image generated successfully');
        
      } catch (dalleError) {
        console.error('DALL-E fallback also failed:', dalleError);
        throw new Error('Both Flux and DALL-E image generation failed');
      }
    }
    
    // Increment usage counter
    await incrementUsage(req.user.id, 'image');
    
    res.json({ 
      url: imageUrl, 
      revisedPrompt: revisedPrompt,
      model: modelUsed,
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
      { id: 'gemini-3.1-flash', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },
      { id: 'deepseek', name: 'NES AI Core', provider: 'NES AI', context: '128K', speed: 'Normal' },
      { id: 'claude', name: 'NES AI Pro', provider: 'NES AI', context: '200K', speed: 'Normal' }
    ],
    default: 'gemini-3.1-flash'
  });
});

module.exports = router;
