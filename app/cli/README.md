# Memforge Headless

## At A Glance

- This package is the npm-distributed headless runtime for Memforge.
- It provides the `memforge`, `pnw`, and `memforge-mcp` commands.
- It can start the local Memforge API directly through `memforge serve`.
- It does not include the renderer or desktop release artifacts.

It defers behavior to the local Memforge API contract in [`docs/api.md`](../../docs/api.md).

## What You Get

- `memforge` as the runtime and CLI entrypoint
- `pnw` as the short command for day-to-day workspace and memory operations
- `memforge-mcp` as the direct stdio MCP entrypoint for agent clients

This distribution is for headless workflows. If you want the packaged renderer too, use the `memforge` npm package described in the root [`README.md`](../../README.md).

## Install

```bash
npm install -g memforge-headless
memforge serve
```

In another shell:

```bash
pnw health
memforge-mcp --help
pnw mcp install
```

`pnw mcp install` writes the stable launcher path used by editor MCP configs:

```text
~/.memforge/bin/memforge-mcp
```

If the API is running in bearer mode, set `MEMFORGE_API_TOKEN` in the MCP client environment. The launcher intentionally does not persist tokens to disk.

Start the local headless runtime with:

```bash
memforge serve
```

Useful runtime overrides:

```bash
memforge serve --port 8787 --bind 127.0.0.1
memforge serve --workspace-root /Users/name/Documents/Memforge
memforge serve --workspace-name "Personal Workspace"
memforge serve --api-token secret-token
```

The headless package does not ship renderer pages or desktop release artifacts. At `/`, it returns a runtime notice instead of the renderer app.

You can also print the direct MCP command or a config snippet:

```bash
pnw mcp command
pnw mcp config
pnw mcp path
```

## Common Tasks

Quick health and workspace checks:

```bash
pnw health
pnw workspace current
pnw workspace list
```

Search and inspect memory:

```bash
pnw search "agent memory" --type project --limit 5
pnw get node_123
pnw related node_123 --depth 1
pnw context node_project_1 --mode compact --preset for-coding --format markdown
```

Write back new information:

```bash
pnw create --type note --title "Idea" --body "..."
pnw append --target node_project_1 --type agent_run_summary --text "Implemented draft"
pnw link node_a node_b supports --status suggested
pnw attach --node node_project_1 --path artifacts/report.md
```

MCP setup helpers:

```bash
pnw mcp install
pnw mcp path
pnw mcp command
pnw mcp config
```

## Commands

```bash
pnw health
pnw mcp config
pnw mcp install
pnw mcp path
pnw mcp command
pnw search "agent memory" --type project --limit 5
pnw get node_123
pnw related node_123 --depth 1
pnw context node_project_1 --mode compact --preset for-coding --format markdown
pnw create --type note --title "Idea" --body "..."
pnw append --target node_project_1 --type agent_run_summary --text "Implemented draft"
pnw link node_a node_b supports --status suggested
pnw attach --node node_project_1 --path artifacts/report.md
pnw search activities "implemented draft"
pnw search workspace "what changed"
pnw governance issues --states contested,low_confidence
pnw governance show --entity-type node --entity-id node_123
pnw governance recompute --entity-type node --entity-ids node_123
pnw workspace current
pnw workspace list
pnw workspace create --root /Users/name/Documents/Memforge-Test --name "Test Workspace"
pnw workspace open --root /Users/name/Documents/Memforge-Test
```

## Environment

- `MEMFORGE_API_URL` or `PNW_API_URL` to override the local API base URL
- `MEMFORGE_TOKEN` or `PNW_TOKEN` to pass a bearer token
- `MEMFORGE_PORT`, `MEMFORGE_BIND`, `MEMFORGE_WORKSPACE_ROOT`, `MEMFORGE_WORKSPACE_NAME`, and `MEMFORGE_API_TOKEN` are respected by `memforge serve`
- Node 20+ is recommended for the headless package

## Notes

- Default API base: `http://127.0.0.1:8787/api/v1`
- `memforge serve` starts the local Memforge API in-process from the installed package
- The CLI stays thin for day-to-day API operations and defers behavior to the HTTP API contract
- `--format json` is useful when scripting, while `--format markdown` is best for `context`
- `workspace open` switches the active workspace in the running local Memforge service without restarting the server
- `memforge-mcp` is the direct stdio MCP entrypoint from the npm package
- See the root [`README.md`](../../README.md) for source-run usage and install paths
- See [`docs/mcp.md`](../../docs/mcp.md) for editor MCP wiring details
