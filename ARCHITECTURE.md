# Architecture

## Store

`@tetra/store` is the core data package. It owns the TinyBase schema, indexes, codecs, domain queries, and commands. It runs in any JS environment. No React dependency.

`createTetraStore()` returns a store object with commands, queries, TinyBase integration handles, and internal data access used by executor packages. Creation is synchronous. The web app persists `tetra.tinybase.store` to OPFS.

```
createTetraStore()  →  wire OPFS persistence  →  attach inference runtime
```

Consumers interact through commands (`sendMessage`, `createSession`, etc.) and queries (`sessions.get()`, `messages.listBySession()`, etc.). The raw TinyBase store and indexes are exposed for persistence and reactive framework adapters.

## Inference Runtime

`@tetra/inference-runtime` attaches to a `TetraStore`, watches request rows, and runs local browser inference for pending requests.

The inference runtime watches the requests table via TinyBase listeners. When a pending request appears, it streams the response via the transport and writes chunks back to the store.

This is request-based signaling: the UI writes a request row, and the inference runtime picks it up. React and inference still do not call each other directly.

### Lifecycle

- `start()` — attaches listeners, recovers stale requests, begins processing. Idempotent.
- `stop()` — removes listeners and aborts in-flight streams.
- Stale recovery marks pending or streaming requests as errored after an app restart.

## TinyBase as Process Boundary

TinyBase is the process boundary between React and inference. In the browser, React and the inference runtime never call each other — both read from and write to TinyBase.

```
React  ◄──►  TinyBase Store  ◄──►  Inference Runtime
```

This decouples streams from navigation: a stream survives unmount, session switching, and remount without any handshake. The consumer shows whatever state is in the store when it reads — no initialization protocol needed.

## Stores

### Core Store

Domain data. Sessions, messages, requests, agents. Typed schema (`with-schemas`). Persisted to OPFS by the web app.

**Entities:**

- **Sessions** — Conversation context and current inference config
- **Messages** — Ordered per-session, stores AI SDK UIMessage parts
- **Requests** — Signaling between consumer and engine (pending → streaming → completed/error). Each request snapshots its inference config at creation time.
- **Agents** — LLM configuration (model, provider, system prompt, inference params)

Structured internally:

1. **Schema + Store** — Table/value definitions, store creation, indexes
2. **DAOs + Codecs** — Type-safe read/write per entity. Codecs separate persisted row shape from domain types. Types inferred from decode functions.
3. **Commands** — Named business actions (`createSession`, `sendMessage`). Multi-entity writes. Pure domain logic.
4. **Inference internals** — Narrow data access used by packages such as `@tetra/inference-runtime`.

Session config lives in the core store because it is conversation state. Requests keep config snapshots for historical execution, but the current editable config belongs to the session.

### Provider (web app)

The store is registered as a named TinyBase store. No default store — every hook call specifies which store it targets.

## Data Flow

**Send message:**

1. Consumer calls `tetra.commands.sendMessage({ sessionId, text })`
2. Commands write user message + assistant placeholder + pending request (with config snapshot)
3. Inference runtime picks up the pending request, streams response, writes partial updates
4. Consumers re-render/react as cells change
5. On complete/error/interruption: inference runtime updates request status

**Switch session (web app):** Component writes `activeSessionId` to the store → components re-render → stream in original session continues unaffected

## Inference

Inference uses `streamText()` from the AI SDK with the OpenRouter provider. The transport is internal to `@tetra/inference-runtime`, but provider secrets are supplied by the host through `getOpenRouterApiKey` at stream time. Secrets are local host state, not syncable core-store data.

Inference currently runs client-side in the web app.

## Persistence

`@tetra/store` creates the store. The web app persists it to OPFS with TinyBase's browser persister.

## TinyBase Constraints

- **Index gotcha:** Constant slice IDs like `'all'` must be passed as functions (`() => 'all'`), not string literals.
- **Type casts:** TinyBase's `with-schemas` generics require `as unknown as` casts at initialization boundaries. This is a known rough edge.

## Open Questions

- Streaming write volume: does replacing the entire message object cell on every token cause performance issues at scale?
- Schema evolution: how does TinyBase handle schema changes across app versions?
- Large conversations: at what point does message volume stress TinyBase or the persistence layer?
