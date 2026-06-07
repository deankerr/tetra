# Sync Architecture

TinyBase's sync layer (MergeableStore + WsSynchronizer) is completely opaque to business logic — the store API is identical whether data comes from local SQLite, IndexedDB, memory, or a live DO. This isolation is one of TinyBase's key strengths and a reason to tolerate its rougher edges.

## Current Setup

A single Durable Object instance at path `/tetra` holds the synced store. The web app sync mode and the CLI default mode both sync to it via WebSocket. The DO persists to SQLite using `createDurableObjectSqlStoragePersister`.

```
Web sync (WsSync) ───────┐
                         ├──► DO /tetra (SQLite)
CLI sync (cache + WsSync)┘
```

The web app also supports non-sync modes:

- `memory`: a plain in-memory Store with no persistence.
- `local`: a plain Store persisted to IndexedDB database `tetra-local`.

The CLI also supports `--local`, which uses a plain Store and tabular SQLite database `tetra-redesign.db`.

## Resetting Prototype Data

Tetra does not rely on TinyBase native schema defaults or row-dropping validation as a reset path. Bad prototype data should be erased explicitly.

For web local data, use the bug menu's "Clear all data" action, or the same action on the root error screen. This deletes the `tetra-local` IndexedDB database and reloads the page.

For synced Durable Object data, the worker exposes `DELETE /tetra/reset`. This sync Worker is currently a dev convenience and placeholder, so the reset endpoint deliberately has no auth beyond requiring the more explicit HTTP method.

The CLI wraps the reset endpoint:

```bash
TETRA_WORKER_URL=https://tetra-worker.example.workers.dev bun run reset-sync
```

## The Single-Store Problem

As session history accumulates, a single MergeableStore will grow without bound. The DO's SQLite limit is generous, but the bigger issue is that the entire store is loaded into DO memory on every wake from hibernation — including all messages, reasoning traces, and step records from every session ever run.

The CRDT metadata (timestamps, hashes per cell) also compounds this: a MergeableStore is larger in memory than a plain Store for the same data.

## Multiple Dynamic Stores

The natural split is per-session DOs. Each session gets its own DO instance, addressed by session ID:

```
/session/:sessionId  →  one DO, one MergeableStore, one SQLite DB
```

The worker already routes by URL path — switching from a single fixed path to dynamic session IDs is a one-line change in the fetch handler. The client synchronizer URL becomes `ws://worker/session/:id` and is created/destroyed as sessions are opened/closed.

Benefits:

- DO memory is proportional to one session's data, not all sessions
- Hibernation/wake cost is bounded
- Natural isolation boundary for future multi-user sharing (invite someone to a session = give them access to one DO)

Tradeoffs:

- The sidebar session list can no longer be read from a single synced store — it needs a separate index (a lightweight DO or KV namespace) that holds session metadata only
- Creating a new session requires provisioning a new DO path (trivial, but a new concept in the data model)
- The CLI dump command would need to enumerate session IDs and sync each separately

## PartyKit

PartyKit runs on Cloudflare infrastructure and TinyBase has a first-class `persister-partykit-client/server` integration. However, PartyKit is designed around multi-user presence and room broadcasting — the collaboration primitive is different from what Tetra needs (single-user, multi-device, durable state). The DO SQLite persister is more tightly integrated with TinyBase's MergeableStore than PartyKit's storage abstraction.

PartyKit would become relevant if Tetra added shared/collaborative sessions.

## Deferred Decisions

- When to split: a single store is fine for a personal tool. Split when session count or message volume makes DO wake latency noticeable, or when per-session sharing becomes a goal.
- Session index: if splitting, the simplest index is a KV namespace keyed by user ID listing session metadata. TinyBase could sync just the index store on startup and lazy-load per-session stores as sessions are opened.
