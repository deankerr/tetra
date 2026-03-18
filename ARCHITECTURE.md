# Architecture

TinyBase is the synchronization boundary between the UI and the runtime. React and the runtime never call each other — both read from and write to TinyBase. This decouples streams from navigation: a stream survives unmount, session switching, and remount without any handshake.

Nothing is synced today, but the architecture separates state into two stores based on whether it _should_ sync: domain data that belongs on every device vs. local UI state that doesn't.

## Stores

### Core Store

Domain data. Sessions, messages, requests, agents. Persisted to IndexedDB. Typed schema (`with-schemas`). This is the data you'd sync across devices — conversation history, agent configurations, request records.

Structured in layers:

1. **Schema + Store** — Table/value definitions, store creation, persistence, indexes → `lib/core/data/stores.ts`, `lib/core/data/schemas.ts`
2. **DAOs + Codecs** — Type-safe read/write per entity. Codecs separate persisted row shape from domain types. Types inferred from decode functions → `lib/core/data/{agents,sessions,messages,requests}.ts`
3. **Operations** — Named business actions (`createSession`, `sendMessage`, `regenerate`). Multi-entity writes. Pure domain logic — operations do not read or write UI state → `lib/core/operations.ts`
4. **Runtime** — Watches for pending requests, manages abort controllers, writes streamed responses back to the store. Not aware of React → `lib/core/runtime.ts`, `lib/core/stream.ts`
5. **Core Singleton** — Composes data layer, operations, and runtime. Single entry point for React → `lib/core/index.ts`

**Entities:**

- **Sessions** — Conversation context
- **Messages** — Ordered per-session, stores full AI SDK UIMessage as object cell
- **Requests** — Signaling between UI and runtime (pending → streaming → completed/error/cancelled). Each request snapshots its inference config at creation time.
- **Agents** — LLM configuration (model, provider, system prompt, inference params)

### UI Store

Local-only UI state. Which session is active, draft inference configs, panel visibility. Persisted to localStorage so it survives refresh, but would never sync — you wouldn't want another device to inherit your sidebar toggle or half-edited system prompt.

Created inside the React tree (`useCreateStore` + `useCreatePersister`). No schema, no DAOs, no operations layer. Components work directly with TinyBase primitives through thin hook wrappers in `lib/ui.ts` that hard-code the store ID.

**The mental test:** if I change this value, should I see it on another device? If yes → core store. If no → UI store.

### Provider

Both stores are registered as named stores: `storesById={{ core, ui }}`. There is no default store. Every hook call must specify which store it targets. The `CORE` constant and `lib/ui.ts` wrappers enforce this so you can't accidentally hit the wrong store.

## Data Flow

**Send message:**
1. Component reads draft config from UI store, calls `core.sendMessage(sessionId, text, config)`
2. Operations write user message + assistant placeholder + pending request (with config snapshot)
3. Runtime picks up pending request, streams response, writes partial updates
4. Components re-render reactively as cells change
5. On complete/error/abort: runtime updates request status

**Cancel:** Component calls `core.cancelRequest(sessionId)` → runtime aborts active controller → request marked cancelled

**Switch session:** Component writes `activeSessionId` to UI store → components re-render → stream in original session continues unaffected

**Draft config:** Each session has a row in the UI store's `drafts` table. Components subscribe to individual cells, so editing model doesn't re-render the system prompt field. Drafts initialize from the latest committed request config when a session is first opened, and are preserved across session switches.

## TinyBase Constraints

- **`useRow` instability with object cells:** TinyBase rebuilds nested values on read, triggering `useSyncExternalStore` infinite loops. Use `useCell` subscriptions for tables with object cells (messages). Use `useRow` for scalar-only tables.
- **Index gotcha:** Constant slice IDs like `'all'` must be passed as functions (`() => 'all'`), not string literals.
- **Named stores require explicit IDs:** Every hook must pass a store or indexes ID as the last argument. No default store exists in the Provider.

## Server

- `routes/api/stream.ts` — SSE endpoint. Wraps `streamText` in `createUIMessageStream` to catch provider errors and send them as error chunks over the stream protocol.

## Open Questions

- Streaming write volume: does replacing the entire message object cell on every token cause performance issues at scale?
- Schema evolution: how does TinyBase handle schema changes across app versions?
- Large conversations: at what point does message volume stress TinyBase or IndexedDB?
