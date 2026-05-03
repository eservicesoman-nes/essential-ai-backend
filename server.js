require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import your router (has all the Gemini/DeepSeek/Claude logic)
const router = require('./services/router');

const app = express();
const PORT = process.env.PORT || 10000;

// Security middleware
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS
app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors());

// Parse JSON
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP.' }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ USE YOUR ROUTER — This makes /api/chat, /api/image, /api/usage, /api/models work
app.use('/api', router);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Essential AI backend running on port ${PORT} [production]`);
  console.log(`✅ Gemini 1.5 Flash is ready`);
  console.log(`✅ DeepSeek and Claude as fallbacks`);
});
