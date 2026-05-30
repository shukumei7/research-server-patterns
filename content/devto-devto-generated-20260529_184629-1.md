# I Forward Invoices to Claude. It Enters Them in Wave Accounting.

There's a version of "AI agent" that gets a lot of press: the one that runs autonomously, has a dashboard, requires a cloud subscription, and does things you didn't ask it to do.

That's not what I built.

What I built is simpler: an IMAP poller that watches a mailbox, spots qualifying emails, spawns a `claude -p` subprocess with the email body, and replies with the result. The whole thing is maybe 80 lines of Node.js. It has no dashboard. It doesn't run unless email arrives. It does exactly what you describe in a prompt template — nothing more.

The concrete use case that made this click for me: accounting. My bookkeeper asked me to forward supplier invoices so she could enter them in Wave. I started doing it manually, got bored after three invoices, and realized the workflow was completely mechanical. Fetch PDF, open Wave, enter vendor, amount, date, category, save. There's no judgment involved — just extraction and form-filling.

So I wrote a prompt template. Claude gets the forwarded email, opens Wave via browser automation, enters the invoice, and replies confirming it's done. I haven't thought about invoice entry since.

## The Pattern

The core loop looks like this:

```js
async function pollMailbox(trigger) {
  const messages = await email.fetchMessages(mailboxConfig, { unread: true });

  for (const msg of messages) {
    if (trigger.from_filter && !msg.from.includes(trigger.from_filter)) continue;

    const prompt = trigger.prompt_template + '\n\n' + msg.text;
    const result = await spawnClaude(prompt, trigger.cwd);

    await email.markRead(mailboxConfig, msg.uid);
    await email.reply(mailboxConfig, msg.uid, result);
  }
}
```

`spawnClaude` is just `claude -p "${prompt}"` wrapped in a child process with a timeout. The output becomes the reply body. If it fails, the email stays unread and retries next poll.

What makes this composable is that each trigger is a database row: a mailbox name, an optional sender filter, a prompt template, and a working directory. Adding a new automated workflow is an API call, not a code change.

```bash
curl -X POST http://localhost:9009/api/mailbox-triggers \
  -d '{"name":"invoice-entry","mailbox":"accounting","from_filter":"allbate@gmail.com","prompt_template":"You have received a forwarded invoice. Open Wave at wave.com, log in, and enter the invoice details. Reply confirming entry with vendor, amount, and date."}'
```

## Why Email, Not a Webhook or Cron?

I thought about webhooks. The problem is that most of my triggers are things I decide to do in the moment, from my phone, while away from my desk. Email is the interface I already have open. Forwarding a message is one tap. Setting up a webhook integration every time I want a new trigger is not.

Email also provides a natural audit trail. Every automated action has a corresponding sent reply in the thread. If something goes wrong, I have the original message, the prompt it generated, and the result — all in one place, without any additional logging infrastructure.

Cron has its place for scheduled work, but it's the wrong model for "I just received something and want a response." Email handles that better because the trigger is the event.

## What Claude Actually Gets

The subprocess call uses `claude -p` (print mode) with `--allowedTools` scoped to what the task needs. For browser automation tasks, that includes Playwright MCP. For code tasks, it includes filesystem access to a sandboxed directory.

The prompt template is the main thing that needs to be right. I've found that concrete, procedural prompts work better than abstract goal statements for these tasks:

**Worse:** "Help manage my accounting workflow."

**Better:** "You will receive a forwarded email containing a supplier invoice. Extract: vendor name, invoice number, total amount, due date. Then open Wave Accounting at app.waveapps.com, navigate to Accounting > Transactions, and create a new bill with these details. Reply with: 'Entered: [vendor] [amount] [invoice number]' or 'Failed: [reason]'."

The more mechanical the task, the more explicit you should be. Claude is good at judgment calls — you don't need to harness that for deterministic workflows. Save the ambiguity budget for tasks that actually need it.

## Limitations Worth Knowing

Browser automation is fragile. Wave's HTML changes occasionally and the selectors break. I've had to update the prompt about three times in six months. For a high-volume workflow this would be frustrating; for my volume (a few invoices a week) it's fine.

The IMAP polling approach means there's a delay — my poller runs hourly, so a forwarded invoice gets processed within the hour. If you need near-real-time response, you'd want IMAP IDLE instead of polling. That's a meaningful architecture change but not a hard one.

Email authentication adds a surface area. I filter by sender, but that's not cryptographic verification. For workflows where the email content could be adversarially constructed (anything public-facing), you need to think harder about prompt injection. My triggers all filter to my own email address, so the attack surface is just my own inbox.

## Where This Lives in My Setup

This pattern is part of [Research Server](https://shukumei7.github.io/research-server-patterns/), which is the infrastructure I built to run these kinds of autonomous workflows on my local machine. The mailbox trigger system is one layer of it — there's also a persistent memory layer (the MCP SQLite server), a cron scheduler for proactive tasks, and an SR&ED diary automator that's saved me significant time at tax season.

The memory piece was the first problem I solved. Email triggers came second, once I realized that the useful question isn't "how do I make Claude remember context" but "how do I make Claude wake up and act, without me being present?"

The full setup involves more moving parts than most people want to run themselves, which is why there's a done-for-you option. But the email trigger pattern specifically is something you can implement independently. The three pieces are: an IMAP client (I use [ImapFlow](https://imapflow.com/)), a subprocess wrapper around `claude -p`, and a database table to configure triggers without redeploying. You can have a working prototype in an afternoon.

The accounting use case is a toy by enterprise standards. But it runs every week without me thinking about it, and that's the bar I was actually trying to hit.
