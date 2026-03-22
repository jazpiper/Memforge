# Changelog

## Unreleased

- reworked distribution planning around three supported paths: Git source-run, npm full runtime `recallx`, and npm headless runtime `recallx-headless`
- added package prep and verification flows for both the full and headless npm distributions
- added `recallx serve` so installed packages can start the local API directly
- added optional renderer serving from the packaged runtime and a root runtime notice for headless installs

## 1.0.0

- published the first public RecallX release around two supported distribution paths: Git source-run and npm terminal-only
- published the npm CLI/MCP distribution path with `recallx` and `recallx-mcp`
- documented the source-run local API, renderer, and MCP workflows for public use
- finalized the current renderer/API surface around Guide, Recent, Graph, Project map, Governance, and Settings
- shipped the local semantic sidecar with `local-ngram` / `chargram-v1` embedding version `2`
