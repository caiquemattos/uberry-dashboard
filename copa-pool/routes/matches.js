const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { phase, group, status } = req.query;

  let sql = 'SELECT * FROM matches WHERE 1=1';
  const params = [];

  if (phase) { sql += ' AND phase = ?'; params.push(phase); }
  if (group) { sql += ' AND match_group = ?'; params.push(group); }
  if (status) { sql += ' AND status = ?'; params.push(status); }

  sql += ' ORDER BY scheduled_at ASC';

  const matches = db.prepare(sql).all(...params);
  res.json(matches);
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
  res.json(match);
});

// Admin: atualizar resultado de uma partida
router.patch('/:id/result', requireAdmin, (req, res) => {
  const { home_score, away_score, status } = req.body;
  if (home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: 'Placar do mandante e visitante são obrigatórios' });
  }
  if (!Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
    return res.status(400).json({ error: 'Placar deve ser número inteiro não-negativo' });
  }

  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada' });

  const newStatus = status || 'finished';
  db.prepare(
    'UPDATE matches SET home_score = ?, away_score = ?, status = ? WHERE id = ?'
  ).run(home_score, away_score, newStatus, req.params.id);

  res.json({ id: Number(req.params.id), home_score, away_score, status: newStatus });
});

// Admin: atualizar status da partida (scheduled → live → finished)
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['scheduled', 'live', 'finished'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const db = getDb();
  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada' });

  db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: Number(req.params.id), status });
});

// Admin: criar partida extra (mata-mata)
router.post('/', requireAdmin, (req, res) => {
  const { phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at } = req.body;
  if (!phase || !home_team || !away_team || !scheduled_at) {
    return res.status(400).json({ error: 'Campos obrigatórios: phase, home_team, away_team, scheduled_at' });
  }

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO matches (phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
  ).run(phase, match_group || null, match_round || null, home_team, home_flag || '', away_team, away_flag || '', scheduled_at);

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(match);
});

module.exports = router;
