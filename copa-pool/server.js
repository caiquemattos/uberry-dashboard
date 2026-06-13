require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { initDatabase } = require('./database');
const authRoutes        = require('./routes/auth');
const poolsRoutes       = require('./routes/pools');
const matchesRoutes     = require('./routes/matches');
const predictionsRoutes = require('./routes/predictions');
const rankingsRoutes    = require('./routes/rankings');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',        authRoutes);
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
