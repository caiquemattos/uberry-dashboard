const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, admin_code } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
    if (username.trim().length < 2) return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres' });
    if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });

    const db = getDb();
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'Nome já em uso' });

    const is_admin = admin_code && admin_code === process.env.ADMIN_CODE ? 1 : 0;
    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id',
      [username.trim(), password_hash, is_admin]
    );
    const id = rows[0].id;

    const token = jwt.sign(
      { id, username: username.trim(), is_admin: Boolean(is_admin) },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id, username: username.trim(), is_admin: Boolean(is_admin) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });

    const db = getDb();
    const { rows } = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Usuário ou senha incorretos' });

    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: Boolean(user.is_admin) },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, is_admin: Boolean(user.is_admin) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.query(
      'SELECT id, username, is_admin, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ...user, is_admin: Boolean(user.is_admin) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
