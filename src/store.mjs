import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.DB_PATH || "data/notes.db";
const MAX_TURNS = 20; // chat messages kept per session

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id);

  CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
`);

// All queries are parameterized (?) to prevent SQL injection.

export function addNote(sessionId, text) {
  db.prepare("INSERT INTO notes (session_id, text) VALUES (?, ?)").run(sessionId, text);
}

export function listNotes(sessionId, limit = 10) {
  return db
    .prepare("SELECT text FROM notes WHERE session_id = ? ORDER BY id DESC LIMIT ?")
    .all(sessionId, limit)
    .map((r) => r.text);
}

export function getTurns(sessionId, limit = MAX_TURNS) {
  return db
    .prepare(
      `SELECT role, text FROM (
         SELECT id, role, text FROM turns WHERE session_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`
    )
    .all(sessionId, limit)
    .map((r) => ({ role: r.role, text: r.text }));
}

export function appendTurns(sessionId, turns) {
  const insert = db.prepare("INSERT INTO turns (session_id, role, text) VALUES (?, ?, ?)");
  const trim = db.prepare(
    `DELETE FROM turns WHERE session_id = ? AND id NOT IN (
       SELECT id FROM turns WHERE session_id = ? ORDER BY id DESC LIMIT ?
     )`
  );

  db.exec("BEGIN");
  try {
    for (const t of turns) insert.run(sessionId, t.role, t.text);
    trim.run(sessionId, sessionId, MAX_TURNS);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}