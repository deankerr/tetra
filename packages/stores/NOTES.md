# Stores Prototype

Question: can Tetra move from one monolithic TinyBase store plus an ad hoc `web`
store to a small set of store definitions with shared host initialization?

This package is a prototype. It is intentionally parallel to the current app wiring
and should either be deleted or absorbed into the real packages once the shape is
settled.

Current working shape:

- `library`: synced shared data for sessions, transcript content, runs, prompts,
  favorites, and run defaults.
- `catalog`: client-local persisted model catalog cache.
- `web`: web-only tab-local state, including the current draft-session pointer.
- `cli`: CLI-only local state, currently just the active session id.

The host code creates raw TinyBase stores, indexes, typed store APIs, and typed
index APIs from definitions. It also exposes web, CLI, and Worker lifecycle
plans plus opt-in runtime helpers that can create the TinyBase persisters and
synchronizers without committing the apps to this package yet.
