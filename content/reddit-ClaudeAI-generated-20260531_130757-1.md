# Built a persistent memory layer for Claude Code after re-explaining the same context for the 50th time

Six months ago I started keeping a "context file" I'd paste at the start of every Claude Code session. Then it became three files. Then I was spending 20 minutes re-bootstrapping an AI that had already done all this work before.

The fix is a small MCP server that persists session memory to SQLite. Before a session ends, Claude saves decisions, open questions, and next steps. The next session calls `session_get("latest", project)` and picks up without the paste ritual.

The pattern that surprised me most: email triggers. Forward an invoice to a specific address, Claude processes it. Reply to an escalation, Claude resumes the task. It's just a polling loop that spawns `claude -p` with the email body injected as context. Obvious in hindsight, but I hadn't seen it documented anywhere.

I've been running this on my local dev machine for a few months — it's not polished infrastructure, but the memory piece works reliably. The recipe is standalone (doesn't require the full server setup) and takes about 5 minutes to add via `claude mcp add`.

Wrote it up here if you want the pattern: https://github.com/shukumei7/research-server-patterns

*(If you're comparing to Mem0: Mem0 is the right call if you want cloud-hosted semantic search. This trades that for local storage only — nothing goes to a memory service, open the .db file and read everything directly.)*
