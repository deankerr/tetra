# Domain Docs

Tetra uses a multi-context domain-doc layout rooted at `CONTEXT-MAP.md`.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root to find the context files relevant to the work area.
- **`CONTEXT.md`** at the repo root when the work touches shared product/domain language.
- **`<context>/CONTEXT.md`** for each relevant app or package listed in the map.
- **`docs/adr/`** for system-wide ADRs that touch the area you're about to work in.
- **`<context>/docs/adr/`** for context-scoped ADRs when that directory exists.

If any mapped file or ADR directory doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The producer skill (`/grill-with-docs`) creates context files and ADRs lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in the relevant `CONTEXT.md` file. Prefer the narrowest matching context, then fall back to the shared root context. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
