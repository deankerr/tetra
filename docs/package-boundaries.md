# Package Boundaries

This note captures the current intention for splitting the early runtime into deeper monorepo packages. It is not an ADR yet. The goal is to give the refactor a direction while leaving room to adjust the boundaries as the code starts to move.

## Motivation

Tetra uses TinyBase as both database and conduit. Clients write intentions into the store and receive reactive updates as work progresses. The inference loop is one participant attached to that store, not the store itself.

The original `@tetra/runtime` package mixed those ideas:

- TinyBase schema, indexes, codecs, and data access
- domain commands such as session creation and message sending
- reactive framework hooks in the web app
- inference request execution
- provider-specific inference transport
- host-local secrets

That made the prototype easy to start, but the conceptual boundary now feels muddy. We want deep modules: small public interfaces that hide meaningful complexity, with package boundaries expressing the domain model clearly.

## Intended Split

### `@tetra/store`

Owns the durable model and TinyBase conduit.

Responsibilities:

- TinyBase schema, indexes, and store creation
- codecs and domain types inferred from those codecs
- queries and DAOs for sessions, messages, and requests
- commands such as `createSession`, `sendMessage`, `regenerate`, and `cancelRequest`
- request rows as durable intentions
- exposing TinyBase handles for persistence and sync wiring

Non-responsibilities:

- React, Svelte, or any UI framework
- OpenRouter or provider-specific transport
- streaming execution loops
- abort controller ownership
- provider secrets

Sketch:

```ts
const tetra = createTetraStore()

tetra.commands.sendMessage({
  config,
  sessionId,
  targetExecutorId,
  text,
})

tetra.queries.messages.listBySession(sessionId)
tetra.tinybase.store
tetra.tinybase.indexes
```

### `@tetra/store-react`

Owns React bindings for the Tetra store.

This is framework-specific, but it is still part of the store interface rather than one app's local glue. TinyBase's reactive data access is a major reason to use TinyBase, so the adapter should preserve direct, ergonomic subscriptions without leaking raw row decoding into application components.

Responsibilities:

- provider wiring for a `TetraStore`
- React hooks expressed in domain language
- narrow reactive subscriptions over TinyBase rows, cells, slices, and values
- hiding `tinybase/ui-react/with-schemas` casts and store IDs

Non-responsibilities:

- app-specific state such as panel visibility or selected route
- provider transport
- inference execution

Sketch:

```tsx
<TetraStoreProvider tetra={tetra}>
  <App />
</TetraStoreProvider>
```

```ts
const tetra = useTetra()

const sessionIds = tetra.sessions.useIdsByRecency()
const messageIds = tetra.messages.useIdsBySession(sessionId)
const activeRequest = tetra.requests.useActiveForSession(sessionId)
```

Future framework adapters, such as Svelte support, should depend on `@tetra/store` in the same way. The core store should not know about those frameworks.

### `@tetra/inference-runtime`

Owns execution of inference requests targeted to an executor.

Responsibilities:

- watching a `TetraStore` for pending requests
- filtering requests by executor identity
- resolving host-local secrets at execution time
- converting message history to model input
- streaming model output back into the store
- maintaining in-flight abort controllers
- recovering interrupted targeted requests

Non-responsibilities:

- schema ownership
- UI framework integration
- persistence and sync setup
- durable storage of secrets

Sketch:

```ts
const executor = createInferenceRuntime({
  executorId,
  getOpenRouterApiKey,
  tetra,
})

executor.start()
```

## Naming Direction

The current word `runtime` is overloaded. The store is the shared world state; the inference loop is an executor attached to that world state.

Preferred terms:

- `executorId` for the identity of a request-processing participant
- `targetExecutorId` for a request's intended executor
- `inference runtime` for the package that hosts the execution loop
- `store` for the TinyBase-backed model and conduit

The package split uses `targetExecutorId` for new request rows.

## Composition

Applications compose the packages explicitly:

```ts
const tetra = createTetraStore()

await wirePersistence(tetra.tinybase.store)
await wireSync(tetra.tinybase.store)

const executor = createInferenceRuntime({
  executorId,
  getOpenRouterApiKey,
  tetra,
})

executor.start()
```

This keeps clients decoupled from inference execution. A client writes intentions into the store and reacts to updates. The executor observes the same store and fulfills requests targeted to it.

## Expected Adjustment

This split is a working hypothesis. While moving code, we should pay attention to friction:

- If a package becomes a bag of pass-through exports, deepen or merge it.
- If callers need raw TinyBase too often, improve the store interface.
- If framework adapters duplicate too much logic, move shared reactive selectors into `@tetra/store`.
- If executor targeting becomes more complex than local ownership, revisit whether requests need leases, capabilities, or explicit execution policies.
