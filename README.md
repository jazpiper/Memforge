# Memforge

Memforge is a local-first personal knowledge layer for humans and agents.

It gives your desktop app, local API, CLI, and MCP-capable tools one durable workspace for shared memory instead of scattering context across prompts, notes, and tool-specific state.

## What It Is For

Memforge is built to keep these things in one local workspace:

- notes
- projects
- ideas
- questions
- decisions
- references
- activities
- relationships between them

The core idea is simple: one brain, many tools.

## Why Memforge

- local-first storage with SQLite-backed workspaces
- shared memory for humans and coding agents
- append-first writes with explicit provenance
- compact context assembly for agent workflows
- desktop, HTTP API, CLI, and MCP access over the same local data

## What Ships Today

- desktop app for local browsing, search, governance, and project exploration
- loopback HTTP API under `/api/v1`
- CLI commands through `memforge` and `pnw`
- stdio MCP bridge through `memforge-mcp`
- runtime workspace create/open switching without restarting the service

## Install

Desktop releases:

- macOS arm64: download the `.dmg` or `.zip` from [GitHub Releases](https://github.com/jazpiper/Memforge/releases)
- Linux x64: download the `.AppImage` or `.deb` from [GitHub Releases](https://github.com/jazpiper/Memforge/releases)

CLI + MCP from npm:

```bash
npm install -g memforge
memforge --help
pnw mcp install
memforge-mcp --help
```

`pnw mcp install` writes a stable launcher to `~/.memforge/bin/memforge-mcp`, which is the recommended command path for editor MCP configs.

If the API is running in bearer mode, set `MEMFORGE_API_TOKEN` in the MCP client environment. The launcher does not write tokens to disk.

Node requirements:

- desktop release users do not need Node
- npm CLI package: Node 20+
- local source development: Node 25+ is recommended because the backend uses `node:sqlite`

## Use From Other Coding Agents

If you want another coding agent to use a running local Memforge service, start with health and bootstrap first instead of assuming the protected service index is available.

- health check: `GET http://127.0.0.1:8787/api/v1/health`
- bootstrap: `GET http://127.0.0.1:8787/api/v1/bootstrap`
- service index after auth or in optional mode: `GET http://127.0.0.1:8787/api/v1`
- current workspace after auth or in optional mode: `GET http://127.0.0.1:8787/api/v1/workspace`

Recommended instruction:

```text
Use my running local Memforge service at http://127.0.0.1:8787/api/v1.
Start by calling GET /health and GET /bootstrap.
If authMode is bearer, include Authorization: Bearer <token> before calling GET /api/v1 or GET /workspace.
Use the returned endpoint list and request examples to search nodes and activities, inspect governance state, build context bundles, and switch workspaces.
Reuse the existing local service instead of starting a new one.
```

## MCP Bridge

Memforge also ships a stdio MCP adapter for agent clients that prefer tool discovery over raw HTTP calls.

```bash
npm run mcp
node dist/server/app/mcp/index.js --api http://127.0.0.1:8787/api/v1
memforge-mcp --api http://127.0.0.1:8787/api/v1
```

For launcher paths, environment variables, and editor-specific setup, see `docs/mcp.md`.

## Local Development

```bash
npm install
npm run dev
```

Server only:

```bash
npm run build:server
npm start
```

Checks:

```bash
npm run check
npm test
npm run build
```

Desktop packaging:

```bash
npm run package:desktop
```

## Docs

- `docs/README.md` for the full documentation map and reading order
- `docs/concept.md` for product positioning
- `docs/api.md` for the local HTTP and CLI contract
- `docs/mcp.md` for MCP bridge setup
- `docs/workflows.md` for validated usage flows
- `docs/schema.md` for storage and data model details
- `CHANGELOG.md` for release history
