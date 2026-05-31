# DFY Setup Tools

Scripts and templates for configuring a Research Server instance for a DFY client.

---

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

---

## Files

| File | Purpose |
|------|---------|
| `DELIVERY-WORKFLOW.md` | Full 7-day delivery runbook + 14-day support window with exact commands |
| `INTAKE-QUESTIONNAIRE.md` | Human-readable questionnaire to send client after payment — maps to intake.json |
| `intake.example.json` | Machine-readable schema — fill from questionnaire responses to run the generator |
| `generate-constitution.js` | Reads `intake.json` → generates `constitution.md`, `env-template.txt`, `setup-mailboxes.sql`, `setup-orchestrator.sh` |
| `crypto-helper.js` | AES-256-GCM encrypt/decrypt for credential storage |
| `m365-oauth-guide.md` | M365 OAuth2 setup steps + known gap in RS `email.js` |
| `windows-startup.vbs` | Windows startup script template — drop in Startup folder, set RS_PATH |

---

## Credential security

Passwords are never stored in `intake.json` or `constitution.md`. They are:

1. Referenced by env var name in `intake.json` (e.g. `"password_env": "MAILBOX_PRIMARY_PASS"`)
2. Listed as blank entries in `env-template.txt`
3. Collected out-of-band from the client (secure channel — Signal, 1Password share, etc.)
4. Stored in the client's `.env` file on their machine only

To encrypt a credential for safe transmission:

```bash
# Generate a master key (do once, save in your own password manager)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encrypt a password
RS_MASTER_KEY=<key> node crypto-helper.js encrypt "the-password"

# Decrypt it at the destination
RS_MASTER_KEY=<key> node crypto-helper.js decrypt "iv:tag:ciphertext"
```

---

## M365 mailboxes

M365 (Exchange Online) requires OAuth2 — basic auth is dead. Read `m365-oauth-guide.md` **before** starting setup for any client on M365. The client's IT admin must register an Azure AD app. Budget an extra day.

---

## .gitignore note

`intake.json` and `output/` are gitignored — they contain client PII. Never commit them.
