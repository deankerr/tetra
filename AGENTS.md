# Tetra

LLM chat app for power users. Local-first, composable, built on TinyBase.

- `AI SDK` with `OpenRouter` provider — user provides their own API key
- `TanStack Start`, `Tailwind`, `shadcn/ui` with `Base UI` and theme preset (Mira, Teal/Mist)
- `AI Elements` Chatbot/Agent components from the `shadcn` component registry
- Use `zod` for validation - not manual checking
- Use `import * as R from 'remeda'` to write compact, type safe functions (this is tree-shaken)

@VISION.md @ARCHITECTURE.md

- Feature exploration `docs/sub-agents.md`
- Single user, no auth.

## TinyBase

Full TinyBase documentation: @reference/tinybase-docs/index.md

- Prefer searching here to exa/context7
- Important updates reference/tinybase-docs/guides/releases/article.md Object/array types, State Hooks
- Use domain types inferred from the decoders in the data access layer - create derived types if necessary, NEVER manually recreate type definitions.

## Monorepo

Bun workspaces. Apps in `apps/`, packages in `packages/`.

- `apps/web` — TanStack Start frontend (the main app)

Run scripts from root with `bun run --filter <name> <script>`, e.g. `bun run --filter @tetra/web dev`.

## OXC

- Use `bun run fix` type check, lint, and format with `oxlint`/`oxlint-tsgolint`/`oxfmt`
- Inline disables may be used if the reasoning is justified
- Vendored code like `shadcn-ui` is added to ignorePatterns, e.g. `**/components/ui/**`
- `sort-keys` is enabled - allow it to re-order object keys.

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
- We don't enforce our strict lint rules on external registry components. If a new registry has been added, update `apps/web/.oxlintrc.json` with an ignore pattern.
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
- Write decoupled, modular components.
- Prefer using existing libraries/solutions over writing our own.
