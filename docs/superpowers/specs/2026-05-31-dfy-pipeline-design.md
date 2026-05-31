# DFY Pipeline Design
**Date:** 2026-05-31
**Status:** Approved for implementation
**Scope:** Phase 1 — email-driven sales → close → setup → support pipeline

---

## Context

Research Server Patterns (RSP) offers a $2,500 CAD done-for-you (DFY) setup service. Currently all pipeline stages are manual. This spec defines a Claude-handled pipeline that drafts every action and gates execution on Allan's email approval.

The pipeline does NOT require changes to RS core. It runs on the existing orchestrator and RS server, with a new `rsc/` module mounted on the existing stack.

---

## Architecture

```
Inbound email (claude@shoogarsoft.com)
  → orchestrator mailbox triggers
    → rsc/scripts/ (generate-constitution, crypto-helper)
    → rsc/db/clients.db (pipeline state)
    → draft action → approval email to Allan
      → Allan replies APPROVE
        → dfy-approve trigger fires → executes staged action → advances stage
```

`rsc/` is a module in the RSP repo, **not** a separate process. Its routes mount on RS `server.js` at `/rsc/*`. Its DB is `db/clients.db` (separate file from `jobs.db`, same directory).

**No new ports. No new startup entries.**

---

## Pipeline Stages

```
INQUIRY           Email to claude@shoogarsoft.com asking about DFY
INTAKE_RECEIVED   Tally Y5kO9q submitted — name, email, hosting target, goal
PAYMENT_PENDING   Acknowledgment sent, payment link provided
PAYMENT_CLEARED   Stripe confirms payment (manual check initially)
QUESTIONNAIRE_SENT  Setup questionnaire link (lbvKpv) sent to client
QUESTIONNAIRE_RX  Tally lbvKpv submitted — full 81-field config data
SETUP_STAGED      Constitution generated, delivery steps prepared, awaiting approval
SETUP_IN_PROGRESS Allan approved — delivery underway
DELIVERED         Handoff email sent, 14-day support window starts
SUPPORT           14-day window — client emails handled by dfy-support trigger
RETAINER_OFFERED  Day 14 — retainer offer sent
CLOSED            No retainer taken; engagement complete
RETAINER          Client signed retainer; ongoing
```

Stage transitions only happen after Allan approves via email reply.

---

## DB Schema — `db/clients.db`

```sql
CREATE TABLE clients (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  business_name  TEXT,
  stage          TEXT NOT NULL DEFAULT 'INQUIRY',
  intake_data    TEXT,            -- JSON from Tally Y5kO9q notification
  questionnaire_data TEXT,        -- JSON from Tally lbvKpv notification
  stripe_intent  TEXT,
  notes          TEXT,
  delivered_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE client_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  event_type  TEXT NOT NULL,   -- stage_change, email_sent, approved, error
  data        TEXT,            -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE staged_actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id),
  action_type  TEXT NOT NULL,   -- reply_inquiry, send_questionnaire, send_handoff, etc.
  draft_body   TEXT NOT NULL,   -- the email/action Claude drafted
  to_email     TEXT,
  subject      TEXT,
  status       TEXT DEFAULT 'pending',  -- pending, approved, executed, rejected
  approved_at  TEXT,
  executed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## RSC Routes — mounted on RS at `/rsc/*`

```
GET  /rsc/admin               — pipeline dashboard (Allan only, tailscaleAuth)
GET  /rsc/api/clients         — list all clients with stage
GET  /rsc/api/clients/:id     — client detail + events + staged actions
POST /rsc/api/clients/:id/stage  — advance stage (body: { stage })
GET  /rsc/api/staged          — list pending approvals
POST /rsc/api/staged/:id/approve  — mark approved (also fired by email trigger)
POST /rsc/api/staged/:id/reject   — mark rejected
```

All routes protected by `tailscaleAuth` (localhost + Tailscale IPs only).

---

## Orchestrator Tasks

### `dfy-inquiry`
**Type:** Mailbox trigger  
**Mailbox:** `claude` (claude@shoogarsoft.com)  
**From filter:** none — but prompt skips emails from `noreply@tally.so` (handled by dfy-intake), `allbate@gmail.com` (handled by dfy-approve), and `no-reply@stripe.com`  
**Prompt template:**
```
You have received an inbound email about the Research Server DFY service.

STEP 1 — Classify:
- "sales": asking about what's included, pricing, timeline, how it works
- "support": existing client with a problem (check clients DB for their email)
- "intake": this appears to be a Tally form notification (handle via dfy-intake instead)
- "junk": spam, irrelevant

STEP 2 — If "sales": draft a helpful reply covering what they asked. Include the intake form link (https://tally.so/r/Y5kO9q) and DFY page (https://rsp.shoogarsoft.com/dfy/). Keep it under 150 words, direct tone, no pleasantries.

STEP 3 — If "support": look up the client in /rsc/api/clients by email. Draft a response based on their stage and the issue described.

STEP 4 — Create a staged action via POST /rsc/api/clients or update existing: save the draft reply with action_type=reply_inquiry.

STEP 5 — Email allbate@gmail.com via shoogarsoft-claude mailbox:
Subject: "DFY Action Needed — [sender email]"
Body: classification, sender's question, your draft reply. End with: "Reply APPROVE to send, or reply with edits."

Do NOT send any email to the prospect until APPROVE is received.
```

---

### `dfy-intake`
**Type:** Mailbox trigger  
**Mailbox:** `claude` (or a dedicated `dfy` mailbox)  
**From filter:** `tally.so` (Tally notification emails come from noreply@tally.so)  
**Prompt template:**
```
You have received a Tally form submission notification.

STEP 1 — Identify which form:
- "Research Server — Done-For-You Intake" (Y5kO9q) → initial intake
- "Research Server — Setup Questionnaire" (lbvKpv) → detailed setup data

STEP 2 — Parse the email body. Extract all field names and values into a JSON object.

STEP 3 — Look up the client by email in GET /rsc/api/clients.
- If intake form: create client record via POST /rsc/api/clients with intake_data=parsed JSON, stage=INTAKE_RECEIVED
- If questionnaire: update existing client questionnaire_data, advance stage to QUESTIONNAIRE_RX. Run node rsc/scripts/generate-constitution.js to generate constitution draft.

STEP 4 — Draft the appropriate next action:
- Intake: acknowledgment email to client + Stripe payment link (https://buy.stripe.com/bJeeV50Jy67l0G43zDbbG00) + questionnaire link to follow after payment
- Questionnaire: "Setup questionnaire received. Constitution generated. Ready to schedule delivery when you've confirmed availability."

STEP 5 — Create staged_action, email allbate@gmail.com:
Subject: "DFY Intake — [client name] — [form name]"
Body: client summary, parsed data highlights, draft next action. "Reply APPROVE to send."
```

---

### `dfy-approve`
**Type:** Mailbox trigger  
**Mailbox:** `claude` (claude@shoogarsoft.com — where Allan's reply lands)  
**From filter:** `allbate@gmail.com`  
**Conflict note:** `claude-instructions` trigger also watches this mailbox from the same sender. Disambiguate by subject: DFY approval emails always have subject starting with `"DFY Action Needed —"`. Each trigger's prompt checks subject and exits cleanly if it doesn't match its pattern.

**Prompt template:**
```
You have received an email from Allan.

STEP 0 — Check subject line. If subject does NOT start with "Re: DFY" or "DFY", this is not a DFY approval reply. Stop immediately and do nothing.

STEP 1 — Find the pending staged_action this reply is in response to. Match by In-Reply-To header or by scanning recent pending staged_actions.

STEP 2 — Parse Allan's reply:
- Contains "APPROVE" or "yes" or "send it" → approve and execute
- Contains edits/corrections → update the draft, re-stage, email Allan the revised draft for re-approval
- Contains "reject" or "no" or "cancel" → mark rejected, note reason

STEP 3 — If approved: execute the staged action.
- reply_inquiry / send_questionnaire / send_handoff → send email to client via primary mailbox
- stage_advance → call POST /rsc/api/clients/:id/stage
- Mark staged_action as executed, log event.

STEP 4 — Log the event and confirm to Allan:
"Executed: [action summary]. Client is now at stage [STAGE]."
```

---

### `dfy-pipeline-monitor`
**Type:** Orchestrator cron task  
**Schedule:** `0 9 * * 1` (Mondays 9am)  
**Goal:**
```
Review the DFY client pipeline.

STEP 1 — GET /rsc/api/clients. List all clients by stage.

STEP 2 — Flag stalled clients:
- INTAKE_RECEIVED > 48h, no payment: draft follow-up email
- QUESTIONNAIRE_SENT > 72h, not returned: draft reminder
- DELIVERED > 14 days: draft retainer offer
- SUPPORT stage clients with no activity > 7 days: note

STEP 3 — For each flagged client, create a staged_action.

STEP 4 — Email allbate@gmail.com summary:
Subject: "DFY Pipeline — [N] clients — [date]"
- Active clients by stage
- Stalled clients needing action
- Pending approvals count
"Reply APPROVE [client email] to send the follow-up for that client."
```

---

## RSC Scripts

### `rsc/scripts/generate-constitution.js`
Moved from `dfy/setup/generate-constitution.js`. No functional changes. Called by `dfy-intake` trigger when questionnaire is received.

### `rsc/scripts/crypto-helper.js`
Moved from `dfy/setup/crypto-helper.js`. No functional changes. Used for any encrypted data handling.

### `rsc/scripts/parse-tally-email.js` (new)
Parses a Tally notification email body into a structured JSON object. Input: raw email text. Output: `{ form_name, fields: { key: value } }`. Called by `dfy-intake` trigger prompt.

---

## RSP Repo Changes

### Files moving from `dfy/setup/` to `rsc/scripts/`
- `generate-constitution.js`
- `crypto-helper.js`
- `intake.example.json`

### Files staying in `dfy/setup/` (client-facing reference)
- `windows-startup.vbs`
- `m365-oauth-guide.md`
- `DELIVERY-WORKFLOW.md`
- `INTAKE-QUESTIONNAIRE.md`
- `README.md` (updated to reference rsc/)

### New files
- `rsc/routes/rsc.js` — Express routes for pipeline API and admin dashboard
- `rsc/db/schema.sql` — clients.db schema
- `rsc/scripts/parse-tally-email.js`
- `rsc/scripts/generate-constitution.js` (moved)
- `rsc/scripts/crypto-helper.js` (moved)

### RS `server.js` change
Add one line: `app.use('/rsc', require('./rsc/routes/rsc'))`

---

## Approval Gate Flow

```
1. Claude identifies required action (draft reply, advance stage, send email)
2. Claude creates staged_action record (status: pending)
3. Claude emails allbate@gmail.com: draft + "Reply APPROVE to execute"
4. Allan replies APPROVE (or with edits)
5. dfy-approve trigger fires:
   - If APPROVE → execute action, advance stage, confirm to Allan
   - If edits → revise draft, re-stage, re-notify Allan
   - If reject → mark rejected, log
```

Nothing is sent to a client without Allan's explicit approval.

---

## Out of Scope (Phase 1)

- Credential form (deferred to RS core cleanup — local dashboard)
- Stripe webhook integration (manual payment check initially)
- Automated SSH execution (Allan runs delivery steps manually)
- `assistant.js` deprecation (RS core brainstorm)
- RS public distribution / submodule

---

## RS Core Notes (for next brainstorm)

- Deprecate `assistant.js` — all tasks migrate to orchestrator cron pattern
- Local mailbox management dashboard in RS admin — clients enter own credentials locally, never transmitted
- Parameterize hardcodes (morning-briefing task name, shoogarsoft-claude mailbox) → env vars or DB config
- Public RS distribution via git submodule strategy
- Credential submission form as local RS admin feature (not RSC)
- CLAUDE.md deployable template with placeholder injection from generate-constitution.js
