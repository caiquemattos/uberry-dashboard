require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const { initDatabase } = require('./database');
const authRoutes        = require('./routes/auth');
const poolsRoutes       = require('./routes/pools');
const matchesRoutes     = require('./routes/matches');
const predictionsRoutes = require('./routes/predictions');
const rankingsRoutes    = require('./routes/rankings');

const app  = express();
const PORT = process.env.PORT || 3000;

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/pools',       poolsRoutes);
app.use('/api/matches',     matchesRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/rankings',    rankingsRoutes);

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDatabase();

app.listen(PORT, () => {
  console.log(`⚽ Bolão Copa 2026 → http://localhost:${PORT}`);
  if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET não definido! Use o arquivo .env');
});
