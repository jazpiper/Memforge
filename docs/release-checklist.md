# Memforge Release Checklist

> Maintainer-only operational checklist.
> This document is for release verification and packaging work, not for product positioning or end-user onboarding.

For the full maintainer flow, including release PR creation and publish automation, see `release-workflow.md`.

## Changesets

- user-visible release work lands with a `.changeset/*.md` entry when it should affect the next npm release
- `npm run changeset:status` is clean before starting a version PR review
- the GitHub `Release` workflow is enabled on `main`
- the GitHub `Publish` workflow is available for manual npm publish runs
- the repository `NPM_TOKEN` secret is configured for publish jobs

## Pre-release

- update versions to the intended release tag
- or let the Changesets release PR update versions automatically
- run `npm run check`
- run `npm test`
- run `npm run build`
- run `npm run prepare:full-package`
- run `npm run prepare:headless-package`
- confirm `npm pack ./release/npm-memforge` succeeds
- confirm `npm pack ./release/npm-headless` succeeds
- confirm `npm run verify:full-package` succeeds after packing the tarball
- confirm `npm run verify:headless-package` succeeds after packing the tarball

## npm release

- merge the version PR opened by the `Release` workflow
- `npm run publish:full` succeeds
- `npm run publish:headless` succeeds
- `npm pack ./release/npm-memforge` is followed by `npm run verify:full-package`
- `npm pack ./release/npm-headless` is followed by `npm run verify:headless-package`
- `memforge serve` starts after install
- `pnw help` works after install
- `pnw mcp install` creates `~/.memforge/bin/memforge-mcp`
- `memforge-mcp --help` starts from the installed package
- the installed MCP launcher contains `memforge-mcp.js` and `--api`, but not persisted bearer tokens
- the full package serves the renderer at `/`
- the headless package returns a root runtime notice at `/`

## Release notes and docs

- `CHANGELOG.md` contains the release entry when a release note is needed
- the merged version PR matches the intended semver bump from `.changeset/*.md`
- `README.md` matches the three supported distribution paths: Git source-run, npm full runtime, and npm headless runtime
- `app/cli/README.md` matches the npm headless package behavior
- historical docs remain marked historical
