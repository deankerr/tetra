# Tetra

Local-first LLM chat app for power users. The project is in a core-simplification pass.

Read `VISION.md` and `ARCHITECTURE.md` for context, but do not treat the extended VISION layers as implementation priorities right now. Current priority is a clean, well-designed core: remove stale complexity, inline thin abstractions, and avoid adding new layers until the boundary is obvious.

## Current Posture

- Prefer deleting, inlining, or relocating code over inventing new abstractions.
- Keep the core flow easy to trace: consumer action -> runtime process -> store updates -> reactive UI reads.
- Preserve core chat functionality while simplifying; pause and discuss if a cleanup changes the model rather than only clarifying it.
- Use `zod` at data boundaries and infer types from schemas. Do not hand-write duplicate shape types.
- Use `import * as R from 'remeda'` when it makes transformations clearer.

## TinyBase

Full TinyBase docs live at `reference/tinybase-docs/index.md`; prefer them before web search.

- Important release notes: `reference/tinybase-docs/guides/releases/article.md` covers object/array types and State Hooks.
- Use domain types inferred from the store decoders when available; create derived types only when needed.

## Monorepo

Bun workspaces. Run scripts from the root.

- Check only: `bun run check`
- Auto-fix lint/format/type-aware issues: `bun run fix`
- App-specific scripts: `bun run --filter <name> <script>`, e.g. `bun run --filter @tetra/web dev`

## Linting

- The ruleset is strict and type-aware via Ultracite/Oxlint.
- Inline disables are allowed only when the local reason is written in the disable comment.
- `sort-keys` is enabled; let tooling reorder object keys.

## TypeScript 6

- `@types/*` packages are manually specified `"types": ["bun"]`, only if required
- Subpath Imports support, e.g. `"#/*": "./dist/*"`, replace deep relative paths `../../utils.js` with `#root/utils.js`

### agent-browser

- ALWAYS activate the `agent-browser` skill for browser automation or browser-based testing.
- Codex only: run `agent-browser` commands outside of the sandbox.
- Prefer `http://localhost:<port>` over `127.0.0.1` for local dev servers.
- Verify if the dev server is already running before attempting to start it.

### shadcn/ui and AI Elements

- ALWAYS activate the `shadcn` skill when authoring, adding, reviewing, or using `shadcn/ui` components.
- ALWAYS activate the `ai-elements` skill when adding, reviewing, or using AI Elements components.
- Add `shadcn/ui` components with `bunx --bun shadcn@latest add <component>`.
- Add AI Elements components with `bunx --bun shadcn@latest add @ai-elements/<component>`.
- Do not use `ai-elements@latest` directly.
- When prompted about overwriting `src/components/ui/*`, answer `no`, then inspect changes with `bunx --bun shadcn@latest add <component> --diff <file>` and apply any needed updates manually.
- Codex only: run shadcn registry commands outside of the sandbox.
- Never put padding directly on a ScrollArea component.

## Status

Experimentation, iteration.

### Prototype Mode

The primary goal is rapid design iteration, not building a user-facing app.

- NO backwards compatibility
- NO accessibility or mobile UI support
- NO data migrations - wipe dev data when required
- NO premature optimization, including bundle size

- Optimize for change.
- Fail fast.
- Prefer using existing libraries/solutions over writing our own.
