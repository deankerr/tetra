# Stores

Tetra's TinyBase stores are split into a small set of definitions with shared
host initialization.

Current working shape:

- `library`: synced shared data for sessions, transcript content, runs, prompts,
  favorites, and run defaults.
- `catalog`: client-local persisted model catalog cache.
- `web`: web-only tab-local state, including the current draft-session pointer.
- `cli`: CLI-only local state, currently just the active session id.

The host code creates raw TinyBase stores, indexes, typed store APIs, and typed
index APIs from definitions. It also exposes web, CLI, and Worker lifecycle
plans plus runtime helpers that create the TinyBase persisters and synchronizers.
