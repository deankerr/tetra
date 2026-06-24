# Stores

Tetra's shared TinyBase stores live here with small host initialization helpers.
App-local stores live in the app that owns them and are composed with these
shared definitions during app startup.

Current working shape:

- `library`: shared app data for sessions, transcript content, runs, prompts,
  favorites, and run defaults.
- `catalog`: model catalog cache.
- `apps/web`: owns web-only tab-local state, including the current draft-session
  pointer.
- `apps/cli`: owns CLI-only local state, currently just the active session id.

The host code creates raw TinyBase stores, indexes, typed store APIs, and typed
index APIs from definitions. Persistence and sync are intentionally outside the
web and CLI store hosts for now; the Worker keeps its Durable Object persister as
a narrow compatibility detail.
