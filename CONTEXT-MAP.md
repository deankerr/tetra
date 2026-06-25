# Context Map

Tetra uses multiple domain contexts. Read the narrowest context that matches the files or concepts you are working on, then read the shared root context when product/domain language is involved.

Most context files are created lazily. If a mapped `CONTEXT.md` or `docs/adr/` directory does not exist yet, skip it silently and continue from the repo, package docs, and AGENTS instructions that do exist.

## Shared Context

| Path         | Scope                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md` | Product and domain language shared across Tetra: sessions, messages, runs, tools, usage, local-first behavior, and user-facing concepts. |

## Package And App Contexts

| Path                                  | Scope                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/CONTEXT.md`            | Core domain behavior: sessions, messages, runs, catalog refresh, tool execution, recovery, and shared behavior used by web and CLI.                             |
| `packages/stores/NOTES.md`            | Tetra's shared TinyBase store definitions, indexes, row types, and app-specific store ownership boundaries.                                                     |
| `packages/tinybase-schema/CONTEXT.md` | Typed TinyBase helper library design: zod-to-TinyBase schema generation, bound store/index APIs, React wrappers, escape hatches, and library-level constraints. |
| `apps/web/CONTEXT.md`                 | Web app shell behavior: TanStack Start routes, React UI state, TinyBase provider wiring, persistence/sync UI, credentials UI, and interaction workflows.        |
| `apps/cli/CONTEXT.md`                 | CLI workflows: command behavior, parity with web features, local session selection, terminal I/O, and scriptable operations.                                    |
| `apps/worker/CONTEXT.md`              | Cloudflare Worker sync backend: Durable Object behavior, websocket synchronization, and deployment/runtime constraints.                                         |
| `packages/ui/CONTEXT.md`              | Shared UI system: shadcn components, AI Elements, vendored component boundaries, theme tokens, and reusable visual primitives.                                  |
| `packages/credentials/CONTEXT.md`     | Credential storage and provider key concerns shared by app surfaces.                                                                                            |
| `packages/tools-exa/CONTEXT.md`       | Exa tool integration: tool descriptors, request/response boundaries, and search/content tool semantics.                                                         |

## ADR Lookup

Read `docs/adr/` for system-wide decisions when it exists. For context-specific work, also check `<context>/docs/adr/` beside the mapped context file.

## Context Selection

If a change spans multiple contexts, read each matching context rather than forcing the work through a single global glossary. In particular, keep these boundaries distinct:

- `packages/stores` describes Tetra's app data model and shared store definitions.
- `packages/tinybase-schema` describes a reusable typed TinyBase helper library.
- `packages/core` owns UI-agnostic app behavior over the schema.
- `apps/web` and `apps/cli` decide surface-specific workflows around shared core behavior.
