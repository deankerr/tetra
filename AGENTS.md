# Tetra

Local-first LLM chat app for power users.

## Prototype Mode

The primary goal is rapid design iteration and experimentation, not building a user-facing app.

Dev data is wiped and regenerated as needed. This app is not public. There are has no users.

- NO backwards compatibility shims
- NO migrations - break schemas without hesitation
- NO accessibility or mobile UI support
- NO premature optimization of code or bundle size
- NO purist git hygiene - all parts of the app are in flux

- Fail fast, throw exceptions, never swallow errors, use console.log/warn/error
- Prefer using existing libraries/solutions over writing our own.
- Lockfile changes are acceptable even if they seem unrelated, do not edit manually.

## `core` rewrite with CLI

- We're current performing a clean reimplementation in `packages/core`, with a CLI interface instead of React.
- The core mechanics should work with any kind of UI.
- Architecture guide `docs/inference-model-design/`

## TinyBase

The TinyBase repo is cloned as a submodule in `reference/tinybase`.

## Monorepo

Bun workspaces. Run scripts from the root.

- Auto-fix lint/format/type-aware issues: `bun run fix`
- App-specific scripts: `bun run --filter <name> <script>`, e.g. `bun run --filter @tetra/web dev`

## Linting

- The ruleset is strict and type-aware via Ultracite/Oxlint.
- Inline disables are allowed only when the local reason is written in the disable comment.
- `sort-keys` is enabled; let tooling reorder object keys.

## TypeScript 6

- `@types/*` packages are manually specified `"types": ["bun"]`, only if required
- Subpath Imports support, e.g. `"#/*": "./dist/*"`, replace deep relative paths `../../utils.js` with `#root/utils.js`

## Knip

- A perfect (dev/)dependencies result is a non-goal - expect testing/frontend/tanstack deps to go unused for periods of time.

## Project Docs

@VISION.md
