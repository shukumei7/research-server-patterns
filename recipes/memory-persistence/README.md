# Recipe: Memory Persistence for Claude Code

**The problem:** You explain a codebase to Claude on Monday. Friday, it has no idea what you were working on.

**This recipe:** Claude remembers Monday on Friday. No re-explaining. No losing the thread mid-project.

---

## What it does

Adds 5 tools to every Claude Code session:

- `memory_save` — persist a decision, pattern, or finding
- `memory_read` — retrieve it by key
- `memory_search` — full-text search across everything saved
- `session_save` — save a structured end-of-session summary with next steps
- `session_get` — load last session's context at the start of a new one

Memory persists in a local SQLite file. Nothing leaves your machine.

---

## Setup (5 minutes)

**Requirements:** Node.js 18+

**1. Clone and install**

```bash
git clone https://github.com/shukumei7/research-server-patterns
cd research-server-patterns/recipes/memory-persistence
npm install
```

**2. Add to Claude Code**

```bash
claude mcp add research-memory node /absolute/path/to/recipes/memory-persistence/mcp-memory.js
```

Replace `/absolute/path/to/` with the actual path on your machine.

Windows example:
```
claude mcp add research-memory node "D:\research-server-patterns\recipes\memory-persistence\mcp-memory.js"
```

**3. That's it.** Start a Claude Code session. The `memory_save`, `memory_read`, `memory_search`, `session_save`, and `session_get` tools are now available.

---

## The Monday-to-Friday workflow

**Monday:** At the end of your session, tell Claude:

> "Save a session summary for this project."

Claude calls `session_save` with what was accomplished and next steps.

**Friday:** At the start of your new session, tell Claude:

> "Load last session for my-project."

Claude calls `session_get` and picks up exactly where you left off — decisions made, context intact, next steps ready.

**Any time:** Save a specific decision so it survives context compaction:

> "Remember that we're using JWT with 24h expiry for auth — save that as a memory."

Claude calls `memory_save`. Every future session in that project can retrieve it.

---

## Example: saving context that survives compaction

```
You: We decided to use edge caching for the API responses. Save that.
Claude: [calls memory_save: key="caching-decision", content="Use edge caching for all GET /api/* routes. TTL=300s. Invalidate on write."]

[two weeks later, fresh session]

You: What did we decide about caching?
Claude: [calls memory_search: query="caching"]
Result: "Use edge caching for all GET /api/* routes. TTL=300s. Invalidate on write."
```

---

## Custom database path

Set `MEMORY_DB_PATH` to an absolute path to control where the SQLite file lives:

```bash
MEMORY_DB_PATH=/Users/you/memory/projects.db claude
```

Or add to your shell profile to make it permanent.

---

## This is one recipe from Research Server

Research Server is a full autonomous back-office system for solo founders — email triggers, scheduled agents, SR&ED diary automation, accounting automation, and more. This recipe is the memory layer, standalone.

[→ Research Server on GitHub](https://github.com/shukumei7/research-server-patterns)  
[→ Done-for-you setup ($2,500)](https://shukumei7.github.io/research-server-patterns/dfy/)
