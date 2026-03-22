const path = require("path");
const Database = require("better-sqlite3");
const { encrypt, decrypt, ensureKey } = require("./crypto-utils");
const { isAdmin } = require("./auth");

const DB_PATH = path.join(__dirname, "stillspace.db");

let db = null;

function getDatabase() {
  if (db) {
    return db;
  }

  ensureKey();

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      duration     INTEGER NOT NULL,
      completed    TEXT    NOT NULL,
      finished_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id  TEXT    UNIQUE NOT NULL,
      email      TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      picture    TEXT,
      role       TEXT    NOT NULL DEFAULT 'user',
      created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  return db;
}

function insertSession(duration, completedSeconds, userId) {
  const database = getDatabase();
  const encryptedCompleted = encrypt(String(completedSeconds));

  const statement = database.prepare(
    "INSERT INTO sessions (duration, completed, user_id) VALUES (?, ?, ?)"
  );

  const result = statement.run(duration, encryptedCompleted, userId || null);

  return { id: result.lastInsertRowid };
}

function findOrCreateUser({ googleId, email, name, picture }) {
  const database = getDatabase();

  let user = database.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);

  if (user) {
    // Update name/picture on each login
    database.prepare("UPDATE users SET name = ?, picture = ? WHERE id = ?").run(name, picture, user.id);
    user.name = name;
    user.picture = picture;
    return user;
  }

  const role = isAdmin(email) ? "admin" : "user";

  const result = database.prepare(
    "INSERT INTO users (google_id, email, name, picture, role) VALUES (?, ?, ?, ?, ?)"
  ).run(googleId, email, name, picture, role);

  return {
    id: result.lastInsertRowid,
    google_id: googleId,
    email,
    name,
    picture,
    role,
  };
}

function getUserById(id) {
  const database = getDatabase();
  return database.prepare("SELECT id, email, name, picture, role, created_at FROM users WHERE id = ?").get(id);
}

function getAllUsers() {
  const database = getDatabase();
  return database.prepare("SELECT id, email, name, picture, role, created_at FROM users ORDER BY created_at DESC").all();
}

function getAllSessions() {
  const database = getDatabase();

  const rows = database
    .prepare("SELECT id, duration, completed, finished_at FROM sessions ORDER BY finished_at DESC")
    .all();

  return rows.map((row) => {
    let completedSeconds;

    try {
      completedSeconds = Number(decrypt(row.completed));
    } catch {
      completedSeconds = 0;
    }

    return {
      id: row.id,
      duration: row.duration,
      completed: completedSeconds,
      finishedAt: row.finished_at,
    };
  });
}

function getStats() {
  const database = getDatabase();

  const rows = database
    .prepare("SELECT duration, completed, finished_at FROM sessions ORDER BY finished_at DESC")
    .all();

  let totalSessions = rows.length;
  let totalMinutes = 0;

  rows.forEach((row) => {
    try {
      const seconds = Number(decrypt(row.completed));
      totalMinutes += seconds / 60;
    } catch {
      // Skip corrupted entries
    }
  });

  // Calculate streak (consecutive days with at least one session)
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
  closeDatabase,
};
