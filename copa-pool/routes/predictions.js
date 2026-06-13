const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { isPredictionLocked } = require('../utils/scoring');

const router = express.Router();

// Palpites do usuário em um bolão (todos os jogos)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { pool_id } = req.query;
    if (!pool_id) return res.status(400).json({ error: 'pool_id é obrigatório' });

    const db = getDb();
    const { rows: memberRows } = await db.query(
      'SELECT id FROM pool_members WHERE pool_id = $1 AND user_id = $2',
      [pool_id, req.user.id]
    );
    if (memberRows.length === 0) return res.status(403).json({ error: 'Você não é membro deste bolão' });

    const { rows } = await db.query(`
      SELECT p.*, m.scheduled_at, m.status AS match_status,
             m.home_team, m.away_team, m.home_score AS real_home, m.away_score AS real_away,
             m.phase, m.match_group
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = $1 AND p.pool_id = $2
      ORDER BY m.scheduled_at ASC
    `, [req.user.id, pool_id]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Criar ou atualizar palpite
router.post('/', requireAuth, async (req, res) => {
  try {
    const { pool_id, match_id, home_score, away_score } = req.body;

    if (!pool_id || !match_id || home_score === undefined || away_score === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios: pool_id, match_id, home_score, away_score' });
    }
    if (!Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
      return res.status(400).json({ error: 'Placar deve ser número inteiro não-negativo' });
    }

    const db = getDb();

    const { rows: memberRows } = await db.query(
      'SELECT id FROM pool_members WHERE pool_id = $1 AND user_id = $2',
      [pool_id, req.user.id]
    );
    if (memberRows.length === 0) return res.status(403).json({ error: 'Você não é membro deste bolão' });

    const { rows: matchRows } = await db.query('SELECT * FROM matches WHERE id = $1', [match_id]);
    const match = matchRows[0];
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
    if (isPredictionLocked(match.scheduled_at) || match.status !== 'scheduled') {
      return res.status(400).json({ error: 'Prazo para palpite encerrado (10 min antes do jogo)' });
    }

    const { rows: existingRows } = await db.query(
      'SELECT id FROM predictions WHERE user_id = $1 AND match_id = $2 AND pool_id = $3',
      [req.user.id, match_id, pool_id]
    );

    if (existingRows.length > 0) {
      const existingId = existingRows[0].id;
      await db.query(
        'UPDATE predictions SET home_score = $1, away_score = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [home_score, away_score, existingId]
      );
      return res.json({ id: existingId, user_id: req.user.id, match_id, pool_id, home_score, away_score });
    }

    const { rows } = await db.query(
      'INSERT INTO predictions (user_id, match_id, pool_id, home_score, away_score) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.user.id, match_id, pool_id, home_score, away_score]
    );

    res.status(201).json({ id: rows[0].id, user_id: req.user.id, match_id, pool_id, home_score, away_score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
