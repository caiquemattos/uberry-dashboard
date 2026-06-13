const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { isPredictionLocked } = require('../utils/scoring');

const router = express.Router();

// Palpites do usuário em um bolão (todos os jogos)
router.get('/', requireAuth, (req, res) => {
  const { pool_id } = req.query;
  if (!pool_id) return res.status(400).json({ error: 'pool_id é obrigatório' });

  const db = getDb();
  const member = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(pool_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Você não é membro deste bolão' });

  const predictions = db.prepare(`
    SELECT p.*, m.scheduled_at, m.status AS match_status,
           m.home_team, m.away_team, m.home_score AS real_home, m.away_score AS real_away,
           m.phase, m.match_group
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND p.pool_id = ?
    ORDER BY m.scheduled_at ASC
  `).all(req.user.id, pool_id);

  res.json(predictions);
});

// Criar ou atualizar palpite
router.post('/', requireAuth, (req, res) => {
  const { pool_id, match_id, home_score, away_score } = req.body;

  if (!pool_id || !match_id || home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: 'Campos obrigatórios: pool_id, match_id, home_score, away_score' });
  }
  if (!Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
    return res.status(400).json({ error: 'Placar deve ser número inteiro não-negativo' });
  }

  const db = getDb();

  const member = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(pool_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Você não é membro deste bolão' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
  if (isPredictionLocked(match.scheduled_at) || match.status !== 'scheduled') {
    return res.status(400).json({ error: 'Prazo para palpite encerrado (10 min antes do jogo)' });
  }

  const existing = db.prepare('SELECT id FROM predictions WHERE user_id = ? AND match_id = ? AND pool_id = ?')
    .get(req.user.id, match_id, pool_id);

  if (existing) {
    db.prepare(
      'UPDATE predictions SET home_score = ?, away_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(home_score, away_score, existing.id);
    return res.json({ id: existing.id, user_id: req.user.id, match_id, pool_id, home_score, away_score });
  }

  const result = db.prepare(
    'INSERT INTO predictions (user_id, match_id, pool_id, home_score, away_score) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, match_id, pool_id, home_score, away_score);

  res.status(201).json({ id: result.lastInsertRowid, user_id: req.user.id, match_id, pool_id, home_score, away_score });
});

module.exports = router;
