const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.RSC_DB_PATH ||
  path.join(__dirname, '../../../../db/clients.db');
const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function openDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb, DB_PATH };
