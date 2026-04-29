// server.js  —  Essential AI Backend v2
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { requireAuth }          = require('./services/auth');
const { routeMessage }         = require('./services/router');
const { generateImage }        = require('./services/image');
const { addToQueue, getQueueStats } = require('./services/queue');
const { checkUsageAllowed, incrementUsage, getTodayUsage, logRequest } = require('./services/database');
const { sendAlert }            = require('./services/alerts');

const REQUIRED_ENV = [
  'DEEPSEEK_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY',
  'TAVILY_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`STARTUP ERROR: Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));

// ✅ CORS — accept all origins
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors());

app.use(express.json({ limit: '2mb' }));

app.use('/api/', rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests from this IP.' }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', queue: getQueueStats(), ts: new Date().toISOString() });
});

app.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const usage = await getTodayUsage(req.userId);
    res.json(usage);
  } catch (err) {
    console.error('GET /api/usage:', err.message);
    res.status(500).json({ error: 'Could not fetch usage.' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, mode = 'chat', webSearch = false, history = [] } = req.body;
  const userId = req.userId;

  if (!message || typeof message !== 'string' || !message.trim())
    return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 8000)
    return res.status(400).json({ error: 'Message too long (max 8000 characters).' });
  const VALID_MODES = ['chat', 'deepcore', 'docs', 'image'];
  if (!VALID_MODES.includes(mode))
    return res.status(400).json({ error: `Invalid mode.` });

  const usageCheck = await checkUsageAllowed(userId, 'chats');
  if (!usageCheck.allowed)
    return res.status(429).json({ error: `Daily limit reached. Resets at midnight.` });

  const cleanHistory = Array.isArray(history)
    ? history.slice(-10).map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content || '').slice(0, 2000)
      })) : [];

  const searchEnabled = webSearch && ['chat', 'deepcore'].includes(mode);

  try {
    const result = await addToQueue(() =>
      routeMessage(message.trim(), cleanHistory, mode, searchEnabled)
    );
    Promise.all([
      incrementUsage(userId, 'chats'),
      logRequest(userId, mode, result.model, searchEnabled, result.fallbackUsed)
    ]).catch(err => console.warn('Post-response DB ops failed:', err.message));

    return res.json({
      reply: result.reply, model: result.model,
      fallbackUsed: result.fallbackUsed,
      sources: result.sources || [],
      remaining: usageCheck.remaining - 1
    });
  } catch (err) {
    console.error(`/api/chat error for ${userId}:`, err.message);
    await sendAlert('Chat endpoint error', `User: ${userId}\n${err.message}`);
    return res.status(503).json({ error: 'AI service temporarily unavailable.' });
  }
});

app.post('/api/image', requireAuth, async (req, res) => {
  const { prompt, size = '1024x1024', quality = 'standard' } = req.body;
  const userId = req.userId;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim())
    return res.status(400).json({ error: 'Prompt is required.' });
  if (prompt.length > 4000)
    return res.status(400).json({ error: 'Prompt too long.' });

  const usageCheck = await checkUsageAllowed(userId, 'images');
  if (!usageCheck.allowed)
    return res.status(429).json({ error: `Daily image limit reached.` });

  try {
    const result = await addToQueue(() => generateImage(prompt.trim(), size, quality));
    Promise.all([
      incrementUsage(userId, 'images'),
      logRequest(userId, 'image', 'dall-e-3', false, false)
    ]).catch(err => console.warn('Post-image DB ops failed:', err.message));

    return res.json({
      url: result.url,
      revisedPrompt: result.revisedPrompt,
      remaining: usageCheck.remaining - 1
    });
  } catch (err) {
    console.error(`/api/image error for ${userId}:`, err.message);
    await sendAlert('Image generation error', `User: ${userId}\n${err.message}`);
    return res.status(503).json({ error: 'Image generation temporarily unavailable.' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error('Unhandled:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Essential AI backend running on port ${PORT} [${process.env.NODE_ENV}]`);
});
