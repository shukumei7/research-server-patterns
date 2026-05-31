#!/usr/bin/env node
/**
 * generate-constitution.js
 *
 * Reads intake.json → outputs constitution.md for the client's RS installation.
 * Also outputs: env-template.txt (list of env vars to set) and setup-commands.sh
 *
 * Usage:
 *   node generate-constitution.js [intake.json] [output-dir]
 *
 * Defaults:
 *   intake.json    → ./intake.json
 *   output-dir     → ./output/
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

const { client, projects = [], mailboxes = [], goals = [], orchestrator_tasks = [], mailbox_triggers = [], integrations = {}, preferences = {} } = intake;
const now = new Date().toISOString().slice(0, 10);
const slug = client.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── constitution.md ──────────────────────────────────────────────────────────

const activeProjects = projects.filter(p => p.status === 'active');

const projectTable = activeProjects.length
  ? [
      '| Project | Path | Description |',
      '|---------|------|-------------|',
      ...activeProjects.map(p => `| \`${p.name}\` | \`${p.code_path}\` | ${p.description} |`)
    ].join('\n')
  : '_No projects configured._';

const mailboxSection = mailboxes.map(mb => {
  if (mb._example_m365) return null;
  const authNote = mb.auth_type === 'oauth2_m365'
    ? `OAuth2 M365 — tenant: \`${mb.tenant_id_env}\`, client: \`${mb.client_id_env}\` (env vars)`
    : `Basic auth — credentials in env as \`${mb.password_env}\``;
  return [
    `### ${mb.label}${mb.is_primary ? ' *(primary)*' : ''}`,
    `- **Name:** \`${mb.name}\``,
    `- **Address:** ${mb.email}`,
    `- **IMAP:** \`${mb.imap_host}:${mb.imap_port}\``,
    `- **SMTP:** \`${mb.smtp_host}:${mb.smtp_port}\``,
    `- **Auth:** ${authNote}`,
    mb.auth_type === 'oauth2_m365' ? '- **Status:** Requires M365 OAuth2 setup (see m365-oauth-guide.md before going live)' : ''
  ].filter(Boolean).join('\n');
}).filter(Boolean).join('\n\n');

const tasksSection = orchestrator_tasks.length
  ? orchestrator_tasks.map(t => `- **${t.name}** (\`${t.schedule}\`) — ${t.description}`).join('\n')
  : '_No scheduled tasks configured._';

const triggersSection = mailbox_triggers.length
  ? mailbox_triggers.map(t => [
      `- **${t.name}**`,
      `  - Mailbox: \`${t.mailbox}\``,
      t.from_filter ? `  - From filter: \`${t.from_filter}\`` : '  - From filter: none (all senders)',
      `  - CWD: \`${t.cwd}\``,
      `  - Prompt: ${t.prompt_template.slice(0, 120)}${t.prompt_template.length > 120 ? '...' : ''}`
    ].join('\n')).join('\n\n')
  : '_No mailbox triggers configured._';

const integrationsLines = [
  integrations.wave    ? '- **Wave Accounting** — Chrome automation for invoice entry' : null,
  integrations.github  ? `- **GitHub** — org: \`${integrations.github_org || 'n/a'}\`, token env: \`${integrations.github_token_env || 'GITHUB_TOKEN'}\`` : null,
].filter(Boolean).join('\n') || '_No third-party integrations configured._';

const goalsSection = goals.map(g => `- ${g}`).join('\n') || '_No goals specified._';

const constitution = `# ${client.business_name} — Research Server Constitution

*Generated ${now} from intake form. Update this document as the setup evolves.*

---

## Identity

| Field | Value |
|-------|-------|
| **Owner** | ${client.name} |
| **Business** | ${client.business_name} — ${client.business_type} |
| **Primary email** | ${client.email} |
| **Timezone** | ${client.timezone} |
| **Agent email** | ${client.agent_email} |
| **Memory project** | \`${preferences.memory_project || slug}\` |
| **RS host** | \`${client.rs_host || 'localhost'}:${client.rs_port || 9000}\` |

---

## Goals

${goalsSection}

---

## Active Projects

${projectTable}

---

## Mailboxes

${mailboxSection || '_No mailboxes configured._'}

---

## Scheduled Tasks

${tasksSection}

---

## Mailbox Triggers

${triggersSection}

---

## Integrations

${integrationsLines}

---

## RS System

- **Port 9000** — Main server (server.js): terminal, SpecKit, admin
- **Port 9003** — MCP memory (mcp-server.js): memory, skills, email, calendar
- **Port 9009** — Orchestrator (orchestrator.js): cron tasks, mailbox triggers
- **Port 9001** — LLM proxy (llm-proxy.js): Claude/Gemini routing
- **Localhost bypasses auth** — no API key needed from 127.0.0.1

---

## Rules

- **Communication style:** ${preferences.communication_style || 'Not specified'}
- **Escalate on:** ${preferences.escalate_on || 'Not specified'}
- **Autonomous OK:** ${preferences.autonomous_ok || 'Not specified'}

---

## Session Protocol

At session start, load context:
\`\`\`
session_get("latest", "${preferences.memory_project || slug}")
session_summary("${preferences.memory_project || slug}")
speckit_context("${preferences.memory_project || slug}")
\`\`\`

At session end, save a structured summary:
\`\`\`
session_save({ session_id, project: "${preferences.memory_project || slug}", title, summary, next_steps })
\`\`\`
`;

// ── env-template.txt ─────────────────────────────────────────────────────────

const envLines = [
  '# Research Server — Environment Variables',
  `# Client: ${client.business_name}`,
  `# Generated: ${now}`,
  '# Fill in values and append to .env',
  '',
  '# Encryption master key (generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")',
  'RS_MASTER_KEY=',
  '',
];

mailboxes.forEach(mb => {
  if (mb._example_m365) return;
  envLines.push(`# Mailbox: ${mb.label} (${mb.email})`);
  if (mb.auth_type === 'oauth2_m365') {
    envLines.push(`${mb.tenant_id_env}=`);
    envLines.push(`${mb.client_id_env}=`);
    envLines.push(`${mb.client_secret_env}=`);
    envLines.push('# NOTE: M365 requires Azure AD app registration — see m365-oauth-guide.md');
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

// ── setup-commands.sh ─────────────────────────────────────────────────────────

const rsBase = `http://${client.rs_host || 'localhost'}:${client.rs_port || 9009}`;
const mailboxApi = `http://${client.rs_host || 'localhost'}:9003`;

const setupLines = [
  '#!/bin/bash',
  '# Research Server setup commands',
  `# Client: ${client.business_name} — generated ${now}`,
  '# Run from the RS installation directory after .env is populated.',
  '# Prerequisites: RS processes running (npm start), .env sourced.',
  '',
  'set -e',
  '',
  '# ── Mailboxes ───────────────────────────────────────────────────────────────',
  '',
];

mailboxes.forEach(mb => {
  if (mb._example_m365) return;
  if (mb.auth_type === 'oauth2_m365') {
    setupLines.push(`# M365 mailbox: ${mb.label} — manual setup required (see m365-oauth-guide.md)`);
    setupLines.push(`# Once you have a token, add it via the RS admin API or mailbox_add MCP tool.`);
    setupLines.push('');
    return;
  }
  setupLines.push(`echo "Adding mailbox: ${mb.name}"`);
  setupLines.push(`curl -s -X POST ${mailboxApi}/api/mailboxes \\`);
  setupLines.push(`  -H "Content-Type: application/json" \\`);
  setupLines.push(`  -d '{`);
  setupLines.push(`    "name": "${mb.name}",`);
  setupLines.push(`    "label": "${mb.label}",`);
  setupLines.push(`    "imap_host": "${mb.imap_host}",`);
  setupLines.push(`    "imap_port": ${mb.imap_port},`);
  setupLines.push(`    "imap_user": "${mb.username}",`);
  setupLines.push(`    "imap_pass": "'$${mb.password_env}'",`);
  setupLines.push(`    "smtp_host": "${mb.smtp_host}",`);
  setupLines.push(`    "smtp_port": ${mb.smtp_port},`);
  setupLines.push(`    "smtp_user": "${mb.username}",`);
  setupLines.push(`    "smtp_pass": "'$${mb.password_env}'"${mb.is_primary ? ',\n    "is_primary": true' : ''}`);
  setupLines.push(`  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else 'FAILED: '+str(d))"`);
  setupLines.push('');
});

setupLines.push('# ── Orchestrator tasks ──────────────────────────────────────────────────────');
setupLines.push('');

orchestrator_tasks.forEach(t => {
  const firstProject = activeProjects[0];
  const codePath = firstProject ? firstProject.code_path : '/path/to/project';
  setupLines.push(`echo "Adding orchestrator task: ${t.name}"`);
  setupLines.push(`curl -s -X POST ${rsBase}/api/projects \\`);
  setupLines.push(`  -H "Content-Type: application/json" \\`);
  setupLines.push(`  -d '{"name":"${t.name}","code_path":"${codePath}","cron_expr":"${t.schedule}","goal":"${t.description}"}' \\`);
  setupLines.push(`  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else 'FAILED: '+str(d))"`);
  setupLines.push('');
});

setupLines.push('# ── Mailbox triggers ────────────────────────────────────────────────────────');
setupLines.push('');

mailbox_triggers.forEach(t => {
  setupLines.push(`echo "Adding mailbox trigger: ${t.name}"`);
  setupLines.push(`curl -s -X POST ${rsBase}/api/mailbox-triggers \\`);
  setupLines.push(`  -H "Content-Type: application/json" \\`);
  setupLines.push(`  -d '{"name":"${t.name}","mailbox":"${t.mailbox}","from_filter":${t.from_filter ? `"${t.from_filter}"` : 'null'},"prompt_template":"${t.prompt_template.replace(/"/g, '\\"')}","cwd":"${t.cwd}"}' \\`);
  setupLines.push(`  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else 'FAILED: '+str(d))"`);
  setupLines.push('');
});

setupLines.push('echo "Setup complete."');

// ── Write outputs ─────────────────────────────────────────────────────────────

fs.writeFileSync(path.join(outputDir, 'constitution.md'), constitution);
fs.writeFileSync(path.join(outputDir, 'env-template.txt'), envLines.join('\n'));
fs.writeFileSync(path.join(outputDir, 'setup-commands.sh'), setupLines.join('\n'));

console.log(`Generated in ${outputDir}/`);
console.log('  constitution.md    — place in client RS installation directory');
console.log('  env-template.txt   — fill values, append to client .env');
console.log('  setup-commands.sh  — run after RS is running and .env is populated');
console.log('');
console.log('Next steps:');
console.log('  1. Fill env-template.txt with real credentials');
console.log('  2. Start RS on client machine');
console.log('  3. Source .env and run setup-commands.sh');
console.log('  4. Place constitution.md in the RS cowork directory');
if (mailboxes.some(mb => mb.auth_type === 'oauth2_m365')) {
  console.log('  ⚠  M365 mailboxes detected — complete m365-oauth-guide.md steps first');
}
