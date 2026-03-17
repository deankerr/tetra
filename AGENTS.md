# Tetra

LLM chat app for power users. Local-first, composable, built on TinyBase.

- `AI SDK` with `OpenRouter` provider
- `React`, `Tailwind`, `shadcn/ui` with `Base UI` and theme preset (Mira, Teal/Mist)
- `AI Elements` Chatbot/Agent components from the `shadcn` component registry
- `TanStack Start`
- Use `zod` for validation - not manual checking
- Use `import * as R from 'remeda'` to write compact, type safe functions (this is tree-shaken)

@VISION.md @ARCHITECTURE.md

- `docs/sub-agents.md`

## TinyBase

TinyBase documentation: @reference/tinybase-docs

- In React, do not use TinyBase `useRow` for rows that contain `object` or `array` cells such as `messages.message` or `commands.payload`. TinyBase rebuilds those nested values on read, which can make the hook snapshot unstable and trigger React `useSyncExternalStore` infinite-loop errors. Prefer `useCell` subscriptions and reconstruct the record in a local adapter layer. (This is probably a bug/oversight.)
- Use domain types inferred from the decoders in the data access layer - create derived types if necessary, NEVER manually recreate type definitions.

## Workflow

- Use `bun run check` to type check, lint with auto-fix, and format the project in <1 sec with `oxlint`/`oxfmt`. Never run `tsc` manually.
- Strict type-aware linting is enabled. If rule seems invalid or inappropriate, you must justify the reasoning before using an inline ignore comment.
- Be proactive in activating available skills when you are working within their domain.

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
- We don't enforce our strict lint rules on external registry components. If a new registry has been added, update `.oxlintrc.json` with an ignore pattern.

## Status

Experimentation, iteration.

Core: @src/lib/core

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
