require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP.' }
}));

// ============================================================
// ✅ ROOT ROUTE
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'NES AI backend is running',
    version: '4.0',
    endpoints: ['/api/chat', '/api/image', '/api/usage', '/api/models', '/health']
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', router);

// Client/credentials/registration/partner routes — was a written, complete
// file (services/clientApi.js) that was never actually mounted by the
// server. Discovered Jun 18/19 2026 while preparing the platform manual:
// /api/client/:id/credentials, /api/client/:id/users, /api/client/:id/invite,
// and critically /api/register (used by the public Creativon signup page)
// were all silently 404ing in production.
require('./services/clientApi')(app);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NES AI backend running on port ${PORT} [production]`);
  console.log(`✅ Gemini 2.5 Flash ready (primary chat model)`);
  console.log(`✅ DeepSeek v4 Flash and Claude Haiku ready as fallbacks`);
  console.log(`✅ Flux ready (primary image model)`);
  console.log(`✅ GPT image-2 ready as image fallback`);
  console.log(`✅ Client API routes mounted (credentials, users, invite, register)`);
});

