# NIM MCP — Handoff

**Last Updated:** 2026-07-03 — Claude Sonnet 5 (session 1)

This file is local-only (gitignore it if this ever gets a public repo).
Structure: **Open Issues** → **Architecture** (see `ARCHITECTURE.md`, not
duplicated here) → **Session History**.

---

## Open Issues

### 1. TUI has no content yet — layout scaffold only

`tui/app.js` renders the horizontal menu bar (CHAT / MODELS) and the
left/right two-panel layout, but neither panel does anything real yet —
no calls to `server.py`'s tools, no live model list, no chat input wired up.
Next session: decide whether the TUI talks to NIM directly (mirroring how
Gemi's TUI calls the engine's HTTP API directly, not through MCP) or shells
out to `server.py`'s tool functions some other way — needs a decision before
writing real panel logic.

### 2. `chat_completion`'s vision/tool-calling additions — untested from the TUI

Both were verified via raw `httpx` calls and once through the live MCP tool
(see main session history), but the TUI has no UI for either yet (no image
attach, no tool-call display).

### 3. No embedding / rerank / safety-model tools

Deliberately deferred (see architecture doc's "why this is smaller" section
and the main session's "核心必做 vs 看需求再加" decision) — only chat
completion (with vision + tool calling) and model listing exist. Add only
when a concrete use case shows up.

---

## Quick Reference

### Test the MCP server directly (no TUI involved)
```powershell
cd D:\AI\NIM_MCP
.venv\Scripts\python.exe -c "
import httpx, os
from dotenv import load_dotenv
load_dotenv()
c = httpx.Client(base_url='https://integrate.api.nvidia.com/v1',
                  headers={'Authorization': f'Bearer {os.getenv(\"NIM_API_KEY\")}'})
r = c.post('/chat/completions', json={'model':'z-ai/glm-5.2','messages':[{'role':'user','content':'hi'}],'max_tokens':10})
print(r.json())
"
```

### Repo layout
```
D:\AI\NIM_MCP\
  server.py         ← MCP server, tools: chat_completion, list_models
  .env              ← NIM_API_KEY
  config.json       ← TUI-owned prefs
  run.bat / run.ps1 / setup.bat / setup.ps1
  tui/app.js        ← layout scaffold, no live behavior yet
```

Registered in Claude Desktop as `nim` (`mcp__nim__*`) — see
`C:\Users\cclie\AppData\Roaming\Claude\claude_desktop_config.json` and the
global `~/.claude/CLAUDE.md` Agent Roster / MCP servers list.

---

## Session History

### Session 1 (2026-07-03)
- Created `server.py` (httpx-based, no `openai` package dependency — already
  had `httpx`+`mcp`+`dotenv` installed system-wide, no new deps needed).
  Two tools: `chat_completion` (now with `tools`/`tool_choice` for function
  calling, and vision via `image_url` content parts), `list_models`.
- Verified live against the real NIM endpoint: plain chat, tool calling
  (`z-ai/glm-5.2` correctly returned `tool_calls`), vision (base64 image to
  `meta/llama-3.2-11b-vision-instruct`).
- Researched (Gemi + WebSearch): NIM's vision format matches OpenAI's
  `image_url`/base64 convention, VLM-tagged models only; no official
  capability-vs-model table (must check each model's page on
  build.nvidia.com/models); no official NVIDIA MCP server exists, but
  NVIDIA/NeMo-Agent-Toolkit has MCP client+server support and documents the
  "client fetches tools from MCP, converts to OpenAI tools format, sends to
  NIM" pattern.
- Registered `nim` in `claude_desktop_config.json` and the global
  `~/.claude/CLAUDE.md` (Agent Roster table + MCP servers list).
- Scaffolded project layout (this session): `config.json`, `ARCHITECTURE.md`,
  `HANDOFF.md`, `run.bat`/`run.ps1`, `setup.bat`/`setup.ps1`, `tui/` (Ink,
  layout-only, no content) — modeled on `Gemi_MCP_V2`'s repo structure but
  substantially simplified (no engine process, no account/profile system).
