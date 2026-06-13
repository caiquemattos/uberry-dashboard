const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password, admin_code } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
  if (username.trim().length < 2) return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres' });
  if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Nome já em uso' });

  const is_admin = admin_code && admin_code === process.env.ADMIN_CODE ? 1 : 0;
  const password_hash = await bcrypt.hash(password, 10);

  const result = db.prepare(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
  ).run(username.trim(), password_hash, is_admin);

  const token = jwt.sign(
    { id: result.lastInsertRowid, username: username.trim(), is_admin: Boolean(is_admin) },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, user: { id: result.lastInsertRowid, username: username.trim(), is_admin: Boolean(is_admin) } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

  const token = jwt.sign(
    { id: user.id, username: user.username, is_admin: Boolean(user.is_admin) },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: user.id, username: user.username, is_admin: Boolean(user.is_admin) } });
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, is_admin, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ ...user, is_admin: Boolean(user.is_admin) });
});

module.exports = router;
