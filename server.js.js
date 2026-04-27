require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./services/auth');
const { routeMessage } = require('./services/router');
const { addToQueue, getQueueStats } = require('./services/queue');
const { checkUsageAllowed, incrementUsage, getTodayUsage, logRequest } = require('./services/database');
const { sendAlert } = require('./services/alerts');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '2mb' }));

const ipLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', ipLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', queue: getQueueStats() });
});

app.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const usage = await getTodayUsage(req.userId);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch usage.' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, mode = 'chat', history = [] } = req.body;
  const userId = req.userId;

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const usageCheck = await checkUsageAllowed(userId, 'chats');
  if (!usageCheck.allowed) {
    return res.status(429).json({ error: `Daily limit reached (${usageCheck.limit} messages). Resets at midnight.` });
  }

  const trimmedHistory = (history || []).slice(-10).map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: String(h.content).slice(0, 2000)
  }));

  try {
    const result = await addToQueue(() => routeMessage(message.trim(), trimmedHistory, mode));
    await Promise.all([
      incrementUsage(userId, 'chats'),
      logRequest(userId, mode, result.model, false)
    ]).catch(err => console.warn(err.message));
    res.json({ reply: result.reply, model: result.model, remaining: usageCheck.remaining - 1 });
  } catch (err) {
    console.error(err.message);
    await sendAlert('Chat error', `User: ${userId}\nError: ${err.message}`);
    res.status(503).json({ error: 'AI service temporarily unavailable.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Essential AI backend on port ${PORT}`));