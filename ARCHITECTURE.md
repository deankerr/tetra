# Architecture

## Store

`@tetra/store` is the TinyBase model package. It owns the schema, indexes, decoders, and store creation. It runs in any JS environment. No React dependency.

`createTetraStore()` returns TinyBase integration handles and a transaction helper. Creation is synchronous. The web app persists `tetra.tinybase.store` to OPFS.

```
createTetraStore()  →  wire OPFS persistence  →  create runtime
```

Consumers read from TinyBase directly using the shared schema, indexes, and decoders. React uses TinyBase hooks; runtime uses the same store/index handles imperatively.

## Runtime

`@tetra/runtime` owns Tetra processes. It receives a `TetraStore` plus an inference adapter, then exposes user-intention commands such as `createSession`, `updateSessionConfig`, and `sendMessage`.

`sendMessage` is the core turn process. It writes the user message, assistant placeholder, and request/run row, then starts inference outside the React lifecycle and streams snapshots back into the store.

Requests are persisted run records, not the primary execution trigger.

### Lifecycle

- `start()` — recovers stale requests after persistence loads.
- `stop()` — aborts in-flight streams.
- Stale recovery marks pending or streaming requests as errored after an app restart.

## Inference

`@tetra/inference` owns the AI SDK/OpenRouter adapter. It has no TinyBase dependency. Given provider credentials, config, messages, and an abort signal, it yields AI SDK `UIMessage` snapshots.

Provider secrets are supplied by the host through `getOpenRouterApiKey` at stream time. Secrets are local host state, not persisted domain data.

## TinyBase as Reactive State

TinyBase is the durable reactive state shared by React and the runtime. React calls runtime commands for user intentions and reads TinyBase through hooks. The runtime writes process state back to TinyBase.

```
React actions  ──►  Runtime  ──►  Inference
React reads    ◄──  TinyBase  ◄──  Runtime writes
```

This decouples streams from navigation: a stream survives unmount, session switching, and remount without any handshake. The consumer shows whatever state is in the store when it reads.

## Stores

### Core Store

Domain data. Sessions, messages, requests, agents. Typed schema (`with-schemas`). Persisted to OPFS by the web app.

**Entities:**

- **Sessions** — Conversation context and current inference config
- **Messages** — Ordered per-session, stores AI SDK UIMessage parts
- **Requests** — Persisted run records (pending → streaming → completed/error). Each request snapshots its inference config at creation time.
- **Agents** — LLM configuration (model, provider, system prompt, inference params)

Structured internally:

1. **Schema + Store** — Table/value definitions, store creation, indexes
2. **Decoders** — Shared row-to-domain decoding for React and runtime
3. **Utilities** — ID generation, default config, and config validation

Session config lives in the core store because it is conversation state. Requests keep config snapshots for historical execution, but the current editable config belongs to the session.

### Provider (web app)

The store is registered as a named TinyBase store. No default store — every hook call specifies which store it targets.

## Data Flow

**Send message:**

1. Consumer calls `runtime.commands.sendMessage({ sessionId, text })`
2. Runtime writes user message + assistant placeholder + request/run row (with config snapshot)
3. Runtime calls the inference adapter and writes partial updates
4. Consumers re-render/react as cells change
5. On complete/error/interruption: runtime updates request status

**Switch session (web app):** Component writes `activeSessionId` to the store → components re-render → stream in original session continues unaffected

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
