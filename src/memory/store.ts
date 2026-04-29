import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { mkdir } from 'node:fs/promises';
import type { MemoryEntry } from '../types';

const ROOT = cwd();
const DB_DIR = resolve(ROOT, '.w3x');
const DB_FILE = resolve(DB_DIR, 'memory.sqlite');

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (_db) return _db;
  await mkdir(DB_DIR, { recursive: true });
  _db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      model TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return _db;
}

export async function saveFact(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO facts (key, value, saved_at) VALUES (?, ?, ?)', key, value, new Date().toISOString());
}

export async function loadFact(key: string): Promise<MemoryEntry | null> {
  const db = await getDb();
  const row = await db.get('SELECT * FROM facts WHERE key = ?', key);
  if (!row) return null;
  return {
    key: row.key,
    value: row.value,
    savedAt: row.saved_at,
    source: 'fact'
  };
}

export async function deleteFact(key: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run('DELETE FROM facts WHERE key = ?', key);
  return (result.changes || 0) > 0;
}

export async function listFacts(): Promise<MemoryEntry[]> {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM facts ORDER BY saved_at DESC');
  return rows.map(row => ({
    key: row.key,
    value: row.value,
    savedAt: row.saved_at,
    source: 'fact'
  }));
}

export async function saveSessionSummary(summary: string, model: string, messageCount: number): Promise<void> {
  const db = await getDb();
  await db.run(
    'INSERT INTO sessions (summary, model, message_count, saved_at) VALUES (?, ?, ?, ?)',
    summary, model, messageCount, new Date().toISOString()
  );
  
  // Keep only the last 20 session summaries
  await db.run(`
    DELETE FROM sessions WHERE id NOT IN (
      SELECT id FROM sessions ORDER BY saved_at DESC LIMIT 20
    )
  `);
}

export async function loadRecentSessions(limit = 3): Promise<Array<{ summary: string; savedAt: string }>> {
  const db = await getDb();
  const rows = await db.all('SELECT summary, saved_at FROM sessions ORDER BY saved_at DESC LIMIT ?', limit);
  return rows.map(row => ({
    summary: row.summary,
    savedAt: row.saved_at
  }));
}
