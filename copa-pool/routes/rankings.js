const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { calculatePoints } = require('../utils/scoring');

const router = express.Router();

// Ranking completo de um bolão
router.get('/:poolId', requireAuth, (req, res) => {
  const { poolId } = req.params;
  const db = getDb();

  const member = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(poolId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Você não é membro deste bolão' });

  const members = db.prepare(`
    SELECT u.id, u.username, pm.joined_at
    FROM pool_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.pool_id = ?
  `).all(poolId);

  const finishedMatches = db.prepare(`
    SELECT * FROM matches WHERE status = 'finished'
  `).all();

  const finalMatch = db.prepare(`
    SELECT * FROM matches WHERE phase = 'final' AND status = 'finished' LIMIT 1
  `).get();

  const ranking = members.map(user => {
    const preds = db.prepare(`
      SELECT p.*, m.phase, m.home_score AS real_home, m.away_score AS real_away
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ? AND p.pool_id = ? AND m.status = 'finished'
    `).all(user.id, poolId);

    let total_points = 0, exact_scores = 0, correct_results = 0;

    for (const pred of preds) {
      const { points, type } = calculatePoints(
        pred.home_score, pred.away_score,
        pred.real_home, pred.real_away,
        pred.phase
      );
      total_points += points;
      if (type === 'exact') exact_scores++;
      if (type === 'exact' || type === 'partial') correct_results++;
    }

    // Pontuação na final (para desempate)
    let final_points = 0;
    if (finalMatch) {
      const finalPred = db.prepare(`
        SELECT * FROM predictions WHERE user_id = ? AND match_id = ? AND pool_id = ?
      `).get(user.id, finalMatch.id, poolId);
      if (finalPred) {
        final_points = calculatePoints(
          finalPred.home_score, finalPred.away_score,
          finalMatch.home_score, finalMatch.away_score,
          'final'
        ).points;
      }
    }

    const total_predictions = db.prepare(`
      SELECT COUNT(*) AS cnt FROM predictions WHERE user_id = ? AND pool_id = ?
    `).get(user.id, poolId).cnt;

    const accuracy = total_predictions > 0
      ? Math.round((correct_results / Math.min(total_predictions, finishedMatches.length)) * 100)
      : 0;

    return {
      user_id: user.id,
      username: user.username,
      joined_at: user.joined_at,
      total_points,
      exact_scores,
      correct_results,
      total_predictions,
      accuracy,
      final_points,
    };
  });

  // Ordenar: pontos → exatos → acertos → pontos_final → data_entrada
  ranking.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.exact_scores !== a.exact_scores) return b.exact_scores - a.exact_scores;
    if (b.correct_results !== a.correct_results) return b.correct_results - a.correct_results;
    if (b.final_points !== a.final_points) return b.final_points - a.final_points;
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  // Atribuir posições (empatados ficam na mesma posição)
  let pos = 1;
  for (let i = 0; i < ranking.length; i++) {
    if (i > 0) {
      const prev = ranking[i - 1];
      const curr = ranking[i];
      const tied = prev.total_points === curr.total_points &&
        prev.exact_scores === curr.exact_scores &&
        prev.correct_results === curr.correct_results &&
        prev.final_points === curr.final_points;
      if (!tied) pos = i + 1;
    }
    ranking[i].position = pos;
  }

  res.json(ranking);
});

// Estatísticas detalhadas do usuário em um bolão
router.get('/:poolId/stats/:userId', requireAuth, (req, res) => {
  const { poolId, userId } = req.params;
  const db = getDb();

  const member = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(poolId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Você não é membro deste bolão' });

  const preds = db.prepare(`
    SELECT p.home_score AS pred_home, p.away_score AS pred_away,
           m.home_score AS real_home, m.away_score AS real_away,
           m.phase, m.match_group, m.match_round, m.home_team, m.away_team,
           m.home_flag, m.away_flag, m.scheduled_at, m.status,
           m.id AS match_id
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND p.pool_id = ?
    ORDER BY m.scheduled_at ASC
  `).all(userId, poolId);

  const detailed = preds.map(p => {
    let points = 0, type = 'pending';
    if (p.status === 'finished' && p.real_home !== null) {
      const result = calculatePoints(p.pred_home, p.pred_away, p.real_home, p.real_away, p.phase);
      points = result.points;
      type = result.type;
    }
    return { ...p, points, type };
  });

  const finished = detailed.filter(p => p.status === 'finished');
  const total_points = finished.reduce((s, p) => s + p.points, 0);
  const exact_scores = finished.filter(p => p.type === 'exact').length;
  const correct_results = finished.filter(p => p.type === 'exact' || p.type === 'partial').length;
  const accuracy = finished.length > 0 ? Math.round((correct_results / finished.length) * 100) : 0;

  // Pontos por rodada (agrupado por match_round dentro de groups, ou por phase)
  const by_round = {};
  for (const p of finished) {
    const key = p.phase === 'groups' ? `Rodada ${p.match_round}` : p.phase;
    if (!by_round[key]) by_round[key] = { points: 0, correct: 0, total: 0 };
    by_round[key].points += p.points;
    by_round[key].total++;
    if (p.type === 'exact' || p.type === 'partial') by_round[key].correct++;
  }

  res.json({
    user_id: Number(userId),
    total_points,
    exact_scores,
    correct_results,
    total_predictions: preds.length,
    finished_predictions: finished.length,
    accuracy,
    by_round,
    predictions: detailed,
  });
});

module.exports = router;
