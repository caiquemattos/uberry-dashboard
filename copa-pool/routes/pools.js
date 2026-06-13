const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function genCode() {
  return Math.random().toString(36).toUpperCase().slice(2, 8);
}

// Listar bolões do usuário
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const pools = db.prepare(`
    SELECT p.*, u.username AS creator_name,
      (SELECT COUNT(*) FROM pool_members pm WHERE pm.pool_id = p.id) AS member_count
    FROM pools p
    JOIN pool_members pm2 ON pm2.pool_id = p.id AND pm2.user_id = ?
    JOIN users u ON u.id = p.created_by
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(pools);
});

// Detalhes de um bolão
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const pool = db.prepare(`
    SELECT p.*, u.username AS creator_name
    FROM pools p JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Bolão não encontrado' });

  const member = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Você não é membro deste bolão' });

  const members = db.prepare(`
    SELECT u.id, u.username, pm.joined_at
    FROM pool_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.pool_id = ?
    ORDER BY pm.joined_at ASC
  `).all(req.params.id);

  res.json({ ...pool, members });
});

// Criar bolão
router.post('/', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Nome do bolão é obrigatório (mín. 2 caracteres)' });

  const db = getDb();
  let code;
  // garantir código único
  do { code = genCode(); } while (db.prepare('SELECT id FROM pools WHERE code = ?').get(code));

  const result = db.prepare(
    'INSERT INTO pools (code, name, created_by) VALUES (?, ?, ?)'
  ).run(code, name.trim(), req.user.id);

  db.prepare('INSERT INTO pool_members (pool_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, req.user.id);

  const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(pool);
});

// Entrar em bolão pelo código
router.post('/join', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Código do bolão é obrigatório' });

  const db = getDb();
  const pool = db.prepare('SELECT * FROM pools WHERE UPPER(code) = UPPER(?)').get(code.trim());
  if (!pool) return res.status(404).json({ error: 'Bolão não encontrado com este código' });
  if (pool.status !== 'active') return res.status(400).json({ error: 'Este bolão não está mais ativo' });

  const already = db.prepare('SELECT id FROM pool_members WHERE pool_id = ? AND user_id = ?')
    .get(pool.id, req.user.id);
  if (already) return res.status(409).json({ error: 'Você já é membro deste bolão' });

  db.prepare('INSERT INTO pool_members (pool_id, user_id) VALUES (?, ?)').run(pool.id, req.user.id);

  const members = db.prepare(`
    SELECT u.id, u.username, pm.joined_at
    FROM pool_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.pool_id = ?
    ORDER BY pm.joined_at ASC
  `).all(pool.id);

  res.json({ ...pool, members });
});

module.exports = router;
