# Built a self-hosted MCP memory server for Claude Code so it stops forgetting everything between sessions

Been running Claude Code heavily for a few months and the context loss between sessions was the main friction — constantly re-explaining project state, what decisions were made last week, what's in progress.

So I built a small Node.js MCP server that persists memory to SQLite with FTS5 full-text search. You add it to Claude Code in about 5 minutes via `claude mcp add`. Claude can then call `memory_save`, `memory_search`, `session_save` etc. across sessions, so the next session picks up where the last one left off.

The setup I'm running locally goes further — email-triggered Claude Code agents (forward an invoice, it enters it in Wave accounting), scheduled orchestration tasks, SR&ED diary automation. But all of that is optional on top of the core memory recipe.

Stack: Node.js, SQLite (better-sqlite3), MCP stdio transport. Everything runs on your own machine or VPS, nothing external required except the Claude API.

The standalone memory recipe is free and open. Published the patterns here if anyone wants to set it up: https://shukumei7.github.io/research-server-patterns/

Happy to answer questions about the MCP server implementation if anyone's building something similar.
