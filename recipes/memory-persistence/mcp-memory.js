import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

process.on('unhandledRejection', (err) => {
  process.stderr.write(`research-memory: fatal: ${err.message}\n`);
  process.exit(1);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.MEMORY_DB_PATH || path.join(__dirname, 'memory.db');

let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_key_project ON memory(key, project);

  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    key, content, content=memory, content_rowid=id
  );

  CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
    INSERT INTO memory_fts(rowid, key, content) VALUES (new.id, new.key, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, key, content)
      VALUES('delete', old.id, old.key, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, key, content)
      VALUES('delete', old.id, old.key, old.content);
    INSERT INTO memory_fts(rowid, key, content) VALUES (new.id, new.key, new.content);
  END;

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    next_steps TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, project)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project, created_at DESC);
`);
} catch (err) {
  process.stderr.write(`research-memory: failed to open database at ${dbPath}: ${err.message}\n`);
  process.exit(1);
}

const TOOLS = [
  {
    name: 'memory_save',
    description: 'Save or update a memory entry. Use to persist decisions, patterns, and context that should survive session compaction.',
    inputSchema: {
      type: 'object',
      properties: {
        key:     { type: 'string', description: 'Unique key within the project (e.g. "auth-pattern", "current-task")' },
        content: { type: 'string', description: 'The memory content to store' },
        project: { type: 'string', description: 'Project name (defaults to "default")' }
      },
      required: ['key', 'content']
    }
  },
  {
    name: 'memory_read',
    description: 'Read a specific memory entry by key.',
    inputSchema: {
      type: 'object',
      properties: {
        key:     { type: 'string', description: 'The key to retrieve (same key used in memory_save)' },
        project: { type: 'string', description: 'Project name (defaults to "default")' }
      },
      required: ['key']
    }
  },
  {
    name: 'memory_search',
    description: 'Full-text search across saved memories. Returns up to 10 results.',
    inputSchema: {
      type: 'object',
      properties: {
        query:   { type: 'string', description: 'Search terms' },
        project: { type: 'string', description: 'Limit search to a specific project (defaults to all projects)' }
      },
      required: ['query']
    }
  },
  {
    name: 'session_save',
    description: 'Save an end-of-session summary with next steps. Call at the end of significant work sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The Claude Code session UUID' },
        project:    { type: 'string' },
        title:      { type: 'string', description: 'Short title (≤10 words)' },
        summary:    { type: 'string', description: 'What was accomplished and key decisions' },
        next_steps: { type: 'array', items: { type: 'string' }, description: '2–5 concrete next actions' }
      },
      required: ['session_id', 'project', 'title', 'summary', 'next_steps']
    }
  },
  {
    name: 'session_get',
    description: 'Get the most recent session summary for a project. Call at session start to load prior context.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' }
      },
      required: ['project']
    }
  }
];

const server = new Server(
  { name: 'research-memory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a } = req.params;

  try {
    if (name === 'memory_save') {
      const project = a.project || 'default';
      db.prepare(`
        INSERT INTO memory (key, content, project, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(key, project) DO UPDATE SET
          content = excluded.content,
          updated_at = excluded.updated_at
      `).run(a.key, a.content, project);
      return { content: [{ type: 'text', text: `Saved: ${a.key} [${project}]` }] };
    }

    if (name === 'memory_read') {
      const project = a.project || 'default';
      const row = db.prepare('SELECT * FROM memory WHERE key = ? AND project = ?').get(a.key, project);
      if (!row) return { content: [{ type: 'text', text: `Not found: ${a.key} [${project}]` }] };
      return { content: [{ type: 'text', text: row.content }] };
    }

    if (name === 'memory_search') {
      const sanitized = (a.query || '')
        .replace(/[."*()^~:+\-]/g, ' ')
        .replace(/\b(AND|OR|NOT)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!sanitized) return { content: [{ type: 'text', text: 'Query is empty after sanitization.' }] };
      const rows = a.project
        ? db.prepare(`SELECT m.key, m.content, m.project FROM memory_fts f JOIN memory m ON f.rowid = m.id WHERE memory_fts MATCH ? AND m.project = ? ORDER BY rank LIMIT 10`).all(sanitized, a.project)
        : db.prepare(`SELECT m.key, m.content, m.project FROM memory_fts f JOIN memory m ON f.rowid = m.id WHERE memory_fts MATCH ? ORDER BY rank LIMIT 10`).all(sanitized);
      if (!rows.length) return { content: [{ type: 'text', text: 'No results found.' }] };
      return { content: [{ type: 'text', text: rows.map(r => `[${r.project}] ${r.key}\n${r.content}`).join('\n\n---\n\n') }] };
    }

    if (name === 'session_save') {
      const nextSteps = Array.isArray(a.next_steps) ? a.next_steps : [];
      db.prepare(`
        INSERT INTO sessions (session_id, project, title, summary, next_steps)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, project) DO UPDATE SET
          title = excluded.title, summary = excluded.summary, next_steps = excluded.next_steps
      `).run(a.session_id, a.project, a.title, a.summary, JSON.stringify(nextSteps));
      return { content: [{ type: 'text', text: `Session saved: ${a.title}` }] };
    }

    if (name === 'session_get') {
      const row = db.prepare('SELECT * FROM sessions WHERE project = ? ORDER BY created_at DESC LIMIT 1').get(a.project);
      if (!row) return { content: [{ type: 'text', text: `No sessions saved yet for: ${a.project}` }] };
      const steps = JSON.parse(row.next_steps || '[]');
      return { content: [{ type: 'text', text: `# ${row.title}\n\n${row.summary}\n\n## Next Steps\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
