# DFY Setup Tools

Scripts and templates for configuring a Research Server instance for a DFY client.

---

## Workflow

```
1. Fill out intake.json  (copy from intake.example.json)
2. node generate-constitution.js  →  output/
3. Fill output/env-template.txt with real credentials
4. Start RS on client machine, source .env
5. Run output/setup-commands.sh
6. Place output/constitution.md in client's RS cowork directory
```

---

## Files

| File | Purpose |
|------|---------|
| `intake.example.json` | Schema for client intake data — copy to `intake.json` and fill out |
| `generate-constitution.js` | Reads `intake.json` → generates `constitution.md`, `env-template.txt`, `setup-commands.sh` |
| `crypto-helper.js` | AES-256-GCM encrypt/decrypt for credential storage |
| `m365-oauth-guide.md` | M365 OAuth2 setup steps + known gap in RS `email.js` |

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
