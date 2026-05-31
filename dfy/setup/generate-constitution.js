#!/usr/bin/env node
/**
 * generate-constitution.js
 *
 * Reads intake.json → outputs:
 *   constitution.md       — RS system context for the client's Claude sessions
 *   env-template.txt      — blank env vars to fill in
 *   setup-mailboxes.sql   — SQLite INSERT statements for mailboxes (no REST API exists)
 *   setup-orchestrator.sh — curl commands for orchestrator tasks + mailbox triggers
 *
 * Usage:
 *   node generate-constitution.js [intake.json] [output-dir]
 *
 * Defaults:
 *   intake.json  → ./intake.json
 *   output-dir   → ./output/
 *
 * Prerequisites (documented in constitution.md, not enforced here):
 *   - Node.js 18+ on client machine
 *   - Claude Code CLI installed and authenticated (client's own Anthropic account)
 *   - RS processes running: node server.js, node mcp-server.js, node orchestrator.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const intakePath = process.argv[2] || path.join(__dirname, 'intake.json');
const outputDir  = process.argv[3] || path.join(__dirname, 'output');

if (!fs.existsSync(intakePath)) {
  console.error(`intake.json not found at: ${intakePath}`);
  console.error('Copy intake.example.json to intake.json and fill it out.');
  process.exit(1);
}

const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));
fs.mkdirSync(outputDir, { recursive: true });

const {
  client,
  projects = [],
  mailboxes = [],
  goals = [],
  orchestrator_tasks = [],
  mailbox_triggers = [],
  integrations = {},
  preferences = {}
} = intake;

const now = new Date().toISOString().slice(0, 10);
const slug = client.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const memProject = preferences.memory_project || slug;
const activeProjects = projects.filter(p => p.status === 'active');
const firstProjectPath = activeProjects[0]?.code_path || client.rs_install_path || '/path/to/projects';
const rsOrchestratorBase = `http://${client.rs_host || 'localhost'}:9009`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeSQL(val) {
  return String(val ?? '').replace(/'/g, "''");
}

function buildMorningBriefingGoal() {
  const projectList = activeProjects.map(p => p.name).join(', ') || 'active projects';
  return `Load recent memory and project context for ${memProject}. Generate a morning briefing email covering: (1) status of ${projectList}, (2) any blocked items or decisions needed, (3) top 3 priorities for today. Send via email to the primary inbox with subject 'Morning Briefing — [today date]'. Be concise — 5–10 bullet points total, no preamble.`;
}

function buildSredGoal() {
  const repo = activeProjects.find(p => p.github_repo)?.code_path || firstProjectPath;
  return `Generate a SR&ED technical diary entry from recent git activity in ${repo}. Review git log from the past 7 days, identify work that involved technical uncertainty or experimental development, and write a concise diary entry in CRA-compliant format: date range, hypothesis, experiment, results/observations. Save to sred-diary.md in the project directory and reply with a summary.`;
}

function getGoalForTask(task) {
  if (task.goal) return task.goal;
  const name = task.name.toLowerCase();
  if (name.includes('morning') || name.includes('briefing')) return buildMorningBriefingGoal();
  if (name.includes('sred') || name.includes('sr&ed')) return buildSredGoal();
  return task.description || task.name;
}

// ── constitution.md ───────────────────────────────────────────────────────────

const projectTable = activeProjects.length
  ? [
      '| Project | Path | Description |',
      '|---------|------|-------------|',
      ...activeProjects.map(p => `| \`${p.name}\` | \`${p.code_path}\` | ${p.description} |`)
    ].join('\n')
  : '_No projects configured._';

const mailboxSection = mailboxes
  .filter(mb => !mb._example_m365)
  .map(mb => {
    const authNote = mb.auth_type === 'oauth2_m365'
      ? `OAuth2 M365 — credentials via env vars \`${mb.tenant_id_env}\`, \`${mb.client_id_env}\`, \`${mb.client_secret_env}\``
      : `Basic auth — password in env as \`${mb.password_env}\``;
    const m365Warning = mb.auth_type === 'oauth2_m365'
      ? '\n- **Status:** Requires M365 OAuth2 app registration (see m365-oauth-guide.md)'
      : '';
    return [
      `### ${mb.label}${mb.is_primary ? ' *(primary)*' : ''}`,
      `- **Name:** \`${mb.name}\`  |  **Address:** ${mb.email}`,
      `- **IMAP:** \`${mb.imap_host}:${mb.imap_port}\`  |  **SMTP:** \`${mb.smtp_host}:${mb.smtp_port}\``,
      `- **Auth:** ${authNote}${m365Warning}`
    ].join('\n');
  }).join('\n\n') || '_No mailboxes configured._';

const tasksSection = orchestrator_tasks.length
  ? orchestrator_tasks.map(t => {
      const goal = getGoalForTask(t);
      return `- **${t.name}** (\`${t.schedule}\`)\n  > ${goal.slice(0, 120)}${goal.length > 120 ? '…' : ''}`;
    }).join('\n')
  : '_No scheduled tasks configured._';

const triggersSection = mailbox_triggers.length
  ? mailbox_triggers.map(t => [
      `- **${t.name}**`,
      `  - Mailbox: \`${t.mailbox}\`  |  From: ${t.from_filter ? `\`${t.from_filter}\`` : 'all senders'}`,
      `  - CWD: \`${t.cwd}\``,
      `  - Prompt: ${t.prompt_template.slice(0, 120)}${t.prompt_template.length > 120 ? '…' : ''}`
    ].join('\n')).join('\n\n')
  : '_No mailbox triggers configured._';

const integrationsLines = [
  integrations.github ? `- **GitHub** — org: \`${integrations.github_org || 'n/a'}\`, token env: \`${integrations.github_token_env || 'GITHUB_TOKEN'}\`` : null,
].filter(Boolean).join('\n') || '_None configured._';

const goalsSection = goals.map(g => `- ${g}`).join('\n') || '_No goals specified._';

const constitution = `# ${client.business_name} — Research Server Constitution

*Generated ${now} from intake form. Update this document as the setup evolves.*

---

## Prerequisites

This system requires on the client machine:

- **Claude.ai subscription (Pro or higher)** — Claude Code is included in Claude Pro and above. Each orchestrator task runs as a \`claude -p\` subprocess under the client's own account. See [claude.com/pricing](https://claude.com/pricing) for current rates.
- **Claude Code CLI** — installed and authenticated with the client's Anthropic account (\`claude auth\`)
- **Node.js 18+**
- **RS processes running** — server.js (9000), mcp-server.js (9003), orchestrator.js (9009)

Orchestrator tasks consume the client's Claude usage quota. Pro is adequate for a few daily tasks; Max is recommended for heavy automated workloads.

---

## Identity

| Field | Value |
|-------|-------|
| **Owner** | ${client.name} |
| **Business** | ${client.business_name} — ${client.business_type} |
| **Primary email** | ${client.email} |
| **Timezone** | ${client.timezone} |
| **Agent email** | ${client.agent_email} |
| **Memory project** | \`${memProject}\` |
| **RS install path** | \`${client.rs_install_path || 'n/a'}\` |

---

## Goals

${goalsSection}

---

## Active Projects

${projectTable}

---

## Mailboxes

${mailboxSection}

---

## Scheduled Tasks (Orchestrator)

These run via \`orchestrator.js\` on cron. Each spawns a \`claude -p\` session.
**assistant.js is not used for these** — all scheduled automation runs through orchestrator.

${tasksSection}

---

## Mailbox Triggers (Orchestrator)

These watch inboxes hourly and spawn a \`claude -p\` session per qualifying email.

${triggersSection}

---

## Integrations

${integrationsLines}

---

## RS System

| Process | Port | Role |
|---------|------|------|
| server.js | 9000 | Admin UI, terminal, SpecKit |
| mcp-server.js | 9003 | MCP tools: memory, email, calendar, contacts |
| orchestrator.js | 9009 | Cron tasks, mailbox triggers |
| llm-proxy.js | 9001 | LLM proxy (optional) |

Localhost bypasses auth — no API key needed from 127.0.0.1.

---

## Rules

- **Communication style:** ${preferences.communication_style || 'Not specified'}
- **Escalate on:** ${preferences.escalate_on || 'Not specified'}
- **Autonomous OK:** ${preferences.autonomous_ok || 'Not specified'}

---

## Session Protocol

At session start:
\`\`\`
session_get("latest", "${memProject}")
session_summary("${memProject}")
speckit_context("${memProject}")
\`\`\`

At session end:
\`\`\`
session_save({ session_id, project: "${memProject}", title, summary, next_steps })
\`\`\`
`;

// ── env-template.txt ──────────────────────────────────────────────────────────

const envLines = [
  '# Research Server — Environment Variables',
  `# Client: ${client.business_name}`,
  `# Generated: ${now}`,
  '# Fill in real values and copy to client .env',
  '',
  '# Encryption master key',
  '# Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  'RS_MASTER_KEY=',
  '',
];

mailboxes.filter(mb => !mb._example_m365).forEach(mb => {
  envLines.push(`# Mailbox: ${mb.label} (${mb.email})`);
  if (mb.auth_type === 'oauth2_m365') {
    envLines.push(`${mb.tenant_id_env}=`);
    envLines.push(`${mb.client_id_env}=`);
    envLines.push(`${mb.client_secret_env}=`);
    envLines.push('# See m365-oauth-guide.md for Azure AD setup steps');
  } else {
    envLines.push(`${mb.password_env}=`);
  }
  envLines.push('');
});

if (integrations.github && integrations.github_token_env) {
  envLines.push('# GitHub');
  envLines.push(`${integrations.github_token_env}=`);
  envLines.push('');
}

// ── setup-mailboxes.sql ───────────────────────────────────────────────────────
// Mailbox management is MCP-tool-only (no REST API). Use direct SQLite INSERT
// on the client's db/jobs.db during setup, before RS is running.
// After RS starts, use: claude -p "add mailbox X" --allowed-mcp-server-names research-memory

const sqlLines = [
  '-- Research Server mailbox setup',
  `-- Client: ${client.business_name} — generated ${now}`,
  '-- Run against: <rs-install-path>/db/jobs.db',
  '-- Usage: sqlite3 db/jobs.db < setup-mailboxes.sql',
  '--',
  '-- IMPORTANT: Replace <PASSWORD_*> placeholders with real values from .env',
  '--            Do not store this file with real passwords.',
  '',
];

mailboxes.filter(mb => !mb._example_m365 && mb.auth_type !== 'oauth2_m365').forEach(mb => {
  sqlLines.push(`-- Mailbox: ${mb.label} (${mb.email})`);
  sqlLines.push(`INSERT OR REPLACE INTO mailboxes`);
  sqlLines.push(`  (name, label, imap_host, imap_port, imap_user, imap_pass,`);
  sqlLines.push(`   smtp_host, smtp_port, smtp_user, smtp_pass, is_primary, active)`);
  sqlLines.push(`VALUES`);
  sqlLines.push(`  ('${escapeSQL(mb.name)}', '${escapeSQL(mb.label)}',`);
  sqlLines.push(`   '${escapeSQL(mb.imap_host)}', ${mb.imap_port}, '${escapeSQL(mb.username)}', '<${mb.password_env}>',`);
  sqlLines.push(`   '${escapeSQL(mb.smtp_host)}', ${mb.smtp_port}, '${escapeSQL(mb.username)}', '<${mb.password_env}>',`);
  sqlLines.push(`   ${mb.is_primary ? 1 : 0}, 1);`);
  sqlLines.push('');
});

mailboxes.filter(mb => !mb._example_m365 && mb.auth_type === 'oauth2_m365').forEach(mb => {
  sqlLines.push(`-- M365 mailbox: ${mb.label} — requires OAuth2 token, see m365-oauth-guide.md`);
  sqlLines.push('');
});

// ── setup-orchestrator.sh ─────────────────────────────────────────────────────

const orchLines = [
  '#!/bin/bash',
  '# Orchestrator setup: tasks + mailbox triggers',
  `# Client: ${client.business_name} — generated ${now}`,
  '# Prerequisites: orchestrator.js running on port 9009, .env sourced',
  '',
  'set -e',
  `ORCH="http://localhost:9009"`,
  '',
  '# ── Scheduled tasks ─────────────────────────────────────────────────────────',
  '',
];

orchestrator_tasks.forEach(t => {
  const goal = getGoalForTask(t);
  const codePath = t.code_path || firstProjectPath;
  const safeGoal = goal.replace(/'/g, "'\\''");
  orchLines.push(`echo "Adding task: ${t.name}"`);
  orchLines.push(`curl -sf -X POST $ORCH/api/projects \\`);
  orchLines.push(`  -H "Content-Type: application/json" \\`);
  orchLines.push(`  -d '{"name":"${t.name}","code_path":"${codePath}","cron_expr":"${t.schedule}","goal":"${safeGoal}"}' \\`);
  orchLines.push(`  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  OK:', '${t.name}') if d.get('ok') or d.get('id') else print('  FAILED:', d)"`);
  orchLines.push('');
});

orchLines.push('# ── Mailbox triggers ────────────────────────────────────────────────────────');
orchLines.push('');

mailbox_triggers.forEach(t => {
  const safePrompt = t.prompt_template.replace(/'/g, "'\\''");
  const fromFilter = t.from_filter ? `"${t.from_filter}"` : 'null';
  orchLines.push(`echo "Adding trigger: ${t.name}"`);
  orchLines.push(`curl -sf -X POST $ORCH/api/mailbox-triggers \\`);
  orchLines.push(`  -H "Content-Type: application/json" \\`);
  orchLines.push(`  -d '{"name":"${t.name}","mailbox":"${t.mailbox}","from_filter":${fromFilter},"prompt_template":"${safePrompt}","cwd":"${t.cwd}"}' \\`);
  orchLines.push(`  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  OK:', '${t.name}') if d.get('ok') or d.get('id') else print('  FAILED:', d)"`);
  orchLines.push('');
});

orchLines.push('echo ""');
orchLines.push('echo "Orchestrator setup complete. Verify at http://localhost:9009/dashboard"');

// ── Write outputs ──────────────────────────────────────────────────────────────

fs.writeFileSync(path.join(outputDir, 'constitution.md'), constitution);
fs.writeFileSync(path.join(outputDir, 'env-template.txt'), envLines.join('\n'));
fs.writeFileSync(path.join(outputDir, 'setup-mailboxes.sql'), sqlLines.join('\n'));
fs.writeFileSync(path.join(outputDir, 'setup-orchestrator.sh'), orchLines.join('\n'));

console.log(`\nGenerated in ${outputDir}/`);
console.log('  constitution.md         — place in client RS cowork directory');
console.log('  env-template.txt        — fill values, place as client .env');
console.log('  setup-mailboxes.sql     — replace <PASSWORD_*> placeholders, run: sqlite3 db/jobs.db < setup-mailboxes.sql');
console.log('  setup-orchestrator.sh   — run after orchestrator.js is running');
console.log('');
console.log('Setup order:');
console.log('  1. Install RS on client machine (git clone + npm install)');
console.log('  2. Fill env-template.txt → save as .env');
console.log('  3. Ensure claude CLI is authenticated on client machine (claude auth)');
console.log('  4. Fill password placeholders in setup-mailboxes.sql → run it');
console.log('  5. Start RS processes (node server.js, mcp-server.js, orchestrator.js)');
console.log('  6. Run setup-orchestrator.sh');
console.log('  7. Place constitution.md in cowork directory');
if (mailboxes.some(mb => mb.auth_type === 'oauth2_m365')) {
  console.log('\n  ⚠  M365 mailboxes detected — complete m365-oauth-guide.md steps before step 4');
}
