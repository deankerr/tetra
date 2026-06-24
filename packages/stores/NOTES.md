# Stores

Tetra's TinyBase stores are split into a small set of definitions with shared
volatile host initialization.

Current working shape:

- `library`: shared app data for sessions, transcript content, runs, prompts,
  favorites, and run defaults.
- `catalog`: model catalog cache.
- `web`: web-only tab-local state, including the current draft-session pointer.
- `cli`: CLI-only local state, currently just the active session id.

The host code creates raw TinyBase stores, indexes, typed store APIs, and typed
index APIs from definitions. Persistence and sync are intentionally outside the
web and CLI store hosts for now; the Worker keeps its Durable Object persister as
a narrow integration detail.
