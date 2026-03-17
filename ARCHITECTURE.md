# Architecture

Single TinyBase store persisted to IndexedDB. The runtime is an in-browser module, not tied to React's lifecycle.

## Layers

1. **Schema + Store** — TinyBase table/value definitions, store creation, persistence, indexes → `lib/core/data/stores.ts`, `lib/core/data/schemas.ts`
2. **DAOs + Codecs** — Type-safe read/write per entity. Codecs separate persisted row shape from domain types. Types inferred from decode functions → `lib/core/data/{agents,sessions,messages,requests}.ts`
3. **Domain Operations** — Named business actions (`createSession`, `sendMessage`, `regenerate`). Multi-entity writes. No transport, no streaming → `lib/core/operations.ts`
4. **Streaming Runtime** — Watches for pending requests, manages abort controllers, writes results back to store. Not aware of React → `lib/core/runtime.ts`, `lib/core/stream.ts`
5. **Core Singleton** — Composes data layer, operations, and runtime. Single entry point for React → `lib/core/index.ts`
6. **React Hooks** — Subscribe to store data, return decoded domain types. Colocated with DAOs.
7. **Components** — Read via hooks, write via Core operations. Never import runtime or transport → `components/chat/`

## Data Flow

**Send message:**
1. Component calls `core.sendAndStream(sessionId, text)`
2. Operations write user message + assistant placeholder + pending request
3. Runtime picks up pending request, streams response, writes partial updates
4. Components re-render reactively as cells change
5. On complete/error/abort: runtime updates request status

**Cancel:** Component calls `core.cancel(sessionId)` → runtime aborts active controller → request marked cancelled

**Switch session during stream:** UI writes `activeSessionId` value → components re-render → stream in original session continues unaffected

## Key Entities

- **Agents** — LLM configuration (model, provider, system prompt, inference params)
- **Sessions** — Conversation context, FK to agent
- **Messages** — Ordered per-session, stores full AI SDK UIMessage as object cell
- **Requests** — Signaling mechanism between UI and runtime (pending → streaming → completed/error/cancelled)

## TinyBase Constraints

- **`useRow` instability with object cells:** TinyBase rebuilds nested values on read, triggering `useSyncExternalStore` infinite loops. Use `useCell` subscriptions for tables with object cells (messages). Use `useRow` for scalar-only tables.
- **Index gotcha:** Constant slice IDs like `'all'` must be passed as functions (`() => 'all'`), not string literals.

## Server

- `routes/api/stream.ts` — SSE endpoint. Wraps `streamText` in `createUIMessageStream` to catch provider errors and send them as error chunks over the stream protocol.

## Open Questions

- Streaming write volume: does replacing the entire message object cell on every token cause performance issues at scale?
- Schema evolution: how does TinyBase handle schema changes across app versions?
- Large conversations: at what point does message volume stress TinyBase or IndexedDB?
