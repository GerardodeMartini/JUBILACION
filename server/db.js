import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

export async function initDB() {
  if (db) return db;

  db = await open({
    filename: process.env.DB_PATH || './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      full_name TEXT,
      birth_date TEXT,
      gender TEXT,
      retirement_date TEXT,
      status TEXT,
      agreement TEXT,
      law TEXT,
      affiliate_status TEXT,
      ministry TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Migrations for existing databases
  const columnsToAdd = [
    { name: 'agreement', type: 'TEXT' },
    { name: 'law', type: 'TEXT' },
    { name: 'affiliate_status', type: 'TEXT' },
    { name: 'ministry', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    try {
      await db.exec(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Ignore error if column already exists
      if (!e.message.includes('duplicate column name')) {
        console.error(`Error adding column ${col.name}:`, e);
      }
    }
  }

  console.log('Database initialized');
  return db;
}

export async function getDB() {
  if (!db) await initDB();
  return db;
}
