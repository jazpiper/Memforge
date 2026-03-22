# Memforge Release Checklist

> Maintainer-only operational checklist.
> This document is for release verification and packaging work, not for product positioning or end-user onboarding.

## Pre-release

- update versions to the intended release tag
- run `npm run check`
- run `npm test`
- run `npm run build`
- run `npm run prepare:cli-package`
- confirm `npm pack ./release/npm-cli` succeeds
- confirm `npm run verify:desktop:mac-release` succeeds on macOS
- confirm desktop packaging smoke tests on macOS and Linux

## Desktop release

- macOS arm64 artifacts generated: `.dmg`, `.zip`, `latest-mac.yml`
- macOS codesign verification passes
- macOS notarization succeeds
- macOS artifact verification checks the rebuilt `.zip`, `.dmg`, and `latest-mac.yml`
- Linux x64 artifacts generated: `AppImage`, `.deb`
- tray actions work in packaged mode:
  - `Open Settings`
  - `Server Status...`
  - `Workspace Status...`
  - `Copy MCP Launcher Path`

## npm release

- `npm publish ./release/npm-cli --access public` succeeds
- `memforge --help` works after install
- `pnw mcp install` creates `~/.memforge/bin/memforge-mcp`
- `memforge-mcp --help` starts from the installed package

## Release notes and docs

- `CHANGELOG.md` contains the release entry
- `README.md` install section matches the shipped artifacts
- `app/cli/README.md` matches the npm package behavior
- historical docs remain marked historical
