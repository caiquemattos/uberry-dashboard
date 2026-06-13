const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { phase, group, status } = req.query;

    let sql = 'SELECT * FROM matches WHERE 1=1';
    const params = [];

    if (phase)  { params.push(phase);  sql += ` AND phase = $${params.length}`; }
    if (group)  { params.push(group);  sql += ` AND match_group = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }

    sql += ' ORDER BY scheduled_at ASC';

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    const match = rows[0];
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
    res.json(match);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Admin: atualizar resultado de uma partida
router.patch('/:id/result', requireAdmin, async (req, res) => {
  try {
    const { home_score, away_score, status } = req.body;
    if (home_score === undefined || away_score === undefined) {
      return res.status(400).json({ error: 'Placar do mandante e visitante são obrigatórios' });
    }
    if (!Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
      return res.status(400).json({ error: 'Placar deve ser número inteiro não-negativo' });
    }

    const db = getDb();
    const { rows } = await db.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Partida não encontrada' });

    const newStatus = status || 'finished';
    await db.query(
      'UPDATE matches SET home_score = $1, away_score = $2, status = $3 WHERE id = $4',
      [home_score, away_score, newStatus, req.params.id]
    );

    res.json({ id: Number(req.params.id), home_score, away_score, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Admin: atualizar status da partida (scheduled → live → finished)
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['scheduled', 'live', 'finished'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    const db = getDb();
    const { rows } = await db.query('SELECT id FROM matches WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Partida não encontrada' });

    await db.query('UPDATE matches SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ id: Number(req.params.id), status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Admin: criar partida extra (mata-mata)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at } = req.body;
    if (!phase || !home_team || !away_team || !scheduled_at) {
      return res.status(400).json({ error: 'Campos obrigatórios: phase, home_team, away_team, scheduled_at' });
    }

    const db = getDb();
    const { rows: inserted } = await db.query(
      `INSERT INTO matches (phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled') RETURNING id`,
      [phase, match_group || null, match_round || null, home_team, home_flag || '', away_team, away_flag || '', scheduled_at]
    );

    const { rows } = await db.query('SELECT * FROM matches WHERE id = $1', [inserted[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
