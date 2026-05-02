# Architecture

## Runtime

`@tetra/runtime` is the core package. It runs in any JS environment — browser, server, service worker. No React dependency.

`createRuntime({ runtimeId, getOpenRouterApiKey })` returns a flat object: store, indexes, DAOs, operations, and lifecycle methods (`start` / `stop`). Creation is synchronous. The consumer wires persistence and sync, then calls `start()` to begin processing requests.

```
createRuntime()  →  wire persistence/sync  →  runtime.start()
```

The engine (reactive request processing) and transport (LLM API integration) are internal. Consumers interact through operations (`sendMessage`, `createSession`, etc.) and DAOs (`sessions.get()`, `messages.listBySession()`, etc.). The store is exposed for persistence and sync wiring only.

### Reactive Engine

The engine watches the requests table via TinyBase listeners. When a pending request targeted to this `runtimeId` appears, it streams the response via the transport and writes chunks back to the store. Cancellation works by writing a status change — the engine detects it and aborts the in-flight stream.

This is request-based signaling: the UI (or any consumer) writes a request row, the engine picks it up. They never call each other directly.

Requests use `targetRuntimeId`, not a claim lease. A co-located consumer can create work for its own long-lived runtime while every synced peer remains free to observe the same rows and streamed updates.

### Lifecycle

- `start()` — attaches listeners, recovers stale requests from previous sessions, begins processing. Idempotent.
- `stop()` — removes listeners, aborts in-flight streams.
- Stale recovery uses `runtimeId` to identify targeted requests that were interrupted by a crash or restart.

## TinyBase as Synchronization Boundary

TinyBase is the synchronization boundary between consumers and the runtime. In the browser, React and the engine never call each other — both read from and write to TinyBase.

```
Consumer (React, server, etc.)  ◄──►  TinyBase Store  ◄──►  Engine
```

This decouples streams from navigation: a stream survives unmount, session switching, and remount without any handshake. The consumer shows whatever state is in the store when it reads — no initialization protocol needed.

## Stores

### Core Store

Domain data. Sessions, messages, requests, agents. Typed schema (`with-schemas`). MergeableStore for sync capability.

**Entities:**

- **Sessions** — Conversation context
- **Messages** — Ordered per-session, stores AI SDK UIMessage parts
- **Requests** — Signaling between consumer and engine (pending → streaming → completed/error/cancelled). Each request snapshots its inference config at creation time.
- **Agents** — LLM configuration (model, provider, system prompt, inference params)

Structured in layers:

1. **Schema + Store** — Table/value definitions, store creation, indexes
2. **DAOs + Codecs** — Type-safe read/write per entity. Codecs separate persisted row shape from domain types. Types inferred from decode functions.
3. **Operations** — Named business actions (`createSession`, `sendMessage`, `regenerate`). Multi-entity writes. Pure domain logic.
4. **Engine** — Watches for pending requests, manages abort controllers, writes streamed responses. Internal to the runtime.

### UI Store (web app only)

Local-only state. Active session, draft inference configs, panel visibility. Persisted to localStorage. Never synced — you wouldn't want another device to inherit your sidebar toggle or half-edited system prompt.

No schema, no DAOs. Components work directly with TinyBase primitives through thin hook wrappers that hard-code the store ID.

**The mental test:** if I change this value, should I see it on another device? If yes → core store. If no → UI store.

### Provider (web app)

Both stores are registered as named stores. No default store — every hook call specifies which store it targets.

## Data Flow

**Send message:**

1. Consumer reads config, calls `runtime.sendMessage(sessionId, text, config)`
2. Operations write user message + assistant placeholder + pending request (with config snapshot)
3. Engine picks up pending request, streams response, writes partial updates
4. Consumers re-render/react as cells change
5. On complete/error/abort: engine updates request status

**Cancel:** Consumer calls `runtime.cancelRequest(sessionId)` → engine aborts active controller → request marked cancelled

**Switch session (web app):** Component writes `activeSessionId` to UI store → components re-render → stream in original session continues unaffected

## Inference

Inference uses `streamText()` from the AI SDK with the OpenRouter provider. The transport is internal to the runtime, but provider secrets are supplied by the host through `getOpenRouterApiKey` at stream time. Secrets are local host state, not syncable core-store data.

Inference can run in any environment where the runtime runs. The web app runs it client-side; a server could run it identically.

## Persistence

Consumers bring their own persisters. The runtime creates the store; the consumer decides how to persist and sync it.

- **Web app** — OPFS persistence + WebSocket sync to server
- **Sync server** — File persistence + WebSocket sync to clients

## TinyBase Constraints

- **Index gotcha:** Constant slice IDs like `'all'` must be passed as functions (`() => 'all'`), not string literals.
- **Type casts:** TinyBase's `with-schemas` generics require `as unknown as` casts at initialization boundaries. This is a known rough edge.

## Open Questions

- Streaming write volume: does replacing the entire message object cell on every token cause performance issues at scale?
- Schema evolution: how does TinyBase handle schema changes across app versions?
- Large conversations: at what point does message volume stress TinyBase or the persistence layer?
