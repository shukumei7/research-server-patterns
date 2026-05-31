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

  router.get('/api/clients/by-email/:email', (req, res) => {
    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(
      decodeURIComponent(req.params.email)
    );
    if (!client) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, data: client });
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
