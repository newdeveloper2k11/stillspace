const path = require("path");
const Database = require("better-sqlite3");
const { encrypt, decrypt, ensureKey, hashIdentifier } = require("./crypto-utils");
const { isAdmin } = require("./auth");

const DB_PATH = path.join(__dirname, "stillspace.db");

let db = null;

function createUsersTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id_hash      TEXT    UNIQUE NOT NULL,
      google_id_encrypted TEXT    NOT NULL,
      email_encrypted     TEXT    NOT NULL,
      name_encrypted      TEXT    NOT NULL,
      picture_encrypted   TEXT,
      role                TEXT    NOT NULL DEFAULT 'user',
      created_at          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      last_login_at       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

function ensureSessionsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      duration     INTEGER NOT NULL,
      completed    TEXT    NOT NULL,
      finished_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const columns = getColumnNames(database, "sessions");
  if (!columns.includes("user_id")) {
    database.exec("ALTER TABLE sessions ADD COLUMN user_id INTEGER");
  }
}

function getColumnNames(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function migrateLegacyUsers(database) {
  const existing = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();

  if (!existing) {
    createUsersTable(database);
    return;
  }

  const columns = getColumnNames(database, "users");

  if (columns.includes("google_id_hash") && columns.includes("email_encrypted")) {
    return;
  }

  database.pragma("foreign_keys = OFF");
  database.exec("ALTER TABLE users RENAME TO users_legacy");
  createUsersTable(database);

  const legacyRows = database
    .prepare("SELECT id, google_id, email, name, picture, role, created_at FROM users_legacy ORDER BY id ASC")
    .all();

  const insert = database.prepare(`
    INSERT INTO users (
      id,
      google_id_hash,
      google_id_encrypted,
      email_encrypted,
      name_encrypted,
      picture_encrypted,
      role,
      created_at,
      last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  legacyRows.forEach((row) => {
    insert.run(
      row.id,
      hashIdentifier(row.google_id),
      encrypt(row.google_id),
      encrypt(row.email),
      encrypt(row.name),
      row.picture ? encrypt(row.picture) : null,
      row.role || "user",
      row.created_at || new Date().toISOString(),
      row.created_at || new Date().toISOString()
    );
  });

  database.exec("DROP TABLE users_legacy");
  database.pragma("foreign_keys = ON");
}

function decryptUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: decrypt(row.email_encrypted),
    name: decrypt(row.name_encrypted),
    picture: row.picture_encrypted ? decrypt(row.picture_encrypted) : "",
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapSessionRow(row, user) {
  let completedSeconds = 0;

  try {
    completedSeconds = Number(decrypt(row.completed));
  } catch {
    completedSeconds = 0;
  }

  return {
    id: row.id,
    userId: row.user_id,
    duration: row.duration,
    completed: completedSeconds,
    finishedAt: row.finished_at,
    user,
  };
}

function getDatabase() {
  if (db) {
    return db;
  }

  ensureKey();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrateLegacyUsers(db);
  createUsersTable(db);
  ensureSessionsTable(db);

  return db;
}

function findOrCreateUser({ googleId, email, name, picture }) {
  const database = getDatabase();
  const googleIdHash = hashIdentifier(googleId);
  const now = new Date().toISOString();

  const existing = database
    .prepare(`
      SELECT *
      FROM users
      WHERE google_id_hash = ?
    `)
    .get(googleIdHash);

  if (existing) {
    database.prepare(`
      UPDATE users
      SET email_encrypted = ?, name_encrypted = ?, picture_encrypted = ?, last_login_at = ?, role = ?
      WHERE id = ?
    `).run(
      encrypt(email),
      encrypt(name),
      picture ? encrypt(picture) : null,
      now,
      isAdmin(email) ? "admin" : existing.role,
      existing.id
    );

    return getUserById(existing.id);
  }

  const role = isAdmin(email) ? "admin" : "user";
  const result = database.prepare(`
    INSERT INTO users (
      google_id_hash,
      google_id_encrypted,
      email_encrypted,
      name_encrypted,
      picture_encrypted,
      role,
      created_at,
      last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    googleIdHash,
    encrypt(googleId),
    encrypt(email),
    encrypt(name),
    picture ? encrypt(picture) : null,
    role,
    now,
    now
  );

  return getUserById(result.lastInsertRowid);
}

function getUserById(id) {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return decryptUserRow(row);
}

function getAllUsers(limit = 50) {
  const database = getDatabase();
  return database
    .prepare("SELECT * FROM users ORDER BY last_login_at DESC LIMIT ?")
    .all(limit)
    .map(decryptUserRow);
}

function insertSession(duration, completedSeconds, userId) {
  const database = getDatabase();
  const encryptedCompleted = encrypt(String(completedSeconds));

  const result = database.prepare(
    "INSERT INTO sessions (duration, completed, user_id) VALUES (?, ?, ?)"
  ).run(duration, encryptedCompleted, userId);

  return { id: result.lastInsertRowid };
}

function getAllSessions(userId, limit = 50) {
  const database = getDatabase();
  const rows = userId
    ? database
      .prepare(`
        SELECT id, user_id, duration, completed, finished_at
        FROM sessions
        WHERE user_id = ?
        ORDER BY finished_at DESC
        LIMIT ?
      `)
      .all(userId, limit)
    : database
      .prepare(`
        SELECT id, user_id, duration, completed, finished_at
        FROM sessions
        ORDER BY finished_at DESC
        LIMIT ?
      `)
      .all(limit);

  return rows.map((row) => mapSessionRow(row, row.user_id ? getUserById(row.user_id) : null));
}

function getStats(userId) {
  const database = getDatabase();
  const rows = userId
    ? database
      .prepare("SELECT duration, completed, finished_at FROM sessions WHERE user_id = ? ORDER BY finished_at DESC")
      .all(userId)
    : database
      .prepare("SELECT duration, completed, finished_at FROM sessions ORDER BY finished_at DESC")
      .all();

  let totalSessions = rows.length;
  let totalMinutes = 0;

  rows.forEach((row) => {
    try {
      totalMinutes += Number(decrypt(row.completed)) / 60;
    } catch {
      totalMinutes += 0;
    }
  });

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sessionDates = new Set(
    rows.map((row) => {
      const date = new Date(row.finished_at);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })
  );

  const dayMs = 86400000;
  let checkDate = today.getTime();

  while (sessionDates.has(checkDate)) {
    streak += 1;
    checkDate -= dayMs;
  }

  return {
    totalSessions,
    totalMinutes: Math.round(totalMinutes),
    streak,
  };
}

function getAdminOverview() {
  const database = getDatabase();
  const totalUsers = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const totalAdmins = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
  const totalSessions = database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count;
  const todaySessions = database
    .prepare("SELECT COUNT(*) AS count FROM sessions WHERE date(finished_at) = date('now', 'localtime')")
    .get()
    .count;

  let totalMinutes = 0;
  database.prepare("SELECT completed FROM sessions").all().forEach((row) => {
    try {
      totalMinutes += Number(decrypt(row.completed)) / 60;
    } catch {
      totalMinutes += 0;
    }
  });

  return {
    totalUsers,
    totalAdmins,
    totalSessions,
    totalMinutes: Math.round(totalMinutes),
    todaySessions,
    recentUsers: getAllUsers(8),
    recentSessions: getAllSessions(null, 12),
  };
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  insertSession,
  getAllSessions,
  getStats,
  findOrCreateUser,
  getUserById,
  getAllUsers,
  getAdminOverview,
  closeDatabase,
};
