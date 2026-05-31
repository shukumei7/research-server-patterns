# Research Server — Detailed Intake Questionnaire

**Tally form (send this link):** https://tally.so/r/lbvKpv

**Send after payment clears. Client fills it out async — no call required.**
**Collect credentials (passwords, SSH keys) separately via a secure channel (see bottom).**

*The markdown below mirrors the Tally form for reference. The live form is the source of truth.*

---

## How to use this

Email this questionnaire to the client with subject:
`Research Server — Setup Questionnaire (please complete before [DATE+3])`

Tell them: "Fill in what you know — leave anything blank and I'll follow up. No wrong answers."

---

## Section 1 — Identity

| Question | Answer |
|----------|--------|
| Full name | |
| Business name | |
| What does your business do? (1–2 sentences) | |
| Primary email address | |
| Timezone | |
| Preferred email for Claude to send FROM (e.g. `claude@yourdomain.com`) | |

---

## Section 2 — Hosting

| Question | Answer |
|----------|--------|
| **Target machine:** Windows 10/11 machine OR Linux VPS? | |
| **Hostname or IP address** of the machine | |
| **SSH username** (the account Claude will run under) | |
| **SSH port** (usually 22) | |
| **Node.js installed?** (`node --version` on the target machine) | |
| **Install path** — where should RS live? (e.g. `~/research-server` or `C:\research-server`) | |

*Note: SSH password or private key collected separately via secure channel.*

---

## Section 3 — Projects

List the projects you want RS to know about. These go into memory and scheduled tasks.

| Project name | Code path on your machine | Description (1 sentence) | Status |
|-------------|--------------------------|--------------------------|--------|
| | | | active / paused |
| | | | active / paused |
| | | | active / paused |

**GitHub repos** (if applicable — used for SR&ED diary):

| Project | GitHub org/repo |
|---------|----------------|
| | |

---

## Section 4 — Mailboxes

RS needs at least one mailbox connected. Add one row per email account.

| Label | Email address | IMAP host | IMAP port | SMTP host | SMTP port | Auth type | Primary? |
|-------|--------------|-----------|-----------|-----------|-----------|-----------|----------|
| | | | 993 | | 587 | basic / gmail-app-password / M365-oauth2 | yes / no |
| | | | 993 | | 587 | basic / gmail-app-password / M365-oauth2 | yes / no |

**Auth type guide:**
- `basic` — standard username + password (Hostinger, cPanel, Namecheap, custom domains)
- `gmail-app-password` — Gmail with 2FA enabled → generate an app password in Google Account settings
- `M365-oauth2` — Microsoft 365 / Exchange Online. Requires Azure AD app registration. Note: adds 1–2 extra days to setup.

*Note: Passwords and app passwords collected separately via secure channel.*

---

## Section 5 — Agent Email Triggers

These are the automations that run when you forward or send an email.

**Example already configured:** Forward an instruction to `claude@yourdomain.com` → Claude executes it and replies.

| Trigger name | Mailbox to watch | Only process emails from this sender | What should Claude do? (describe the task) | Working directory |
|-------------|-----------------|--------------------------------------|---------------------------------------------|-------------------|
| | | | | |
| | | | | |

**Common setups people ask for:**
- [ ] "Forward me instructions and Claude executes them" (default — already in scope)
- [ ] "Forward support emails and Claude drafts a reply for me to review"
- [ ] "Forward invoices and Claude logs them somewhere"
- [ ] Other: ___

---

## Section 6 — Scheduled Tasks

These run automatically on a schedule (like cron jobs that use Claude).

| Task name | When should it run? | What should Claude do? |
|-----------|---------------------|------------------------|
| Morning briefing | Daily at 8am | Summarise project status and top 3 priorities for today → email to primary inbox |
| SR&ED diary | Weekly on Fridays | Generate a SR&ED diary entry from git activity → save to project directory |
| (add your own) | | |

**SR&ED diary:** Only relevant if you do R&D work that may qualify for CRA SR&ED tax credits. Do you have eligible R&D? Yes / No / Not sure

---

## Section 7 — Integrations

| Integration | Do you use it? | Details |
|-------------|---------------|---------|
| GitHub | Yes / No | Org name: |
| Claude.ai Pro subscription | **Required** — Yes / No | Needed for orchestrator tasks to run. See [claude.com/pricing](https://claude.com/pricing) |
| Other accounts to connect (up to 5 total) | | |

---

## Section 8 — Preferences

| Question | Answer |
|----------|--------|
| Communication style for Claude's emails (formal / direct / casual) | |
| What should Claude escalate to you rather than handle autonomously? | |
| What is Claude allowed to do autonomously without asking? | |
| Any topics, projects, or actions Claude should never touch? | |

---

## Credentials — Collected Separately

**Do not include passwords or keys in this form or by email.**

After you return this questionnaire, I'll share a secure method to provide:
- Email account passwords or app passwords (one per mailbox)
- SSH password or public key for the target machine
- Any API tokens (GitHub, etc.)

Options: 1Password share link, Signal message, or I'll add my SSH public key to your machine and you just confirm.

---

## Checklist Before Submitting

- [ ] Section 1 filled (identity + agent email address)
- [ ] Section 2 filled (hosting target, hostname, SSH username)
- [ ] At least one mailbox in Section 4
- [ ] Section 7 — Claude.ai Pro subscription confirmed
- [ ] Anything unclear → just leave it blank and note your question

---

*Return to: claude@shoogarsoft.com*
*Questions? Same address — I'll reply within 24h.*
