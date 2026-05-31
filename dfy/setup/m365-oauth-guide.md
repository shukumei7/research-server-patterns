# M365 OAuth2 Setup Guide

Exchange Online deprecated basic auth in October 2022. M365 mailboxes require OAuth2.

---

## What you need from the client's IT admin

The client (or their IT admin) must:

1. **Register an Azure AD application** in their tenant
2. **Grant API permissions** to that app
3. **Provide you** with: `tenant_id`, `client_id`, `client_secret`

---

## Steps for the client's IT admin

### 1. Register the app

1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → New registration
2. Name: `Research Server` (or whatever makes sense)
3. Supported account types: **Accounts in this organizational directory only**
4. Redirect URI: leave blank
5. Click Register

### 2. Create a client secret

1. In the app → Certificates & secrets → New client secret
2. Set expiry to 24 months (or your preferred rotation cycle)
3. **Copy the secret value immediately** — it won't be shown again

### 3. Grant API permissions

1. In the app → API permissions → Add a permission → Microsoft Graph → Application permissions
2. Add: `Mail.ReadWrite`, `Mail.Send`
3. Also add (under APIs my organization uses → Office 365 Exchange Online): `IMAP.AccessAsUser.All`, `SMTP.Send`
4. Click **Grant admin consent for [tenant]**

### 4. Provide to Allan

- **Tenant ID** — Azure AD → Overview → Tenant ID
- **Client ID** — App registrations → your app → Application (client) ID
- **Client secret** — the value from step 2
- **Mailbox address** — the email address to connect

---

## Token refresh (RS email.js gap)

The current RS `email.js` expects plaintext `imap_pass` in the mailboxes table. M365 OAuth2 requires an access token (expires hourly) fetched via:

```
POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
  grant_type=client_credentials
  client_id={client_id}
  client_secret={client_secret}
  scope=https://outlook.office365.com/.default
```

**This token refresh is not yet implemented in RS `email.js`.** Until it is:

- M365 mailboxes cannot be added to the DB the standard way
- Workaround: run `setup-m365-token.js` (see below) to fetch an initial token and store it; the token lasts 1 hour and will expire

**Required before M365 goes live:** Add a token-refresh wrapper to `email.js` that auto-fetches a new token when the current one expires, using the stored client credentials. Estimated: 2-3 hours of RS dev work.

---

## setup-m365-token.js (manual workaround until email.js is patched)

Run this to fetch a token and add the mailbox manually. Token expires in 1 hour.

```js
// node setup-m365-token.js
import https from 'https';
import { URLSearchParams } from 'url';

const TENANT_ID     = process.env.M365_TENANT_ID;
const CLIENT_ID     = process.env.M365_CLIENT_ID;
const CLIENT_SECRET = process.env.M365_CLIENT_SECRET;
const MAILBOX_USER  = process.env.M365_MAILBOX_USER;  // jane@company.com
const RS_API        = 'http://localhost:9003';

const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  scope: 'https://outlook.office365.com/.default'
}).toString();

const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
const data = await resp.json();

if (!data.access_token) {
  console.error('Token fetch failed:', data);
  process.exit(1);
}

console.log('Token fetched. Expires in:', data.expires_in, 'seconds');

// Add mailbox with token as password (ImapFlow OAuth2 uses accessToken field)
const addResp = await fetch(`${RS_API}/api/mailboxes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'work-m365',
    label: 'Work (M365)',
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_user: MAILBOX_USER,
    imap_pass: data.access_token,   // temporary — token expires hourly
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_user: MAILBOX_USER,
    smtp_pass: data.access_token,
    description: 'M365 OAuth2 — token expires hourly, needs manual refresh until email.js is patched'
  })
});
console.log(await addResp.json());
```

---

## Timeline expectation for DFY clients

| Scenario | Setup complexity | Notes |
|----------|-----------------|-------|
| Standard IMAP (Hostinger, Namecheap, cPanel) | Low | Username + password, done |
| Gmail with app password | Low | Enable 2FA → generate app password → done |
| Gmail with OAuth2 | Medium | Google Cloud Console app registration |
| M365 (Exchange Online) | High | IT admin required, token refresh gap |
| M365 with IT admin co-operation | Medium | Admin does steps 1-3 above, Allan does rest |

For DFY clients on M365: budget an extra day and confirm the client has IT admin access before committing to the 1-week timeline.
