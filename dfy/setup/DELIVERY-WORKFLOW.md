# DFY Delivery Workflow

**$2,500 CAD flat. Target: 7 days from payment to handoff.**

---

## Prerequisites (before Day 1)

- [ ] Intake form submitted at `tally.so/r/Y5kO9q`
- [ ] Payment cleared in Stripe (live mode)
- [ ] `intake.json` filled from intake form data
- [ ] `node generate-constitution.js` run → `output/` reviewed
- [ ] Allan's SSH key ready (one-time setup below)

---

## One-Time: Allan's SSH Key

```bash
# Generate a delivery-specific SSH key (do once, keep safe)
ssh-keygen -t ed25519 -C "allan@shoogarsoft.com" -f ~/.ssh/id_ed25519_rsp_delivery

# View public key — send this to client
cat ~/.ssh/id_ed25519_rsp_delivery.pub
```

Add to `~/.ssh/config` for easy access per client:
```
Host rsp-clientname
  HostName CLIENT_IP_OR_HOSTNAME
  User     CLIENT_SSH_USER
  IdentityFile ~/.ssh/id_ed25519_rsp_delivery
  ServerAliveInterval 60
```

Then connect with: `ssh rsp-clientname`

---

## Day 0 — Kickoff

### Checklist
- [ ] Send acknowledgment email (template below)
- [ ] Confirm: hosting target (Windows or Linux VPS)
- [ ] Confirm: Node.js 18+ installed on client machine
- [ ] Request SSH access (host, port, username)
- [ ] Share Allan's public key with client

### SSH Key Exchange

**Linux VPS (automated):**
```bash
ssh-copy-id -i ~/.ssh/id_ed25519_rsp_delivery.pub CLIENT_USER@CLIENT_IP
# Then test:
ssh rsp-clientname "echo 'SSH OK — $(node --version)'"
```

**Windows (client does this manually):**
Client opens PowerShell as admin:
```powershell
# Create .ssh directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh"

# Add Allan's public key (client pastes the key from the email)
Add-Content -Path "$env:USERPROFILE\.ssh\authorized_keys" -Value "PASTE_ALLANS_PUBLIC_KEY_HERE"

# Enable OpenSSH server if not running
Get-Service sshd | Start-Service
Set-Service -Name sshd -StartupType Automatic
```

Test from Allan's machine:
```bash
ssh rsp-clientname "node --version && echo 'Windows SSH OK'"
```

### Acknowledgment Email Template
```
Subject: Research Server — Setup Started

Hi [Name],

Payment confirmed — setup has started. Expected delivery: [DATE+7].

I need the following to proceed:
1. SSH access: hostname/IP, port, username
2. [Any other items flagged in intake]

I'll add my SSH public key to your machine to streamline file transfers. 
Please add the following to ~/.ssh/authorized_keys (or I'll walk you through it):

[PASTE PUBLIC KEY]

— Allan
claude@shoogarsoft.com
```

---

## Day 1 — Environment Check

```bash
# Verify Node.js version (need 18+)
ssh rsp-clientname "node --version && npm --version"

# Check disk space (RS needs ~200MB + DB growth)
ssh rsp-clientname "df -h ~"    # Linux
ssh rsp-clientname "Get-PSDrive C | Select-Object Used,Free"  # Windows (PowerShell)

# Confirm target install path
ssh rsp-clientname "ls ~/research-server 2>/dev/null || echo 'Not yet cloned'"
```

### Checklist
- [ ] Node.js 18+ confirmed
- [ ] Sufficient disk space (>1GB free)
- [ ] Git available on client machine
- [ ] Install path agreed (e.g. `~/research-server` on Linux, `C:\research-server` on Windows)

---

## Day 2 — Installation

```bash
# Clone RS (using the private repo — client needs to have access, or use HTTPS with token)
ssh rsp-clientname "git clone https://github.com/shukumei7/research-server.git ~/research-server"
# If private repo: provide deploy key or use HTTPS token

# Install dependencies
ssh rsp-clientname "cd ~/research-server && npm install"

# Copy generated .env to client machine
scp output/env-template.txt rsp-clientname:~/research-server/.env
# Client/Allan fills in real values (credentials collected out-of-band)

# Populate mailboxes (replace <PASSWORD_*> placeholders first)
# Edit setup-mailboxes.sql with real passwords, then:
scp output/setup-mailboxes.sql rsp-clientname:~/research-server/setup-mailboxes.sql
ssh rsp-clientname "sqlite3 ~/research-server/db/jobs.db < ~/research-server/setup-mailboxes.sql && echo 'Mailboxes seeded'"
ssh rsp-clientname "rm ~/research-server/setup-mailboxes.sql"   # clean up — had real passwords
```

### Test IMAP Connection
```bash
# Quick IMAP connectivity test (Node.js one-liner)
ssh rsp-clientname "node -e \"
const { ImapFlow } = require('./node_modules/imapflow');
const c = new ImapFlow({ host: process.env.IMAP_HOST, port: 993, secure: true, auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS }, logger: false });
c.connect().then(() => { console.log('IMAP OK'); return c.logout(); }).catch(e => console.error('IMAP FAILED:', e.message));
\" --env-file ~/research-server/.env"
```

### Checklist
- [ ] RS cloned and `npm install` succeeded
- [ ] `.env` populated with real credentials
- [ ] Mailboxes seeded in DB (`sqlite3 db/jobs.db "SELECT name, imap_user FROM mailboxes"`)
- [ ] IMAP connection test passed for each mailbox
- [ ] Setup SQL file deleted from client machine

---

## Day 3 — Processes + Orchestrator

### Start RS Processes
```bash
# Start all four processes (Linux — background with nohup)
ssh rsp-clientname "cd ~/research-server && nohup node server.js > logs/server.log 2>&1 &"
ssh rsp-clientname "cd ~/research-server && nohup node mcp-server.js > logs/mcp.log 2>&1 &"
ssh rsp-clientname "cd ~/research-server && nohup node orchestrator.js > logs/orchestrator.log 2>&1 &"

# Verify health
ssh rsp-clientname "curl -s http://localhost:9000/health"
ssh rsp-clientname "curl -s http://localhost:9003/health 2>/dev/null || echo 'MCP has no /health — check logs'"
ssh rsp-clientname "curl -s http://localhost:9009/api/projects | python3 -c \"import sys,json; d=json.load(sys.stdin); print('Orchestrator OK:', len(d['data']), 'tasks')\""
```

### Configure Orchestrator
```bash
# Copy and run the generated setup script
scp output/setup-orchestrator.sh rsp-clientname:~/research-server/setup-orchestrator.sh
ssh rsp-clientname "chmod +x ~/research-server/setup-orchestrator.sh && cd ~/research-server && bash setup-orchestrator.sh"
ssh rsp-clientname "rm ~/research-server/setup-orchestrator.sh"  # clean up
```

### Copy Constitution
```bash
# Place constitution.md where Claude sessions will load it
scp output/constitution.md rsp-clientname:~/research-server/code/cowork/constitution.md
```

### Checklist
- [ ] All processes running (health checks pass)
- [ ] Orchestrator tasks registered (`curl .../api/projects`)
- [ ] Mailbox triggers registered (`curl .../api/mailbox-triggers`)
- [ ] Constitution.md in place

---

## Day 4 — Full Flow Test

### Test Email Trigger
```bash
# From Allan's machine: send a test email to the trigger inbox
# (use nodemailer or just send manually from your email client)
# Expected: Claude processes it and replies within ~60 seconds (next poll)

# Watch orchestrator log for the trigger firing
ssh rsp-clientname "tail -f ~/research-server/orchestrator.log | grep -i 'mailboxtrigger\|trigger\|processing'"
```

### Test Memory MCP
```bash
# Verify the MCP server is registered in Claude Code on the client machine
ssh rsp-clientname "claude mcp list 2>/dev/null || echo 'Run: claude mcp add research-memory node /absolute/path/to/mcp-server.js'"

# Quick memory round-trip test
ssh rsp-clientname "node -e \"
// Assumes mcp-server.js is already running on port 9003
const http = require('http');
const data = JSON.stringify({ key: 'delivery-test', content: 'RSP delivery test — Day 4', project: 'default' });
const req = http.request({ hostname: 'localhost', port: 9003, path: '/api/memory', method: 'POST', headers: {'Content-Type':'application/json','Content-Length':data.length} }, r => { let b=''; r.on('data',d=>b+=d); r.on('end',()=>console.log('Memory write:', b)); });
req.write(data); req.end();
\""
```

### Checklist
- [ ] Test email sent from `FROM_FILTER` address
- [ ] Claude processed the email and replied in-thread
- [ ] Memory write/read round-trip passed
- [ ] No errors in orchestrator.log during the test

---

## Day 5 — Auto-Start

The system must survive a reboot. Without this, it's "configured ≠ running."

### Linux (systemd)
Create `/etc/systemd/system/research-server.service` on client machine:
```bash
ssh rsp-clientname "sudo tee /etc/systemd/system/research-server.service > /dev/null << 'EOF'
[Unit]
Description=Research Server
After=network.target

[Service]
Type=forking
User=$(whoami)
WorkingDirectory=$HOME/research-server
EnvironmentFile=$HOME/research-server/.env
ExecStart=/bin/bash -c 'nohup node server.js > logs/server.log 2>&1 & nohup node mcp-server.js > logs/mcp.log 2>&1 & nohup node orchestrator.js > logs/orchestrator.log 2>&1 &'
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable research-server && sudo systemctl start research-server"
```

### Windows (startup VBS)
```bash
# Copy startup script template to client
scp dfy/setup/windows-startup.vbs rsp-clientname:"C:/Users/CLIENT_USER/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/ResearchServer.vbs"
```

Content of `windows-startup.vbs` (create this file in dfy/setup/):
```vbs
Set WShell = CreateObject("WScript.Shell")
WShell.Run "cmd /c cd /d C:\research-server && node server.js", 0, False
WShell.Run "cmd /c cd /d C:\research-server && node mcp-server.js", 0, False
WShell.Run "cmd /c cd /d C:\research-server && node orchestrator.js", 0, False
```

### Test Restart Survival
```bash
# Simulate restart: kill processes, verify auto-restart
ssh rsp-clientname "pkill -f 'node server.js' && pkill -f 'node mcp-server.js' && pkill -f 'node orchestrator.js'"
sleep 15
ssh rsp-clientname "curl -s http://localhost:9000/health"
```

### Checklist
- [ ] Auto-start configured for client OS
- [ ] Restart test: processes came back up within 30 seconds
- [ ] Health checks pass post-restart

---

## Day 6 — Handoff Document

### Capture Software Versions
```bash
ssh rsp-clientname "echo 'Claude Code: ' && claude --version 2>/dev/null || echo 'not installed globally'
echo 'Node.js: ' && node --version
echo 'npm: ' && npm --version
echo 'Delivery date: ' && date +%Y-%m-%d"
```

### Generate Handoff Email (template)
```
Subject: Research Server — Delivery Complete

Hi [Name],

Your Research Server is running. Here's your handoff package.

---

WHAT'S CONFIGURED
[List from constitution.md — projects, mailboxes, tasks]

SOFTWARE VERSIONS AT DELIVERY
- Claude Code CLI: [version]
- Node.js: [version]
- npm: [version]
- Delivery date: [date]

HOW TO RESTART (if processes go down)
Linux: sudo systemctl restart research-server
Windows: Run ResearchServer.vbs from Startup folder, or:
  cd C:\research-server && node server.js

HOW TO ADD A NEW EMAIL TRIGGER
curl -X POST http://localhost:9009/api/mailbox-triggers \
  -H "Content-Type: application/json" \
  -d '{"name":"my-trigger","mailbox":"primary","from_filter":"sender@example.com","prompt_template":"Do X when this email arrives.","cwd":"~/projects/myproject"}'

HEALTH CHECK
curl http://localhost:9000/health      # should return {"status":"ok"}
curl http://localhost:9009/dashboard   # orchestrator dashboard

SUPPORT WINDOW
14 days of written support (questions about this configuration) via claude@shoogarsoft.com.
After that: the optional retainer ($200–400/mo) covers ongoing maintenance.

---

[Attach: constitution.md]
```

### Checklist
- [ ] All versions captured
- [ ] Constitution.md finalized
- [ ] Handoff email drafted

---

## Day 7 — Ship It

- [ ] Handoff email sent with constitution.md attached
- [ ] Retainer offer included (one paragraph, not pushy)
- [ ] Delivery marked complete in Stripe / client records
- [ ] Start 14-day support window clock

---

## 14-Day Support Window

**Scope:** questions about the configuration as delivered. Bugs in the delivery = fix. Client-changed something and it broke = out of scope.

**Response time:** within 48h on business days.

### Common Issues + Pre-Written Responses

**"Orchestrator stopped running"**
```bash
# Diagnose
ssh rsp-clientname "curl -s http://localhost:9009/api/projects 2>/dev/null || echo 'Orchestrator not responding'"
ssh rsp-clientname "tail -50 ~/research-server/orchestrator.log"
# Fix: restart
ssh rsp-clientname "cd ~/research-server && nohup node orchestrator.js > logs/orchestrator.log 2>&1 &"
```
> Response template: "Orchestrator process stopped — restarted it for you. This can happen after system updates or low-memory events. If it keeps stopping, the managed retainer includes uptime monitoring."

**"Not getting morning briefing emails"**
```bash
# Check last run
ssh rsp-clientname "curl -s 'http://localhost:9009/api/projects' | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(p['name'], p['last_run'], p['last_status']) for p in d['data'] if 'briefing' in p['name']]\""
# Check mailbox
ssh rsp-clientname "curl -s http://localhost:9003/api/memory?project=default | head -5"
```

**"I changed my email password"**
```bash
# Update .env then update DB
ssh rsp-clientname "sqlite3 ~/research-server/db/jobs.db \"UPDATE mailboxes SET imap_pass='NEWPASS', smtp_pass='NEWPASS' WHERE name='primary'\""
ssh rsp-clientname "pkill -f 'node orchestrator.js' && cd ~/research-server && nohup node orchestrator.js > logs/orchestrator.log 2>&1 &"
```
> Response template: "Updated the password in the database and restarted the orchestrator. Future password changes: update .env AND the database as above."

**"Claude isn't processing my emails"**
```bash
# Check from_filter
ssh rsp-clientname "curl -s http://localhost:9009/api/mailbox-triggers | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(t['name'], '| from_filter:', t['from_filter']) for t in d['data']]\""
# Check IMAP connectivity
ssh rsp-clientname "tail -20 ~/research-server/orchestrator.log | grep -i 'mailbox\|imap\|trigger'"
```

**"Can I add a new trigger?"** (Out of scope — direct them to do it themselves)
> Response template: "Adding triggers is outside the 14-day scope, but it's a single API call — here's the command: [paste curl command]. If you'd rather have me manage this going forward, the retainer covers it."

**"I want to change the morning briefing"**
```bash
# Update goal via API
ssh rsp-clientname "curl -X PATCH http://localhost:9009/api/projects/morning-briefing -H 'Content-Type: application/json' -d '{\"goal\":\"NEW GOAL HERE\"}'"
```
> Response template: "Updated — will take effect on the next scheduled run. Minor prompt adjustments like this are within the support window."

### Out-of-Scope Responses (polite boundary)
> "That's outside the 14-day support window scope (which covers questions about the configuration as delivered). I'm happy to quote a separate engagement for that, or it's available as part of the managed retainer."

---

## Quick Reference — Ports & Logs

| Service | Port | Log | Health check |
|---------|------|-----|-------------|
| server.js | 9000 | logs/server.log | `curl localhost:9000/health` |
| mcp-server.js | 9003 | logs/mcp.log | (no /health — check process) |
| orchestrator.js | 9009 | logs/orchestrator.log + orchestrator.log | `curl localhost:9009/dashboard` |
| llm-proxy.js | 9001 | logs/llm-proxy.log | (optional, skip if unused) |

```bash
# Check all processes at once
ssh rsp-clientname "ps aux | grep 'node ' | grep -v grep"
# Or on Windows:
ssh rsp-clientname "Get-Process node | Select-Object Id,CPU,WorkingSet"
```
