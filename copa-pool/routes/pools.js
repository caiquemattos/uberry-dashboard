const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function genCode() {
  return Math.random().toString(36).toUpperCase().slice(2, 8);
}

// Listar bolões do usuário
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT p.*, u.username AS creator_name,
        (SELECT COUNT(*) FROM pool_members pm WHERE pm.pool_id = p.id)::int AS member_count
      FROM pools p
      JOIN pool_members pm2 ON pm2.pool_id = p.id AND pm2.user_id = $1
      JOIN users u ON u.id = p.created_by
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Detalhes de um bolão
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: poolRows } = await db.query(`
      SELECT p.*, u.username AS creator_name
      FROM pools p JOIN users u ON u.id = p.created_by
      WHERE p.id = $1
    `, [req.params.id]);
    const pool = poolRows[0];
    if (!pool) return res.status(404).json({ error: 'Bolão não encontrado' });

    const { rows: memberRows } = await db.query(
      'SELECT id FROM pool_members WHERE pool_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (memberRows.length === 0) return res.status(403).json({ error: 'Você não é membro deste bolão' });

    const { rows: members } = await db.query(`
      SELECT u.id, u.username, pm.joined_at
      FROM pool_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.pool_id = $1
      ORDER BY pm.joined_at ASC
    `, [req.params.id]);

    res.json({ ...pool, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Criar bolão
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Nome do bolão é obrigatório (mín. 2 caracteres)' });

    const db = getDb();
    let code;
    // garantir código único
    do {
      code = genCode();
      const { rows } = await db.query('SELECT id FROM pools WHERE code = $1', [code]);
      if (rows.length === 0) break;
    } while (true);

    const { rows: poolRows } = await db.query(
      'INSERT INTO pools (code, name, created_by) VALUES ($1, $2, $3) RETURNING id',
      [code, name.trim(), req.user.id]
    );
    const poolId = poolRows[0].id;

    await db.query('INSERT INTO pool_members (pool_id, user_id) VALUES ($1, $2)', [poolId, req.user.id]);

    const { rows } = await db.query('SELECT * FROM pools WHERE id = $1', [poolId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Entrar em bolão pelo código
router.post('/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código do bolão é obrigatório' });

    const db = getDb();
    const { rows: poolRows } = await db.query(
      'SELECT * FROM pools WHERE UPPER(code) = UPPER($1)',
      [code.trim()]
    );
    const pool = poolRows[0];
    if (!pool) return res.status(404).json({ error: 'Bolão não encontrado com este código' });
    if (pool.status !== 'active') return res.status(400).json({ error: 'Este bolão não está mais ativo' });

    const { rows: existing } = await db.query(
      'SELECT id FROM pool_members WHERE pool_id = $1 AND user_id = $2',
      [pool.id, req.user.id]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Você já é membro deste bolão' });

    await db.query('INSERT INTO pool_members (pool_id, user_id) VALUES ($1, $2)', [pool.id, req.user.id]);

    const { rows: members } = await db.query(`
      SELECT u.id, u.username, pm.joined_at
      FROM pool_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.pool_id = $1
      ORDER BY pm.joined_at ASC
    `, [pool.id]);

    res.json({ ...pool, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
