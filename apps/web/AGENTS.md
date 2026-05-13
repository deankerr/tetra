# web

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
