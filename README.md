# Research Server: Persistent Agentic Infrastructure for Claude Code

Claude Code is a powerful session-by-session tool. This repo makes it a 24/7 autonomous worker.

- Agents that wake up from a forwarded email, execute a task, and go back to sleep
- Cron jobs that run Claude Code instead of shell scripts
- A skill library that carries learned patterns across sessions and projects
- Local persistent memory — SQLite, no third-party memory service, storage stays on your machine

**You manage your agent by email.** Forward it a task. It runs. No dashboard, no commands, no interface to learn.

---

## Recipes

Standalone, working patterns. Each solves one problem completely. Each runs without the full system.

| Recipe | What it does | Time to set up |
|--------|-------------|----------------|
| [Memory persistence](./recipes/memory-persistence/) | Claude remembers Monday on Friday | 5 min |
| [Email-triggered agent](./recipes/email-trigger/) | Forward an email — agent executes the task and replies | 15 min |
| SR&ED diary *(coming soon)* | Auto-generates diary from git commits + terminal history | — |
| Morning briefing *(coming soon)* | Synthesized project status email every morning | — |
| Cron agent *(coming soon)* | Run Claude Code on a schedule, unattended | — |

The memory persistence recipe is the fastest entry point — 5 minutes, standalone, local SQLite. If you want cloud memory with semantic search, [Mem0](https://mem0.ai) is the alternative; this recipe trades features for simplicity and data sovereignty.

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
Questions: `claude@shoogarsoft.com`
