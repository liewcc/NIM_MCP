# NIM MCP — Architecture

Date: 2026-07-03. Scaffolded from `Gemi_MCP_V2`'s layout, but far simpler — NIM
has no local browser engine to babysit. Every model call is a single stateless
HTTPS request to NVIDIA's hosted endpoint, so there is no engine process, no
profile/account management, and no cold-start handshake to design.

---

## Core Principle

One API key, one OpenAI-compatible REST endpoint
(`https://integrate.api.nvidia.com/v1`), N models selected purely by the
`model` string in the request body. The MCP server is a thin translation
layer over that endpoint; the TUI is a debugging/observation window onto the
same server, calling the same REST API directly (not through MCP), mirroring
the Gemi TUI's role.

---

## Components

```
D:\AI\NIM_MCP\
  server.py            ← MCP server (mcp__nim__*): chat_completion, list_models
  .env                  ← NIM_API_KEY (gitignored)
  config.json           ← TUI-owned preferences (default_model, active_tab)
  setup.bat / setup.ps1 ← installer (Python venv + portable Node + npm install)
  run.bat   / run.ps1   ← build + launch the TUI
  ARCHITECTURE.md / HANDOFF.md
  tui/
    app.js              ← Ink (React for terminals) TUI source — layout only, no content yet
    build.mjs            ← esbuild: JSX transpile, node_modules external
    package.json
    dist/app.mjs         ← build output (gitignored)
```

No `Gemi_Engine_V2`-equivalent exists or is planned — there is nothing to
launch as a background process. `run.ps1`'s only job is: ensure portable
Node.js is present, build the TUI, launch it.

---

## TUI — layout (scaffold only, no behavior yet)

Single Ink/React process, one horizontal menu bar at the top switching
between tabs, each tab rendering a two-column row (left action/nav panel +
right content panel) — same visual convention as Gemi's TUI, kept identical
on purpose so the two tools feel like siblings.

Planned tabs (not implemented yet, placeholders only):
- **CHAT** — left: model picker / recent prompts; right: response viewer
- **MODELS** — left: category filter; right: full catalog list (from
  `list_models`)

No engine health, no account/profile concepts — the only "is it working"
check this TUI needs is whether `NIM_API_KEY` is set and the API responds.

---

## Config ownership

- `.env` — secret, `NIM_API_KEY`, read by `server.py` only.
- `config.json` — TUI-owned, non-secret preferences (default model, last
  active tab). MCP does not read this file — each `chat_completion` call
  takes `model` explicitly from the caller.

No engine process means no `engine_config.json`-equivalent is needed.

---

## Why this is intentionally smaller than Gemi_MCP_V2's architecture

Gemi's complexity (idle-timeout, cold-start handshake, profile sandboxing,
DOM selectors) exists entirely to manage a stateful headless browser
impersonating a human. NIM has no browser, no session, no login — every
request is independent and self-contained. Building any of that machinery
here would be pure YAGNI. If NIM ever grows a stateful piece (e.g. persistent
conversation threads server-side), revisit then — not before.
