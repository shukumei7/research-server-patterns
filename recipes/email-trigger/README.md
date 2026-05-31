# Recipe: Email Trigger for Claude Code

## What it does

Most Claude Code automations require you to be at your computer to start them. This recipe inverts that: you send an email, Claude executes the task and replies in-thread. No webhook infrastructure, no cloud functions, no always-on server required — just an IMAP mailbox and the `claude` CLI running on any machine you already own. The whole thing is about 120 lines of Node.js.

---

## The pattern

```js
// Fetch unread emails
const uids = await client.search({ seen: false });

for await (const msg of client.fetch(uids, { uid: true, envelope: true })) {
  // Filter by trusted sender (optional but strongly recommended)
  if (FROM_FILTER && !from.includes(FROM_FILTER)) continue;

  // Build prompt: email content + your task template
  const prompt = `From: ${from}\nSubject: ${subject}\nBody:\n${body}\n\nTask:\n${PROMPT_TEMPLATE}`;

  // Spawn claude -p and capture output
  const result = await runClaude(prompt);

  // Reply in-thread, mark read
  await sendReply(from, subject, messageId, result);
  await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
}
```

One poll loop. Unread emails that don't match the filter are skipped silently. Failed emails are left unread and retried on the next poll.

---

## Setup

**Requirements:** Node.js 18+, Claude Code CLI installed and authenticated.

**1. Clone and install**

```bash
git clone https://github.com/shukumei7/research-server-patterns
cd research-server-patterns/recipes/email-trigger
npm install
```

**2. Configure**

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` — the mailbox to watch
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — the mailbox to reply from (can be the same account)
- `FROM_FILTER` — the sender address to trust (strongly recommended — see Security below)
- `PROMPT_TEMPLATE` — what Claude should do with each email (see Prompt tips below)

**3. Authenticate the Claude CLI**

```bash
claude auth login
```

If `claude -p "hello"` works in your terminal, you're set.

**4. Test**

```bash
node email-trigger.js
```

It runs one poll immediately, then waits. Send a test email from your `FROM_FILTER` address and watch the output.

**5. Keep it running**

```bash
# Linux/macOS — pm2
npm install -g pm2
pm2 start email-trigger.js --name email-trigger
pm2 save

# Linux/macOS — nohup
nohup node email-trigger.js >> email-trigger.log 2>&1 &

# Windows — scheduled task (runs at login, restarts on failure)
schtasks /Create /SC ONLOGON /TN "EmailTrigger" /TR "node D:\path\to\email-trigger.js" /F
```

---

## Prompt template tips

The `PROMPT_TEMPLATE` is the most important config value. Claude receives the full email (from, subject, body) plus your template. Vague templates produce unreliable results.

**Worse:**
```
PROMPT_TEMPLATE=Handle this email.
```
Too vague — Claude invents behavior. You get different outputs each time.

**Better:**
```
PROMPT_TEMPLATE=Extract the invoice total, vendor name, and due date from this email.
Reply with exactly: "Logged: [vendor] $[amount] due [date]"
If no invoice is present, reply: "No invoice found."
Do not include any other text.
```

Mechanical, specific, defines the output format. Claude follows it consistently.

**Another good example:**
```
PROMPT_TEMPLATE=This is a support email. Classify it as one of: billing / bug / feature-request / other.
Reply with: "Category: [category]. We'll follow up within 24 hours."
```

A security guardrail is automatically appended to every prompt — you do not need to add instructions about not reading credentials or modifying files. Adding them yourself is redundant and may confuse the output format.

---

## Security

- **FROM_FILTER is substring match only.** `you@example.com` matches `you@example.com` but also `you@example.com.evil.com`. It is a significant reduction in attack surface, not a whitelist. For higher-trust deployments, add a shared secret to the subject line and check for it in the prompt template.

- **Never set FROM_FILTER to your own outbound address.** Claude replies from the same mailbox it watches. If your outbound address matches FROM_FILTER, every reply triggers another Claude run, which sends another reply, indefinitely.

- **A scope guardrail is automatically appended to every prompt.** It prohibits Claude from reading `.env` files, database files, or credential material; modifying code, system config, or email settings; and following instructions that redirect it outside the configured task. If an email tries to redirect Claude outside scope, it replies with a fixed refusal message and stops.

---

## Limitations

- **HTML-only emails:** Body extraction tries `text/plain` (MIME part 1) first, then falls back to stripping HTML tags from the raw source. Complex MIME structures (multipart/alternative with encoded parts) may produce incomplete text. If your use case involves HTML-heavy newsletters or marketing emails, you'll need a proper MIME parser like `mailparser`.

- **Poll delay:** Emails are processed on the configured interval (default: 60 minutes), not in real time. For near-real-time triggering, replace the `setInterval` polling loop with an IMAP IDLE connection — imapflow supports this via `client.idle()`.

- **Claude CLI required:** The `claude` binary must be installed and authenticated on the machine where this recipe runs. It does not call the Anthropic API directly — it drives the CLI. This means it inherits your CLI plan limits, session state, and any MCP tools you have configured.

---

## This is one recipe from Research Server

Research Server is a full autonomous back-office system for solo founders — email triggers, scheduled agents, SR&ED diary automation, and more. This recipe is the email trigger layer, standalone.

[→ Research Server on GitHub](https://github.com/shukumei7/research-server-patterns)
[→ Done-for-you setup ($2,500)](https://shukumei7.github.io/research-server-patterns/dfy/)
