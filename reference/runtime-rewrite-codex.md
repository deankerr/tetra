# TinyBase Runtime Rewrite Design

This document describes the recommended design for a full rewrite of the TinyBase-based chat runtime.

It is intentionally a design document, not an implementation plan. It describes the target architecture, boundaries, data flow, and module responsibilities for a fresh start using what we learned from the prototype.

## Goals

- Keep TinyBase as the local reactive data layer.
- Preserve the strong parts of the prototype: local-first persistence, reactive UI, and a durable async work queue for AI actions.
- Replace ad hoc module boundaries with explicit architectural layers.
- Make type-safe data access a first-class concern in both non-React and React code.
- Make runtime behavior inspectable and testable without hiding business rules in React components or generic store helpers.

## Non-Goals

- This does not define implementation steps, milestones, or success criteria.
- This does not try to preserve compatibility with the prototype structure.
- This does not lock every naming decision up front.

## Core Position

The prototype proved that TinyBase can support the architecture we want.

The main issue is not capability. The issue is structure:

- persisted row types, domain types, and view types are not separated cleanly enough
- the public "command" layer mixes user intents and runtime queueing
- the runtime object owns too many responsibilities
- React reads are still more coupled to TinyBase internals than they should be

The rewrite should keep the same broad architectural bet while formalizing the boundaries properly.

## Architectural Summary

The rewritten system should have six layers:

1. Schema layer
2. Data codec layer
3. Data access layer
4. Domain operations layer
5. Runtime queue + handlers layer
6. App composition layer

React should sit on top of the data access and intent layers only. It should not know runtime internals, row patch structure, or transport details.

## High-Level Model

The app has three conceptually different things:

1. Persisted local data
2. User intents
3. Runtime work

Those should not be collapsed into one abstraction.

### Persisted Local Data

TinyBase stores hold persisted local state.

- `config` store: user-edited configuration
- `runtime` store: sessions, messages, queued work, runtime projections, and local UI values worth persisting

This two-store split should remain. It reflects a real difference in write pattern and ownership.

### User Intents

User intents are application-level actions such as:

- create a session
- select a session
- send a message
- retry the last assistant response
- cancel active work
- update agent settings

These are not the same thing as persisted queue items. The public API should be named accordingly, using terms like `intents` or `actions`, not `commands`.

### Runtime Work

Runtime work is durable asynchronous work processed by the local runtime:

- send
- retry
- cancel

This is closer to a local work queue than a general "command bus". The rewrite should use that mental model consistently.

## Recommended Module Layout

The current flat `lib/chat` layout should be replaced with a more explicit structure.

Suggested shape:

```text
src/lib/chat/
  app/
    container.ts
    bootstrap.ts
  data/
    schemas.ts
    store.ts
    indexes.ts
    ids.ts
    codecs/
      agent.ts
      session.ts
      message.ts
      work-item.ts
    queries/
      agents.ts
      sessions.ts
      messages.ts
      work-items.ts
    react/
      selectors.ts
      hooks.ts
  domain/
    agents.ts
    sessions.ts
    messages.ts
    work-queue.ts
    intents.ts
  runtime/
    runtime.ts
    dispatcher.ts
    recovery.ts
    context.ts
    transport.ts
    handlers/
      send.ts
      retry.ts
      cancel.ts
    text.ts
```

The exact directory names can change, but the layer boundaries should not.

## Layer Design

## 1. Schema Layer

The schema layer defines TinyBase schemas and store/index creation.

Responsibilities:

- TinyBase `TablesSchema` and `ValuesSchema`
- store IDs and index IDs
- store creation
- persister creation
- index definitions

This layer should not define domain guards, business rules, or runtime behavior.

The current `schemas.ts` and most of `store.ts` are directionally correct and should be the starting point for the rewrite.

## 2. Data Codec Layer

This layer is the boundary between persisted row shape and domain shape.

It should own:

- string literal unions and their parsers
- object cell parsers
- row decoders
- row encoders where required

This is where types like these belong:

- `AgentProvider`
- `SessionStatus`
- `WorkItemType`
- `WorkItemStatus`
- `StoredMessage`
- `SendPayload`
- `RetryPayload`
- `CancelPayload`

Important rule:

- schema-derived row types are the persisted shape
- codec return types are the domain shape

Those are not the same thing and should not be treated as interchangeable.

### Recommendation

Keep object cells for now, but formalize them through codecs rather than ad hoc guards.

This means:

- message rows can still store a whole `StoredMessage`
- work items can still store typed payload objects
- but every read must go through a decoder
- every write should go through an encoder or constructor

### Worth Investigating Later

- normalizing message content instead of storing whole message objects
- splitting work item payload fields into explicit cells if queryability becomes important

Those are design alternatives worth revisiting later, but they should not block the rewrite.

## 3. Data Access Layer

This layer should provide pure reads over TinyBase.

It should expose functions like:

- `readAgent(store, agentId)`
- `readSession(store, sessionId)`
- `readMessage(store, messageId)`
- `readWorkItem(store, workItemId)`
- `listSessionMessages(store, indexes, sessionId)`
- `listPendingWorkItems(store, indexes)`
- `getLatestAssistantMessage(store, indexes, sessionId)`

These functions should return decoded domain records, not raw rows.

### Critical Rule

This layer is read-only.

It should never patch rows, generate IDs, or decide policy.

## 4. Domain Operations Layer

This layer should own business-safe writes.

This is the biggest architectural change from the current prototype.

The rewrite should avoid exposing generic patch helpers like:

- `updateSession`
- `updateCommand`
- `insertCommand`

Those helpers are too low-level. They push invariants outward into callers.

Instead, domain operations should be explicit and policy-aware.

Examples:

- `createSession`
- `selectSession`
- `appendUserMessage`
- `enqueueSend`
- `enqueueRetry`
- `enqueueCancel`
- `startSessionStreaming`
- `finishSessionStreaming`
- `failSessionStreaming`
- `claimWorkItem`
- `completeWorkItem`
- `cancelWorkItem`
- `replaceAssistantMessage`
- `restoreRetriedMessage`

Each operation should own the row writes and any timestamp behavior it implies.

### Key Design Choice

This layer should be domain-first, not table-first.

That means it should expose useful application operations, not generic store wrappers.

## 5. Runtime Queue + Handlers Layer

The runtime should be split into explicit sub-modules.

### Dispatcher

The dispatcher should:

- watch the work queue
- identify pending items
- claim items
- enforce local concurrency rules
- dispatch each item to the correct handler

The dispatcher should not know AI SDK request details.

### Handlers

Each async work type should have its own handler.

- `send` handler
- `retry` handler
- `cancel` handler

Handlers should:

- read current domain state through the data access layer
- perform domain operations to prepare runtime state
- call the transport adapter when needed
- apply streamed updates through explicit domain operations
- complete, cancel, or fail work items through domain operations

### Recovery

Recovery should be its own module with an explicit policy.

At minimum it should define what happens to:

- work items in `processing`
- sessions marked `streaming`
- placeholder messages created by interrupted sends or retries

The current conservative prototype policy is acceptable as a starting point:

- interrupted work becomes inspectable failure, not resumed execution

### Transport

The transport adapter should wrap AI SDK and route calls.

It should be injected into the runtime rather than imported directly into runtime orchestration.

The runtime core should depend on an interface like:

```ts
interface ChatTransport {
  send(input: SendTransportInput): Promise<AsyncIterable<TransportMessage>>
  retry(input: RetryTransportInput): Promise<AsyncIterable<TransportMessage>>
}
```

This makes the runtime testable and keeps provider details out of orchestration code.

### Text Helpers

Message text extraction and session title generation should live outside the runtime class in a small helper module.

They are domain formatting rules, not runtime infrastructure.

## 6. App Composition Layer

The composition layer should create and wire everything together.

It should own:

- creating stores
- creating persisters
- creating indexes
- seeding default data
- creating middleware if used
- creating the runtime
- exposing the app container

The current singleton pattern should be reduced to a composition concern only.

The runtime itself should not be a singleton by design.

## React Design

React should depend on:

- data access hooks
- intent functions

It should not depend on:

- raw TinyBase row patch shape
- runtime queue semantics
- AI transport
- generic store mutation helpers

### Recommended React Pattern

React hooks should be derived from the same pure read functions used outside React.

That means:

- one source of truth for reading and decoding records
- a React adapter layer that subscribes and returns decoded results
- no duplicate reimplementation of domain parsing inside components

### TinyBase-Specific Constraint

The prototype revealed that TinyBase `useRow` is unsafe for rows containing `object` or `array` cells because snapshot identity can become unstable.

The rewrite should treat this as a hard architectural constraint.

Recommended response:

- do not let feature components call raw TinyBase hooks
- keep TinyBase hook usage inside a dedicated React selector layer
- prefer stable selectors built from `useCell` or custom `useSyncExternalStore` wrappers

### Worth Investigating

A custom selector layer may be preferable to TinyBase's stock React hooks for complex rows.

This is worth investigating because it may reduce boilerplate and centralize the `useRow` workaround.

## Data Model Recommendations

## Config Store

The config store should remain the home for user-edited, low-churn data.

Initially:

- agents

Likely future additions:

- reusable prompt blocks
- tool definitions
- saved presets

## Runtime Store

The runtime store should remain the home for high-churn local state.

Initially:

- sessions
- messages
- work items
- local UI values that are worth persistence

### Sessions

Sessions should remain a projection-oriented record.

Recommended fields:

- `agentId`
- `title`
- `status`
- `activeWorkItemId`
- `lastSeq`
- `errorMessage`
- timestamps

`status` is a projection, not the only source of truth. Domain operations should own it.

### Messages

Messages should continue to use an explicit per-session `seq`.

That was a good decision in the prototype and should remain.

Recommended fields:

- `sessionId`
- `seq`
- `role`
- `message`
- timestamps

### Work Items

Rename runtime "commands" to something closer to what they are.

Recommended names:

- `workItems`
- `queueItems`
- `operations`

`workItems` is the clearest option.

Recommended fields:

- `type`
- `status`
- `sessionId`
- `payload`
- `claimedBy`
- `claimedAt`
- `completedAt`
- `errorMessage`
- timestamps

The runtime should process work items, not "commands" in the broad architectural sense.

## Public API Design

The public API consumed by React should be an intent layer.

Suggested exports:

- `createSession`
- `selectSession`
- `sendMessage`
- `retryLastAssistantMessage`
- `cancelActiveWork`
- `updateAgent`

These should be thin entry points into domain operations.

They should not directly expose TinyBase patching behavior.

## Queue Model

The persisted async queue is the right overall pattern and should be retained.

Reasons:

- it decouples UI from runtime lifecycle
- it makes work inspectable
- it supports cancelation and recovery better than direct request hooks
- it gives the runtime a durable contract

However, the terminology and structure should be improved.

### Recommendation

Keep the queue model, but do not call the whole public architecture a "command bus".

More precise split:

- intents: user-facing application API
- work queue: persisted async runtime tasks
- dispatcher: runtime orchestrator
- handlers: task-specific execution modules

## Type Safety Strategy

This rewrite should use a three-level type model:

1. TinyBase schema-derived persisted row types
2. codec-derived domain record types
3. view-specific React model types where necessary

This matters because the prototype showed that trying to use one type everywhere leads either to duplication or to weak guarantees.

### Persisted Row Types

Derived from TinyBase schemas.

Use these for:

- row constructors
- low-level store writes
- encode/decode boundaries

### Domain Record Types

Derived from decoder return types.

Use these for:

- business logic
- runtime handlers
- intent validation
- query return values

### View Types

Only introduce view types when the UI needs a composed or derived shape.

Do not let raw components build these ad hoc.

## Runtime State Outside TinyBase

The runtime will still need some in-memory state that should not be persisted.

Examples:

- abort controllers
- active async tasks
- injected transport instance
- clock or ID generator services

That is acceptable.

But the runtime should minimize hidden business state. If something matters for inspection or recovery, prefer representing it in TinyBase.

## Concurrency and Multi-Tab Position

The prototype was effectively single-runtime per browser tab.

The rewrite should at least acknowledge this explicitly.

Recommended current position:

- support one active runtime per browser context
- do not promise safe multi-tab execution yet

Worth investigating later:

- leader election across tabs
- lease semantics that are more robust across runtime restarts

These are important, but they do not need to be solved in the rewrite unless multi-tab usage becomes a real product need.

## Testing Implications

This architecture is designed to be testable in layers.

The most important requirement is injection of environment-dependent services:

- transport
- clock
- ID generation

If handlers and domain operations depend on interfaces rather than globals, they can be tested as pure behavior around TinyBase stores.

## Recommended Starting Opinions

These are the design choices I recommend adopting unless we find a reason not to:

- keep the two-store split
- keep per-session `seq` ordering
- keep whole-message storage for now
- keep a durable async work queue
- rename runtime "commands" to `workItems`
- rename the public `commands` module to `intents`
- replace generic patch helpers with explicit domain operations
- split runtime orchestration, handlers, recovery, and transport into separate modules
- centralize React data access in a selector layer
- keep middleware and schematizers optional, not foundational

## Alternative Directions Worth Discussion

These are not the recommended default, but they are reasonable alternatives worth discussing later.

### Alternative A: Normalize Messages More Aggressively

Instead of storing a whole `StoredMessage` object, store message content in more explicit cells or related tables.

Potential benefit:

- clearer querying and possibly lower write churn

Potential cost:

- much higher complexity up front

### Alternative B: Use Middleware For More Invariants

Use TinyBase middleware to enforce more store-level correctness automatically.

Potential benefit:

- centralized guardrails

Potential cost:

- more implicit behavior and weaker readability

### Alternative C: Replace TinyBase React Hooks With A Custom Selector Runtime

Build a thin custom React adapter directly on top of TinyBase listeners.

Potential benefit:

- better control over snapshot stability and selector ergonomics

Potential cost:

- more infrastructure owned by the app

This option is worth serious consideration because of the `useRow` behavior discovered in the prototype.

## Final Recommendation

The rewrite should keep the TinyBase architecture, but formalize it around these principles:

- TinyBase is the persisted local state layer
- codecs separate persisted shape from domain shape
- domain operations own business-safe writes
- a durable work queue drives async runtime behavior
- runtime orchestration is split from runtime handlers
- React reads through a dedicated selector layer
- composition lives at the edge

In short:

keep the architectural bet, rewrite the structure.
