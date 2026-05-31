# Research Server: Persistent Agentic Infrastructure for Claude Code

Claude Code is a powerful session-by-session tool. This repo makes it a 24/7 autonomous worker.

- Sessions that remember what happened last week — no re-explaining
- Agents that wake up from a forwarded email, execute a task, and go back to sleep
- Cron jobs that run Claude Code instead of shell scripts
- A skill library that carries learned patterns across sessions and projects

**You manage your agent by email.** Forward it a task. It runs. No dashboard, no commands, no interface to learn.

---

## Recipes

Standalone, working patterns. Each solves one problem completely. Each runs without the full system.

| Recipe | What it does | Time to set up |
|--------|-------------|----------------|
| [Memory persistence](./recipes/memory-persistence/) | Claude remembers Monday on Friday | 5 min |
| Email-triggered agent *(coming soon)* | Forward an email — agent executes the task | — |
| SR&ED diary *(coming soon)* | Auto-generates diary from git commits + terminal history | — |
| Morning briefing *(coming soon)* | Synthesized project status email every morning | — |
| Cron agent *(coming soon)* | Run Claude Code on a schedule, unattended | — |

Start with [Memory persistence](./recipes/memory-persistence/) — it works standalone in 5 minutes and is the foundation everything else builds on.

---

## Architecture

Four Node.js processes, each with one responsibility:

```
mcp-server.js   (port 9003)  — MCP tools: memory, skills, email, calendar, contacts
orchestrator.js (port 9009)  — Cron scheduler + email trigger → Claude Code agent
server.js       (port 9000)  — Admin UI, terminal, SpecKit dev workflow
llm-proxy.js    (port 9001)  — OpenAI-compatible LLM proxy (routes to Claude or Gemini)
```

The recipes in this repo are standalone extractions of the patterns — run them independently, or assemble them into the full system.

The full system has been running unattended across four active businesses for months. Every recipe in this repo is a pattern extracted from production.

---

## Done-for-you setup

Don't want to configure it yourself? Get the full system configured on your hardware or VPS — accounts wired, workflows running, first month of tasks scheduled.

**[$2,500 flat — async, no calls required →](./dfy/)**

---

## Built by

Shoogar Soft Inc. — Edmonton, Canada.  
Questions: forward them to `claude@shoogarsoft.com`. The agent reads it.
