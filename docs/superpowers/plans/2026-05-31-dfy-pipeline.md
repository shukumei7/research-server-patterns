# DFY Pipeline Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude-handled DFY sales → close → setup → support pipeline with email-reply approval gates, running on existing RS infrastructure.

**Architecture:** `rsc/` module added to RSP repo — routes mounted on RS `server.js` at `/rsc/*`, separate SQLite DB at `db/clients.db`. Four orchestrator mailbox triggers handle inbound emails and advance pipeline stage after Allan approves via email reply.

**Tech Stack:** Node.js/Express (existing RS), better-sqlite3 (existing), orchestrator mailbox triggers (existing pattern)

**Working directory for all commands:** `D:/Development/Web/research-server` (RS root, where server.js lives)
**RSP repo directory:** `D:/Development/Web/research-server/code/research-server-patterns`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `code/research-server-patterns/rsc/db/schema.sql` | Create | clients, client_events, staged_actions table definitions |
| `code/research-server-patterns/rsc/db/setup.js` | Create | Opens/creates clients.db, runs schema |
| `code/research-server-patterns/rsc/routes/rsc.js` | Create | Express router for /rsc/* — pipeline API + admin dashboard |
| `code/research-server-patterns/rsc/scripts/parse-tally-email.js` | Create | Parses Tally notification email body → structured JSON |
| `code/research-server-patterns/rsc/scripts/generate-constitution.js` | Move | From dfy/setup/generate-constitution.js (no code change) |
| `code/research-server-patterns/rsc/scripts/crypto-helper.js` | Move | From dfy/setup/crypto-helper.js (no code change) |
| `server.js` | Modify | Mount RSC router at `/rsc/*` |
| `code/research-server-patterns/dfy/setup/README.md` | Modify | Note scripts moved to rsc/scripts/ |

---

## Task 1: DB Schema + Setup Module

**Files:**
- Create: `code/research-server-patterns/rsc/db/schema.sql`
- Create: `code/research-server-patterns/rsc/db/setup.js`

- [ ] **Step 1: Create the rsc directory structure**

```bash
mkdir -p code/research-server-patterns/rsc/db
mkdir -p code/research-server-patterns/rsc/routes
mkdir -p code/research-server-patterns/rsc/scripts
```

- [ ] **Step 2: Create schema.sql**

Create `code/research-server-patterns/rsc/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS clients (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT NOT NULL UNIQUE,
  name                TEXT,
  business_name       TEXT,
  stage               TEXT NOT NULL DEFAULT 'INQUIRY',
  intake_data         TEXT,
  questionnaire_data  TEXT,
  stripe_intent       TEXT,
  notes               TEXT,
  delivered_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  event_type  TEXT NOT NULL,
  data        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staged_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id),
  action_type  TEXT NOT NULL,
  draft_body   TEXT NOT NULL,
  to_email     TEXT,
  subject      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  approved_at  TEXT,
  executed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Create setup.js**

Create `code/research-server-patterns/rsc/db/setup.js`:

```js
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
```

- [ ] **Step 4: Verify schema initializes correctly**

```bash
node -e "
const { openDb, DB_PATH } = require('./code/research-server-patterns/rsc/db/setup.js');
const db = openDb();
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables:', tables.map(t => t.name));
console.log('DB at:', DB_PATH);
"
```

Expected output:
```
Tables: [ { name: 'clients' }, { name: 'client_events' }, { name: 'staged_actions' } ]
DB at: D:\Development\Web\research-server\db\clients.db
```

- [ ] **Step 5: Commit**

```bash
git -C code/research-server-patterns add rsc/db/schema.sql rsc/db/setup.js
git -C code/research-server-patterns commit -m "feat(rsc): add clients.db schema and setup module"
```

---

## Task 2: RSC Routes — Pipeline API + Admin Dashboard

**Files:**
- Create: `code/research-server-patterns/rsc/routes/rsc.js`

- [ ] **Step 1: Create rsc.js router**

Create `code/research-server-patterns/rsc/routes/rsc.js`:

```js
const express = require('express');
const { openDb } = require('../db/setup');

function createRscRouter() {
  const router = express.Router();
  const db = openDb();

  // ── Clients ────────────────────────────────────────────────────────────────

  router.get('/api/clients', (req, res) => {
    const clients = db.prepare(
      'SELECT * FROM clients ORDER BY updated_at DESC'
    ).all();
    res.json({ ok: true, data: clients });
  });

  router.get('/api/clients/:id', (req, res) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'not found' });
    const events = db.prepare(
      'SELECT * FROM client_events WHERE client_id = ? ORDER BY created_at DESC'
    ).all(client.id);
    const actions = db.prepare(
      'SELECT * FROM staged_actions WHERE client_id = ? ORDER BY created_at DESC'
    ).all(client.id);
    res.json({ ok: true, data: { ...client, events, actions } });
  });

  router.get('/api/clients/by-email/:email', (req, res) => {
    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(
      decodeURIComponent(req.params.email)
    );
    if (!client) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, data: client });
  });

  router.post('/api/clients', (req, res) => {
    const { email, name, business_name, stage, intake_data, questionnaire_data } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      db.prepare(`
        INSERT INTO clients (email, name, business_name, stage, intake_data, questionnaire_data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          name = COALESCE(excluded.name, name),
          business_name = COALESCE(excluded.business_name, business_name),
          stage = excluded.stage,
          intake_data = COALESCE(excluded.intake_data, intake_data),
          questionnaire_data = COALESCE(excluded.questionnaire_data, questionnaire_data),
          updated_at = datetime('now')
      `).run(
        email,
        name || null,
        business_name || null,
        stage || 'INQUIRY',
        intake_data ? JSON.stringify(intake_data) : null,
        questionnaire_data ? JSON.stringify(questionnaire_data) : null
      );
      const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
      res.json({ ok: true, data: client });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/clients/:id/stage', (req, res) => {
    const { stage } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage required' });
    db.prepare("UPDATE clients SET stage = ?, updated_at = datetime('now') WHERE id = ?")
      .run(stage, req.params.id);
    db.prepare(
      "INSERT INTO client_events (client_id, event_type, data) VALUES (?, 'stage_change', ?)"
    ).run(req.params.id, JSON.stringify({ stage }));
    res.json({ ok: true });
  });

  // ── Staged Actions ─────────────────────────────────────────────────────────

  router.get('/api/staged', (req, res) => {
    const actions = db.prepare(`
      SELECT sa.*, c.email, c.name FROM staged_actions sa
      JOIN clients c ON sa.client_id = c.id
      WHERE sa.status = 'pending'
      ORDER BY sa.created_at DESC
    `).all();
    res.json({ ok: true, data: actions });
  });

  router.post('/api/clients/:id/actions', (req, res) => {
    const { action_type, draft_body, to_email, subject } = req.body;
    if (!action_type || !draft_body) {
      return res.status(400).json({ error: 'action_type and draft_body required' });
    }
    const result = db.prepare(
      'INSERT INTO staged_actions (client_id, action_type, draft_body, to_email, subject) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, action_type, draft_body, to_email || null, subject || null);
    db.prepare(
      "INSERT INTO client_events (client_id, event_type, data) VALUES (?, 'action_staged', ?)"
    ).run(req.params.id, JSON.stringify({ action_type, subject }));
    res.json({ ok: true, data: { id: result.lastInsertRowid } });
  });

  router.post('/api/staged/:id/approve', (req, res) => {
    db.prepare("UPDATE staged_actions SET status = 'approved', approved_at = datetime('now') WHERE id = ?")
      .run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/api/staged/:id/reject', (req, res) => {
    db.prepare("UPDATE staged_actions SET status = 'rejected' WHERE id = ?")
      .run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/api/staged/:id/execute', (req, res) => {
    db.prepare("UPDATE staged_actions SET status = 'executed', executed_at = datetime('now') WHERE id = ?")
      .run(req.params.id);
    const action = db.prepare('SELECT * FROM staged_actions WHERE id = ?').get(req.params.id);
    if (action) {
      db.prepare(
        "INSERT INTO client_events (client_id, event_type, data) VALUES (?, 'action_executed', ?)"
      ).run(action.client_id, JSON.stringify({ action_type: action.action_type }));
    }
    res.json({ ok: true });
  });

  // ── Admin Dashboard ────────────────────────────────────────────────────────

  router.get('/admin', (req, res) => {
    const clients = db.prepare('SELECT * FROM clients ORDER BY updated_at DESC').all();
    const pending = db.prepare(`
      SELECT sa.*, c.email, c.name FROM staged_actions sa
      JOIN clients c ON sa.client_id = c.id
      WHERE sa.status = 'pending'
      ORDER BY sa.created_at DESC
    `).all();

    const rows = clients.map(c =>
      `<tr><td>${c.email}</td><td>${c.name || ''}</td>` +
      `<td><span class="badge">${c.stage}</span></td><td>${c.updated_at}</td>` +
      `<td><a href="/rsc/admin/clients/${c.id}">view</a></td></tr>`
    ).join('');

    const pendingRows = pending.map(a =>
      `<tr><td>${a.email}</td><td>${a.action_type}</td>` +
      `<td>${a.subject || ''}</td><td>${a.created_at}</td>` +
      `<td><button onclick="approve(${a.id})">Approve</button> ` +
      `<button onclick="reject(${a.id})">Reject</button></td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>DFY Pipeline</title>
<style>body{font-family:system-ui;max-width:1000px;margin:2rem auto;padding:1rem;background:#fafafa}
h1{font-size:1.5rem}h2{font-size:1rem;color:#555;margin:1.5rem 0 .5rem}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{text-align:left;padding:.4rem .6rem;background:#f0f0f0}
td{padding:.4rem .6rem;border-bottom:1px solid #e5e7eb}
.badge{background:#dbeafe;color:#1e40af;padding:.1rem .4rem;border-radius:4px;font-size:.75rem}
button{margin-right:.25rem;padding:.2rem .5rem;cursor:pointer}</style></head>
<body><h1>DFY Pipeline</h1>
<h2>Pending Approvals (${pending.length})</h2>
<table><tr><th>Client</th><th>Action</th><th>Subject</th><th>Created</th><th></th></tr>
${pendingRows}</table>
<h2>All Clients (${clients.length})</h2>
<table><tr><th>Email</th><th>Name</th><th>Stage</th><th>Updated</th><th></th></tr>
${rows}</table>
<script>
async function approve(id){await fetch('/rsc/api/staged/'+id+'/approve',{method:'POST'});location.reload();}
async function reject(id){await fetch('/rsc/api/staged/'+id+'/reject',{method:'POST'});location.reload();}
</script></body></html>`);
  });

  return router;
}

module.exports = createRscRouter;
```

- [ ] **Step 2: Verify the router loads without errors**

```bash
node -e "const r = require('./code/research-server-patterns/rsc/routes/rsc.js'); console.log('Router loaded OK');"
```

Expected: `Router loaded OK`

- [ ] **Step 3: Commit**

```bash
git -C code/research-server-patterns add rsc/routes/rsc.js
git -C code/research-server-patterns commit -m "feat(rsc): add pipeline API routes and admin dashboard"
```

---

## Task 3: Mount RSC Router on server.js

**Files:**
- Modify: `server.js` (lines near `module.exports = app`)

- [ ] **Step 1: Add RSC mount before `module.exports = app`**

Find the line `module.exports = app;` at the bottom of `server.js` and add the RSC mount immediately before it:

```js
// DFY pipeline routes
const createRscRouter = require('./code/research-server-patterns/rsc/routes/rsc');
app.use('/rsc', tailscaleAuth, createRscRouter());
console.log('[RSC] DFY pipeline routes registered at /rsc');
```

- [ ] **Step 2: Verify RS starts without errors**

```bash
curl -s --max-time 5 http://localhost:9000/health
```

Expected: `{"status":"ok"}`

If RS isn't running, start it first:
```bash
node server.js &
sleep 3
curl -s http://localhost:9000/health
```

- [ ] **Step 3: Verify RSC routes respond**

```bash
curl -s http://localhost:9000/rsc/api/clients
```

Expected: `{"ok":true,"data":[]}`

```bash
curl -s http://localhost:9000/rsc/api/staged
```

Expected: `{"ok":true,"data":[]}`

- [ ] **Step 4: Verify admin dashboard renders**

```bash
curl -s http://localhost:9000/rsc/admin | head -5
```

Expected: HTML response starting with `<!DOCTYPE html>`

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): mount RSC DFY pipeline routes at /rsc"
```

---

## Task 4: Tally Email Parser + Move Scripts

**Files:**
- Create: `code/research-server-patterns/rsc/scripts/parse-tally-email.js`
- Move: `code/research-server-patterns/dfy/setup/generate-constitution.js` → `code/research-server-patterns/rsc/scripts/generate-constitution.js`
- Move: `code/research-server-patterns/dfy/setup/crypto-helper.js` → `code/research-server-patterns/rsc/scripts/crypto-helper.js`

- [ ] **Step 1: Create parse-tally-email.js**

Create `code/research-server-patterns/rsc/scripts/parse-tally-email.js`:

```js
/**
 * Parses a Tally form notification email body into a structured object.
 *
 * Tally email format:
 *   New submission for "Form Name"
 *
 *   Field Label
 *   Field Value
 *
 *   Next Label
 *   Next Value
 */
function parseTallyEmail(emailBody) {
  const lines = emailBody.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const formNameMatch = lines[0]?.match(/New submission for "(.+)"/);
  const formName = formNameMatch ? formNameMatch[1] : 'Unknown Form';

  // Known labels from both RSP Tally forms
  const knownLabels = new Set([
    'Your name', 'Business name', 'What does your business do?',
    'Primary email address', 'Timezone', 'Agent email address',
    'Hosting target', 'What is your hosting target?',
    'Hostname or IP address', 'SSH username', 'SSH port',
    'Is Node.js 18+ installed?', 'Preferred install path',
    'Which accounts to connect?',
    "What's your main goal in one sentence?",
    'Project 1 name', 'Project 1 — path on your machine',
    'Project 1 — one-sentence description', 'Project 1 — GitHub repo, if any',
    'Project 2 name', 'Project 2 — path on your machine',
    'Project 2 — one-sentence description',
    'Project 3 name', 'Project 3 — path on your machine',
    'Project 3 — one-sentence description',
    'Mailbox 1 label', 'Mailbox 1 email address',
    'Mailbox 1 IMAP host', 'Mailbox 1 SMTP host', 'Mailbox 1 auth type',
    'Mailbox 1 — should this be the primary outbound mailbox?',
    'Mailbox 2 label', 'Mailbox 2 email address',
    'Mailbox 2 IMAP host', 'Mailbox 2 SMTP host', 'Mailbox 2 auth type',
    'Should Claude send you a daily morning briefing email?',
    'Do you have R&D work that may qualify for Canadian SR&ED tax credits?',
    'Any other scheduled tasks you want? Describe them.',
    'What email triggers do you want configured?',
    'Do you have a Claude.ai Pro subscription (or higher)?',
    'GitHub org or username, if connecting GitHub',
    'How should Claude write in emails?',
    'What should Claude always ask you before doing?',
    'What can Claude do without asking?',
    'Anything else we should know?',
  ]);

  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    if (knownLabels.has(lines[i]) && i + 1 < lines.length) {
      const value = lines[i + 1];
      if (!knownLabels.has(value)) {
        fields[lines[i]] = value;
        i++;
      }
    }
  }

  // Extract respondent email from fields or dedicated line
  const respondentEmail =
    fields['Primary email address'] ||
    fields['Your email'] ||
    lines.find(l => l.includes('@') && !l.includes('tally.so')) ||
    null;

  return { formName, respondentEmail, fields };
}

module.exports = { parseTallyEmail };

// CLI: echo "email body" | node parse-tally-email.js
if (require.main === module) {
  let body = '';
  process.stdin.on('data', d => { body += d; });
  process.stdin.on('end', () => {
    console.log(JSON.stringify(parseTallyEmail(body), null, 2));
  });
}
```

- [ ] **Step 2: Test parser with a sample Tally email**

```bash
echo 'New submission for "Research Server — Done-For-You Intake"

Your name
Jane Smith

Business name
Acme Dev Inc.

Primary email address
jane@acmedev.ca

What is your hosting target?
Windows machine

What'"'"'s your main goal in one sentence?
Email triggers and morning briefing' | node code/research-server-patterns/rsc/scripts/parse-tally-email.js
```

Expected output:
```json
{
  "formName": "Research Server — Done-For-You Intake",
  "respondentEmail": "jane@acmedev.ca",
  "fields": {
    "Your name": "Jane Smith",
    "Business name": "Acme Dev Inc.",
    "Primary email address": "jane@acmedev.ca",
    "What is your hosting target?": "Windows machine",
    "What's your main goal in one sentence?": "Email triggers and morning briefing"
  }
}
```

- [ ] **Step 3: Move generate-constitution.js and crypto-helper.js**

```bash
cp code/research-server-patterns/dfy/setup/generate-constitution.js code/research-server-patterns/rsc/scripts/generate-constitution.js
cp code/research-server-patterns/dfy/setup/crypto-helper.js code/research-server-patterns/rsc/scripts/crypto-helper.js
```

Verify copies work:
```bash
node -e "require('./code/research-server-patterns/rsc/scripts/crypto-helper.js'); console.log('crypto-helper OK');"
```

Expected: `crypto-helper OK`

- [ ] **Step 4: Update dfy/setup/README.md to note scripts moved**

Edit `code/research-server-patterns/dfy/setup/README.md` — update the Workflow section:

```markdown
## Workflow

```
1. Payment clears → send client the Tally setup questionnaire: https://tally.so/r/lbvKpv
2. Tally submits notification email → dfy-intake trigger parses it automatically
3. Review staged action in /rsc/admin, approve via email reply
4. For manual use: fill rsc/scripts/intake.example.json, run node rsc/scripts/generate-constitution.js
5. Follow dfy/setup/DELIVERY-WORKFLOW.md day by day
```

## Scripts

Scripts have moved to `rsc/scripts/` in this repo:
- `rsc/scripts/generate-constitution.js` — generates constitution.md from intake.json
- `rsc/scripts/crypto-helper.js` — AES-256-GCM encryption for credential transmission
- `rsc/scripts/parse-tally-email.js` — parses Tally notification emails to JSON
```

- [ ] **Step 5: Commit**

```bash
git -C code/research-server-patterns add rsc/scripts/ dfy/setup/README.md
git -C code/research-server-patterns commit -m "feat(rsc): add Tally email parser, move generate-constitution and crypto-helper to rsc/scripts"
```

---

## Task 5: Register Orchestrator Triggers + Monitor Task

**No new files.** All four pipeline tasks are registered via the orchestrator REST API.

The orchestrator must be running on port 9009. Verify:
```bash
curl -s http://localhost:9009/api/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print('Orchestrator OK:', len(d['data']), 'tasks')"
```

- [x] **Step 1: Register `dfy-inquiry` mailbox trigger**

```bash
curl -s -X POST http://localhost:9009/api/mailbox-triggers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dfy-inquiry",
    "mailbox": "claude",
    "from_filter": null,
    "prompt_template": "You have received an inbound email about the Research Server DFY service.\n\nSKIP if the sender is noreply@tally.so, no-reply@stripe.com, or allbate@gmail.com — those are handled by other triggers. If skipping, do nothing.\n\nSTEP 1 — Classify the email as one of: sales (asking about pricing, what is included, timeline), support (existing client with a problem — check http://localhost:9000/rsc/api/clients/by-email/SENDER_EMAIL to see if they are a known client), junk (irrelevant).\n\nSTEP 2 — If sales: draft a helpful reply under 150 words. Direct tone, no pleasantries. Cover what they asked. Include the intake form link https://tally.so/r/Y5kO9q and DFY page https://rsp.shoogarsoft.com/dfy/ naturally.\n\nIf support: look up the client at http://localhost:9000/rsc/api/clients/by-email/SENDER_EMAIL. Draft a response based on their stage and the issue. If client not found, treat as sales.\n\nIf junk: stop, do nothing.\n\nSTEP 3 — Find or create the client record. If client does not exist, POST http://localhost:9000/rsc/api/clients with { email: SENDER_EMAIL, name: inferred from email if possible, stage: INQUIRY }.\n\nSTEP 4 — Create a staged action: POST http://localhost:9000/rsc/api/clients/CLIENT_ID/actions with { action_type: reply_inquiry, draft_body: YOUR_DRAFT, to_email: SENDER_EMAIL, subject: Re: ORIGINAL_SUBJECT }.\n\nSTEP 5 — Email allbate@gmail.com via shoogarsoft-claude mailbox. Subject: DFY Action Needed — SENDER_EMAIL. Body: classification, sender question summary, your draft reply. End with: Reply APPROVE to send this reply, or reply with edits.",
    "cwd": "D:/Development/Web/research-server/code/research-server-patterns"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', d.get('ok'), d.get('data',{}).get('id'))"
```

Expected: `OK: True 1` (or next available ID)

- [x] **Step 2: Register `dfy-intake` mailbox trigger**

```bash
curl -s -X POST http://localhost:9009/api/mailbox-triggers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dfy-intake",
    "mailbox": "claude",
    "from_filter": "tally.so",
    "prompt_template": "You have received a Tally form submission notification.\n\nSTEP 1 — Run: node rsc/scripts/parse-tally-email.js and pass the email body to parse the form data. Extract formName, respondentEmail, and fields.\n\nSTEP 2 — Identify the form:\n- Contains \"Done-For-You Intake\" → initial intake (form Y5kO9q)\n- Contains \"Setup Questionnaire\" → detailed setup data (form lbvKpv)\n\nSTEP 3 — Upsert the client record: POST http://localhost:9000/rsc/api/clients with email=respondentEmail, name=fields[Your name], business_name=fields[Business name], stage=INTAKE_RECEIVED (for intake form) or QUESTIONNAIRE_RX (for setup questionnaire), intake_data or questionnaire_data = the parsed fields JSON.\n\nSTEP 4 — If this is the setup questionnaire: run node rsc/scripts/generate-constitution.js to generate a constitution draft from the parsed data. Save to rsc/output/constitution-CLIENTEMAIL.md.\n\nSTEP 5 — Draft the appropriate next action:\n- Intake: draft acknowledgment email to the client. Tell them their intake is received and they can now pay at https://buy.stripe.com/bJeeV50Jy67l0G43zDbbG00. Note that after payment clears, you will send the detailed setup questionnaire.\n- Setup questionnaire: draft acknowledgment email. Tell them setup questionnaire received, setup will begin within the delivery window, and you will reach out for SSH access details separately.\n\nSTEP 6 — Create staged action: POST http://localhost:9000/rsc/api/clients/CLIENT_ID/actions with action_type and draft.\n\nSTEP 7 — Email allbate@gmail.com via shoogarsoft-claude. Subject: DFY Intake — CLIENT_NAME — FORM_NAME. Body: parsed data highlights, draft next action. Reply APPROVE to send.",
    "cwd": "D:/Development/Web/research-server/code/research-server-patterns"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', d.get('ok'), d.get('data',{}).get('id'))"
```

Expected: `OK: True 2`

- [x] **Step 3: Register `dfy-approve` mailbox trigger**

```bash
curl -s -X POST http://localhost:9009/api/mailbox-triggers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dfy-approve",
    "mailbox": "claude",
    "from_filter": "allbate@gmail.com",
    "prompt_template": "You have received an email from Allan.\n\nSTEP 0 — Check the subject line. If the subject does NOT start with Re: DFY or contain DFY Action Needed, this is not a DFY approval reply. Stop immediately, do nothing.\n\nSTEP 1 — Find the pending staged action this reply corresponds to. Fetch GET http://localhost:9000/rsc/api/staged to list all pending actions. Match by subject line (the original approval email subject) or by the most recently created pending action for the client email mentioned.\n\nSTEP 2 — Parse Allan reply:\n- Contains APPROVE, yes, send it, or looks it: approve and execute.\n- Contains edits, corrections, or revised text: update the staged action draft_body with the corrected text, re-notify Allan with the revised draft for re-approval. Post to /rsc/api/clients/ID/actions with updated draft, email Allan again.\n- Contains reject, no, cancel, skip: mark rejected via POST /rsc/api/staged/ID/reject. Email Allan: Rejected — [action summary].\n\nSTEP 3 — If approved: execute the action.\n- For reply_inquiry, send_questionnaire, send_handoff, send_payment_link: send the draft_body as an email to the to_email address using the primary mailbox.\n- Mark executed: POST /rsc/api/staged/ID/execute.\n- Advance client stage if appropriate: POST /rsc/api/clients/ID/stage.\n\nSTEP 4 — Confirm to Allan via email: Executed: [action_type] for [client email]. Client is now at stage [STAGE].",
    "cwd": "D:/Development/Web/research-server/code/research-server-patterns"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', d.get('ok'), d.get('data',{}).get('id'))"
```

Expected: `OK: True 3`

- [x] **Step 4: Register `dfy-pipeline-monitor` orchestrator task**

```bash
curl -s -X POST http://localhost:9009/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dfy-pipeline-monitor",
    "code_path": "D:/Development/Web/research-server/code/research-server-patterns",
    "cron_expr": "0 9 * * 1",
    "goal": "Review the DFY client pipeline.\n\nSTEP 1 — Fetch all clients: GET http://localhost:9000/rsc/api/clients. Group by stage.\n\nSTEP 2 — Flag stalled clients:\n- Stage INTAKE_RECEIVED, updated_at older than 48 hours: draft follow-up email to client. Subject: Research Server — Just checking in.\n- Stage QUESTIONNAIRE_SENT, updated_at older than 72 hours: draft questionnaire reminder.\n- Stage DELIVERED, delivered_at older than 14 days: draft retainer offer email. Subject: Research Server — How is it running?\n- Stage SUPPORT with updated_at older than 7 days: flag as inactive.\n\nSTEP 3 — For each flagged client, create a staged action via POST http://localhost:9000/rsc/api/clients/ID/actions.\n\nSTEP 4 — Fetch GET http://localhost:9000/rsc/api/staged for total pending approvals count.\n\nSTEP 5 — Email allbate@gmail.com via shoogarsoft-claude. Subject: DFY Pipeline — N clients — YYYY-MM-DD. Body: list active clients by stage, list stalled clients needing action, total pending approvals. For each stalled client: Reply APPROVE CLIENT_EMAIL to send the follow-up for that client."
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', d.get('ok') or d.get('id'), d.get('data',{}).get('id',d.get('id','')))"
```

Expected: `OK: True ID`

- [x] **Step 5: Verify all four are registered**

```bash
curl -s http://localhost:9009/api/mailbox-triggers | python3 -c "
import sys,json; d=json.load(sys.stdin)
dfy = [t for t in d['data'] if t['name'].startswith('dfy')]
for t in dfy: print(t['name'], '|', t['mailbox'], '|', t.get('from_filter','(none)'))
"
```

Expected:
```
dfy-inquiry | claude | (none)
dfy-intake | claude | tally.so
dfy-approve | claude | allbate@gmail.com
```

```bash
curl -s http://localhost:9009/api/projects | python3 -c "
import sys,json; d=json.load(sys.stdin)
dfy = [p for p in d['data'] if 'dfy' in p['name']]
for p in dfy: print(p['name'], '|', p['cron_expr'])
"
```

Expected: `dfy-pipeline-monitor | 0 9 * * 1`

- [x] **Step 6: Commit trigger registration note**

Triggers are registered in the DB, not in code. Record their existence:

```bash
git -C code/research-server-patterns add docs/
git -C code/research-server-patterns commit -m "docs(rsc): confirm orchestrator triggers registered — dfy-inquiry, dfy-intake, dfy-approve, dfy-pipeline-monitor"
```

---

## Task 6: Smoke Test + Final Cleanup

- [ ] **Step 1: End-to-end API smoke test**

```bash
# Create a test client
curl -s -X POST http://localhost:9000/rsc/api/clients \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test Client","stage":"INQUIRY"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Created ID:', d['data']['id'])"

# Stage an action (use the ID from above, e.g. 1)
curl -s -X POST http://localhost:9000/rsc/api/clients/1/actions \
  -H "Content-Type: application/json" \
  -d '{"action_type":"reply_inquiry","draft_body":"Thanks for your interest. Here is the intake form: https://tally.so/r/Y5kO9q","to_email":"test@example.com","subject":"Re: Your DFY inquiry"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Staged action ID:', d['data']['id'])"

# List pending
curl -s http://localhost:9000/rsc/api/staged | python3 -c "import sys,json; d=json.load(sys.stdin); print('Pending:', len(d['data']))"

# Approve it
curl -s -X POST http://localhost:9000/rsc/api/staged/1/approve | python3 -c "import sys,json; d=json.load(sys.stdin); print('Approved:', d['ok'])"

# Advance stage
curl -s -X POST http://localhost:9000/rsc/api/clients/1/stage \
  -H "Content-Type: application/json" \
  -d '{"stage":"INTAKE_RECEIVED"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Stage advanced:', d['ok'])"

# Verify final state
curl -s http://localhost:9000/rsc/api/clients/1 | python3 -c "
import sys,json; d=json.load(sys.stdin)['data']
print('Client:', d['email'], '| Stage:', d['stage'])
print('Events:', len(d['events']))
print('Actions:', len(d['actions']))
"
```

Expected final output:
```
Client: test@example.com | Stage: INTAKE_RECEIVED
Events: 2
Actions: 1
```

- [ ] **Step 2: Verify admin dashboard at http://localhost:9000/rsc/admin**

Open in a browser (or use curl):
```bash
curl -s http://localhost:9000/rsc/admin | grep -c "<tr>"
```

Expected: at least `2` (header row + test client row)

- [ ] **Step 3: Remove test client**

```bash
node -e "
const { openDb } = require('./code/research-server-patterns/rsc/db/setup.js');
const db = openDb();
const c = db.prepare('SELECT id FROM clients WHERE email = ?').get('test@example.com');
if (c) {
  db.prepare('DELETE FROM staged_actions WHERE client_id = ?').run(c.id);
  db.prepare('DELETE FROM client_events WHERE client_id = ?').run(c.id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(c.id);
  console.log('Test client cleaned up');
} else { console.log('Not found'); }
"
```

- [ ] **Step 4: Final commit**

```bash
git -C code/research-server-patterns add -A
git -C code/research-server-patterns commit -m "feat(rsc): DFY pipeline Phase 1 complete — routes, DB, parser, triggers"
git add server.js
git commit -m "feat(server): RSC DFY pipeline routes mounted"
```

---

## Self-Review Notes

- Spec section covered: ✅ DB schema, ✅ all 4 triggers, ✅ RSC routes, ✅ scripts moved, ✅ admin dashboard, ✅ approval gate
- `dfy-approve` subject-line disambiguation: ✅ included in trigger prompt (STEP 0)
- `dfy-inquiry` skips tally/stripe/allbate senders: ✅ in prompt
- No placeholders in code steps: ✅ verified
- Type consistency: `openDb()` used consistently across setup.js and rsc.js
- `parse-tally-email.js` CLI tested with realistic sample in Task 4 Step 2
