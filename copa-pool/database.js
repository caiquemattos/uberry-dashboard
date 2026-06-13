const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  return db;
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
      { name: 'México',       flag: '🇲🇽' }, { name: 'Equador',     flag: '🇪🇨' },
      { name: 'Jamaica',      flag: '🇯🇲' }, { name: 'Uzbequistão', flag: '🇺🇿' },
    ],
  },
  {
    name: 'C', md1: '2026-06-12', md2: '2026-06-18', md3: '2026-06-24',
    teams: [
      { name: 'Canadá',   flag: '🇨🇦' }, { name: 'Honduras', flag: '🇭🇳' },
      { name: 'Marrocos', flag: '🇲🇦' }, { name: 'Croácia',  flag: '🇭🇷' },
    ],
  },
  {
    name: 'D', md1: '2026-06-12', md2: '2026-06-18', md3: '2026-06-24',
    teams: [
      { name: 'Brasil',   flag: '🇧🇷' }, { name: 'Japão',    flag: '🇯🇵' },
      { name: 'Congo DR', flag: '🇨🇩' }, { name: 'Egito',    flag: '🇪🇬' },
    ],
  },
  {
    name: 'E', md1: '2026-06-13', md2: '2026-06-19', md3: '2026-06-25',
    teams: [
      { name: 'Argentina', flag: '🇦🇷' }, { name: 'Chile',  flag: '🇨🇱' },
      { name: 'Peru',      flag: '🇵🇪' }, { name: 'Polônia', flag: '🇵🇱' },
    ],
  },
  {
    name: 'F', md1: '2026-06-13', md2: '2026-06-19', md3: '2026-06-25',
    teams: [
      { name: 'França',      flag: '🇫🇷' }, { name: 'Bélgica',    flag: '🇧🇪' },
      { name: 'Tunísia',     flag: '🇹🇳' }, { name: 'Azerbaijão', flag: '🇦🇿' },
    ],
  },
  {
    name: 'G', md1: '2026-06-14', md2: '2026-06-20', md3: '2026-06-26',
    teams: [
      { name: 'Espanha',     flag: '🇪🇸' }, { name: 'Portugal',   flag: '🇵🇹' },
      { name: 'Costa Rica',  flag: '🇨🇷' }, { name: 'Geórgia',    flag: '🇬🇪' },
    ],
  },
  {
    name: 'H', md1: '2026-06-14', md2: '2026-06-20', md3: '2026-06-26',
    teams: [
      { name: 'Alemanha',       flag: '🇩🇪' }, { name: 'Países Baixos', flag: '🇳🇱' },
      { name: 'Turquia',        flag: '🇹🇷' }, { name: 'Sérvia',        flag: '🇷🇸' },
    ],
  },
  {
    name: 'I', md1: '2026-06-15', md2: '2026-06-21', md3: '2026-06-27',
    teams: [
      { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { name: 'Colômbia', flag: '🇨🇴' },
      { name: 'Suíça',      flag: '🇨🇭' },   { name: 'Argélia',  flag: '🇩🇿' },
    ],
  },
  {
    name: 'J', md1: '2026-06-15', md2: '2026-06-21', md3: '2026-06-27',
    teams: [
      { name: 'Coreia do Sul',  flag: '🇰🇷' }, { name: 'Uruguai',        flag: '🇺🇾' },
      { name: 'Arábia Saudita', flag: '🇸🇦' }, { name: 'Nova Zelândia',  flag: '🇳🇿' },
    ],
  },
  {
    name: 'K', md1: '2026-06-16', md2: '2026-06-22', md3: '2026-06-28',
    teams: [
      { name: 'Irã',        flag: '🇮🇷' }, { name: 'Nigéria',    flag: '🇳🇬' },
      { name: 'Venezuela',  flag: '🇻🇪' }, { name: 'Eslováquia', flag: '🇸🇰' },
    ],
  },
  {
    name: 'L', md1: '2026-06-16', md2: '2026-06-22', md3: '2026-06-28',
    teams: [
      { name: 'Itália',    flag: '🇮🇹' }, { name: 'Senegal',   flag: '🇸🇳' },
      { name: 'Austrália', flag: '🇦🇺' }, { name: 'Guatemala', flag: '🇬🇹' },
    ],
  },
];

// Pares de confronto por rodada
const ROUND_PAIRS = [
  { round: 1, t1: 0, t2: 1, time: '17:00' },
  { round: 1, t1: 2, t2: 3, time: '20:00' },
  { round: 2, t1: 0, t2: 2, time: '17:00' },
  { round: 2, t1: 1, t2: 3, time: '20:00' },
  { round: 3, t1: 0, t2: 3, time: '20:00' }, // MD3 simultâneo
  { round: 3, t1: 1, t2: 2, time: '20:00' }, // MD3 simultâneo
];

function seedMatches(db) {
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM matches').get();
  if (existing.cnt > 0) return; // Já populado

  const insert = db.prepare(`
    INSERT INTO matches (phase, match_group, match_round, home_team, home_flag, away_team, away_flag, scheduled_at, status)
    VALUES ('groups', ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `);

  const insertMany = db.transaction(() => {
    for (const group of COPA_GROUPS) {
      for (const pair of ROUND_PAIRS) {
        const date = pair.round === 1 ? group.md1 : pair.round === 2 ? group.md2 : group.md3;
        const scheduledAt = `${date}T${pair.time}:00.000Z`;
        insert.run(
          group.name,
          pair.round,
          group.teams[pair.t1].name,
          group.teams[pair.t1].flag,
          group.teams[pair.t2].name,
          group.teams[pair.t2].flag,
          scheduledAt
        );
      }
    }
  });

  insertMany();
  console.log(`✅ ${COPA_GROUPS.length * ROUND_PAIRS.length} partidas da fase de grupos inseridas`);
}

function initDatabase() {
  const dbPath = path.join(__dirname, 'copa.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT   NOT NULL,
      is_admin     INTEGER NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pools (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      created_by  INTEGER NOT NULL REFERENCES users(id),
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pool_members (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id   INTEGER NOT NULL REFERENCES pools(id),
      user_id   INTEGER NOT NULL REFERENCES users(id),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pool_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      phase        TEXT    NOT NULL DEFAULT 'groups',
      match_group  TEXT,
      match_round  INTEGER,
      home_team    TEXT    NOT NULL,
      home_flag    TEXT    DEFAULT '',
      away_team    TEXT    NOT NULL,
      away_flag    TEXT    DEFAULT '',
      scheduled_at DATETIME NOT NULL,
      home_score   INTEGER,
      away_score   INTEGER,
      status       TEXT    NOT NULL DEFAULT 'scheduled',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      match_id   INTEGER NOT NULL REFERENCES matches(id),
      pool_id    INTEGER NOT NULL REFERENCES pools(id),
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id, pool_id)
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_pool ON predictions(pool_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_pool_members     ON pool_members(pool_id, user_id);
  `);

  seedMatches(db);
  console.log('🗄️  Banco de dados inicializado');
}

module.exports = { initDatabase, getDb, COPA_GROUPS };
