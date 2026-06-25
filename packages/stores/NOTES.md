# Stores

Tetra's shared TinyBase store definitions live here. App-local stores live in
the app that owns them and are composed with these shared definitions during app
startup.

Current working shape:

- `library`: shared app data for sessions, transcript content, runs, prompts,
  favorites, and run defaults.
- `catalog`: model catalog cache.
- `apps/web`: owns web-only tab-local state, including the current draft-session
  pointer.
- `apps/cli`: owns CLI-only local state, currently just the active session id.

TinyBase runtime creation belongs to `@tetra/tinybase-schema/runtime`.
Persistence and sync are intentionally outside this package; each app or worker
owns the lifecycle details for the stores it composes.
