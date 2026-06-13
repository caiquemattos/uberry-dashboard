require('dotenv').config();
const { Pool } = require('pg');

let pool;

function getDb() {
  return pool;
}

// 12 grupos × 4 times = 48 seleções da Copa 2026
const COPA_GROUPS = [
  {
    name: 'A', md1: '2026-06-11', md2: '2026-06-17', md3: '2026-06-23',
    teams: [
      { name: 'EUA',     flag: '🇺🇸' }, { name: 'Panamá',   flag: '🇵🇦' },
      { name: 'Albânia', flag: '🇦🇱' }, { name: 'Ucrânia',  flag: '🇺🇦' },
    ],
  },
  {
    name: 'B', md1: '2026-06-11', md2: '2026-06-17', md3: '2026-06-23',
    teams: [
      { name: 'Argentina', flag: '🇦🇷' }, { name: 'Chile',      flag: '🇨🇱' },
      { name: 'Marrocos',  flag: '🇲🇦' }, { name: 'Eslovênia',  flag: '🇸🇮' },
    ],
  },
  {
    name: 'C', md1: '2026-06-12', md2: '2026-06-18', md3: '2026-06-24',
    teams: [
      { name: 'México',   flag: '🇲🇽' }, { name: 'Jamaica',  flag: '🇯🇲' },
      { name: 'Venezuela', flag: '🇻🇪' }, { name: 'Iraque',   flag: '🇮🇶' },
    ],
  },
  {
    name: 'D', md1: '2026-06-12', md2: '2026-06-18', md3: '2026-06-24',
    teams: [
      { name: 'Canadá',   flag: '🇨🇦' }, { name: 'Equador',     flag: '🇪🇨' },
      { name: 'Suíça',    flag: '🇨🇭' }, { name: 'Camarões',    flag: '🇨🇲' },
    ],
  },
  {
    name: 'E', md1: '2026-06-12', md2: '2026-06-18', md3: '2026-06-24',
    teams: [
      { name: 'Espanha',   flag: '🇪🇸' }, { name: 'Turquia',   flag: '🇹🇷' },
      { name: 'Brasil',    flag: '🇧🇷' }, { name: 'Japão',     flag: '🇯🇵' },
    ],
  },
  {
    name: 'F', md1: '2026-06-13', md2: '2026-06-19', md3: '2026-06-25',
    teams: [
      { name: 'França',   flag: '🇫🇷' }, { name: 'Polônia',  flag: '🇵🇱' },
      { name: 'Uruguai',  flag: '🇺🇾' }, { name: 'Tanzânia', flag: '🇹🇿' },
    ],
  },
  {
    name: 'G', md1: '2026-06-13', md2: '2026-06-19', md3: '2026-06-25',
    teams: [
      { name: 'Portugal',  flag: '🇵🇹' }, { name: 'Croácia',  flag: '🇭🇷' },
      { name: 'Hungria',   flag: '🇭🇺' }, { name: 'Arábia S.', flag: '🇸🇦' },
    ],
  },
  {
    name: 'H', md1: '2026-06-13', md2: '2026-06-19', md3: '2026-06-25',
    teams: [
      { name: 'Alemanha',    flag: '🇩🇪' }, { name: 'Escócia',   flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
      { name: 'Quirguistão', flag: '🇰🇬' }, { name: 'Colômbia',  flag: '🇨🇴' },
    ],
  },
  {
    name: 'I', md1: '2026-06-14', md2: '2026-06-20', md3: '2026-06-26',
    teams: [
      { name: 'Holanda', flag: '🇳🇱' }, { name: 'Senegal',  flag: '🇸🇳' },
      { name: 'Peru',    flag: '🇵🇪' }, { name: 'Coreia S.', flag: '🇰🇷' },
    ],
  },
  {
    name: 'J', md1: '2026-06-14', md2: '2026-06-20', md3: '2026-06-26',
    teams: [
      { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { name: 'Sérvia',    flag: '🇷🇸' },
      { name: 'Panamá',     flag: '🇵🇦' },   { name: 'Tailândia', flag: '🇹🇭' },
    ],
  },
  {
    name: 'K', md1: '2026-06-15', md2: '2026-06-21', md3: '2026-06-27',
    teams: [
      { name: 'Austrália',  flag: '🇦🇺' }, { name: 'Indonésia', flag: '🇮🇩' },
      { name: 'Costa Rica', flag: '🇨🇷' }, { name: 'Gana',      flag: '🇬🇭' },
    ],
  },
  {
    name: 'L', md1: '2026-06-15', md2: '2026-06-21', md3: '2026-06-27',
    teams: [
      { name: 'Bélgica',    flag: '🇧🇪' }, { name: 'Itália',    flag: '🇮🇹' },
      { name: 'Congo',      flag: '🇨🇩' }, { name: 'Romênia',   flag: '🇷🇴' },
    ],
  },
];

const ROUND_PAIRS = [
  { round: 1, t1: 0, t2: 1, time: '17:00' },
  { round: 1, t1: 2, t2: 3, time: '20:00' },
  { round: 2, t1: 0, t2: 2, time: '17:00' },
  { round: 2, t1: 1, t2: 3, time: '20:00' },
  { round: 3, t1: 0, t2: 3, time: '20:00' },
  { round: 3, t1: 1, t2: 2, time: '20:00' },
];

async function seedMatches(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS cnt FROM matches');
  if (rows[0].cnt > 0) return;

  await client.query('BEGIN');
  try {
    const sql = `
      INSERT INTO matches (phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at, status)
      VALUES ('groups', $1, $2, $3, $4, $5, $6, $7, 'scheduled')
    `;
    for (const group of COPA_GROUPS) {
      for (const pair of ROUND_PAIRS) {
        const date = pair.round === 1 ? group.md1 : pair.round === 2 ? group.md2 : group.md3;
        const scheduledAt = `${date}T${pair.time}:00.000Z`;
        await client.query(sql, [
          group.name, pair.round,
          group.teams[pair.t1].name, group.teams[pair.t1].flag,
          group.teams[pair.t2].name, group.teams[pair.t2].flag,
          scheduledAt,
        ]);
      }
    }
    await client.query('COMMIT');
    console.log(`✅ ${COPA_GROUPS.length * ROUND_PAIRS.length} partidas da fase de grupos inseridas`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pools (
        id         SERIAL PRIMARY KEY,
        code       TEXT    NOT NULL UNIQUE,
        name       TEXT    NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        status     TEXT    NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pool_members (
        id        SERIAL PRIMARY KEY,
        pool_id   INTEGER NOT NULL REFERENCES pools(id),
        user_id   INTEGER NOT NULL REFERENCES users(id),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pool_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS matches (
        id           SERIAL PRIMARY KEY,
        phase        TEXT    NOT NULL DEFAULT 'groups',
        match_group  TEXT,
        match_round  INTEGER,
        home_team    TEXT    NOT NULL,
        home_flag    TEXT    DEFAULT '',
        away_team    TEXT    NOT NULL,
        away_flag    TEXT    DEFAULT '',
        scheduled_at TIMESTAMP NOT NULL,
        home_score   INTEGER,
        away_score   INTEGER,
        status       TEXT    NOT NULL DEFAULT 'scheduled',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS predictions (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        match_id   INTEGER NOT NULL REFERENCES matches(id),
        pool_id    INTEGER NOT NULL REFERENCES pools(id),
        home_score INTEGER NOT NULL,
        away_score INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, match_id, pool_id)
      );

      CREATE INDEX IF NOT EXISTS idx_predictions_pool ON predictions(pool_id);
      CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
      CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_pool_members     ON pool_members(pool_id, user_id);
    `);

    await seedMatches(client);
    console.log('🗄️  Banco de dados inicializado');
  } finally {
    client.release();
  }
}

module.exports = { initDatabase, getDb, COPA_GROUPS };
