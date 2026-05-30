# Give Claude Code a Long-Term Memory With SQLite and MCP

Every time I open Claude Code on Monday, it's Friday again — the model has no idea what I was working on, why I made the architectural decisions I made, or what's blocked. I've been re-explaining the same context for months.

The fix turned out to be simpler than I expected: a small MCP stdio server backed by SQLite FTS5. Claude writes to it, Claude reads from it. Context persists across sessions, across days, across machine restarts.

Here's how it works.

## The Problem With Claude's Default Memory

Claude Code's context window is per-session. When you close the terminal, everything goes with it. The next session starts cold. If you have long-running projects — anything where decisions compound over weeks — you're constantly fighting the blank-slate problem.

Some people work around this by writing long CLAUDE.md files. That works for static context, but it doesn't capture *decisions made in session* — the "I tried approach A, it failed because of X, switched to B" history that makes future sessions productive.

What you actually need is something Claude can write to mid-session and read from at the start of the next one.

## The Architecture

The memory layer has three pieces:

**SQLite FTS5 table** — stores key/value memory entries, tagged by project, with full-text search. FTS5 means Claude can search with natural language queries ("what did we decide about auth?") and get ranked results instead of exact-key lookups.

**MCP stdio server** — wraps the SQLite operations and exposes five tools to Claude: `memory_save`, `memory_read`, `memory_search`, `session_save`, and `session_get`. Because it runs as stdio, there's no port to manage, no auth headers, no network at all — Claude pipes to it directly.

**Session continuity tools** — `session_save` lets Claude write a structured summary at the end of a session (what changed, what's next). `session_get("latest", project)` loads that summary at the start of the next one. This is the part that actually eliminated the Monday problem.

## Setting It Up

You need Node.js and `claude mcp add`. That's it.

```bash
# Clone and install
git clone https://github.com/shukumei7/research-server-patterns
cd research-server-patterns/recipes/memory-persistence
npm install

# Register it with Claude Code (use your actual path)
claude mcp add research-memory node /absolute/path/to/recipes/memory-persistence/mcp-memory.js
```

Once registered, Claude Code automatically connects to the MCP server when it starts. You should see `research-memory` in your MCP server list.

From there, the workflow is:

```
# At session start (add this to CLAUDE.md or say it explicitly)
Call session_get("latest", "my-project") to load prior context.

# During session — whenever you make a non-obvious decision
memory_save("auth-decision", "Using TOTP over OAuth because we need offline support", "my-project")

# At session end
session_save({
  session_id: "...",
  project: "my-project",
  title: "Wired up auth middleware",
  summary: "Replaced JWT with TOTP, updated 3 routes, db migration pending",
  next_steps: ["Run migration", "Update API docs", "Test mobile client"]
})
```

The next session starts by calling `session_get`, which returns the summary and next steps from where you left off.

## What Actually Changes Day-to-Day

The biggest shift is that I stopped treating Claude Code as a stateless tool and started treating it as a collaborator with memory. I ask it to save decisions as it makes them, not just at session end. When something fails, it saves why. When an approach is ruled out, that gets saved too.

`memory_search` is surprisingly useful mid-session. "What did we decide about the database schema?" returns the actual entry, not a guess. This matters most on large projects where CLAUDE.md would need to be thousands of words to capture everything.

The session boundary overhead is real — you have to instruct Claude to call `session_get` at the start and `session_save` at the end, and sometimes it doesn't. I put the instructions in CLAUDE.md and it's consistent enough to be useful, not consistent enough to be invisible. Fair tradeoff for a free, 5-minute setup.

## FTS5 Specifically

Using FTS5 instead of a regular SQLite table matters for one reason: search queries don't need to match exact keys. You can ask "what authentication decisions have we made?" and get ranked matches across all memory entries that contain relevant terms. Regular LIKE queries on SQLite don't rank, and exact-key lookups require you to remember the key you used three weeks ago.

The FTS5 schema is straightforward:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  key, content,
  content=memory,
  content_rowid=id
);
```

The `content=` option keeps FTS5 in sync with the underlying table without duplicating all your data. Worth knowing if you extend this for your own projects.

## What This Doesn't Do

It doesn't solve context window limits during a session — if your conversation gets long enough, older tool results get compressed out regardless. Memory persistence is between sessions, not within them.

It also doesn't automatically capture everything. Claude has to be instructed to save — it won't spontaneously write to memory unless you've told it to. The CLAUDE.md instructions are doing real work here.

And the MCP stdio server dies if your process dies. If you want memory available across machine restarts (or across multiple machines), you need the server running somewhere persistent. The standalone recipe assumes local development; a remote deployment is a separate problem.

## The Recipe

The full standalone memory MCP setup — SQLite schema, server code, the five tools, and CLAUDE.md instructions — is documented at the [Research Server Patterns site](https://shukumei7.github.io/research-server-patterns/). Five minutes to working memory persistence. If you want the full infrastructure (email-triggered agents, orchestration scheduling, done-for-you), that's a separate offering — but the memory recipe is free and self-contained.

For anyone running Claude Code seriously on a multi-week project, it's worth the five minutes.
