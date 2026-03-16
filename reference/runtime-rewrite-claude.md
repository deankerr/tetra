# Runtime Rewrite Design

Full rewrite of `lib/chat`. Core principle: **orchestration code never touches TinyBase directly.** All store access flows through a data access layer that owns reads, writes, subscriptions, and type narrowing.

## Module Map

```
lib/chat/
  data/
    stores.ts          — Store creation, persistence, indexes
    schemas.ts         — TinyBase schemas, store IDs, defaults
    sessions.ts        — Session data access object
    messages.ts        — Message data access object
    commands.ts        — Command data access object
    agents.ts          — Agent data access object
    ui-state.ts        — UI values (activeSessionId, etc.)
    react.ts           — React hook bindings for all DAOs
  commands/
    types.ts           — Command type map, payload shapes, discriminated union
    dispatch.ts        — Type-safe command dispatch (UI-facing)
    processor.ts       — Command bus: watch, claim, route
    handlers/
      send.ts          — Prepare + finalize send
      retry.ts         — Prepare + finalize retry
      cancel.ts        — Abort coordination
  streaming/
    executor.ts        — AI SDK streaming, abort, message writing
    transport.ts       — Transport configuration
  runtime.ts           — Lifecycle: init, start, stop, recover
  app.ts               — Public API surface (thin)
```

## Data Access Layer

### Principle

Every entity gets a **data access object (DAO)** that encapsulates all TinyBase operations for that entity. The DAO is the only code that imports TinyBase types or calls store methods. Everything above it works with domain types.

```ts
// sessions.ts — example DAO shape

export type SessionRecord = {
  id: string
  agentId: string
  status: SessionStatus
  title: string
  lastSeq: number
  activeCommandId: string
  errorMessage: string
  createdAt: number
  updatedAt: number
}

export type SessionPatch = {
  status?: SessionStatus
  title?: string
  lastSeq?: number
  activeCommandId?: string
  errorMessage?: string
}

export type SessionDAO = {
  get: (id: string) => SessionRecord | null
  getOrThrow: (id: string) => SessionRecord
  listIds: () => string[]
  listIdsByRecency: () => string[]
  getStreamingIds: () => string[]
  insert: (id: string, agentId: string) => void
  update: (id: string, patch: SessionPatch) => void
  setStatus: (id: string, status: SessionStatus, patch?: SessionPatch) => void
}
```

The DAO is constructed with store + indexes references at init time. After construction, consumers only see the DAO interface — no store types leak out.

```ts
export const createSessionDAO = (
  store: RuntimeStore,
  indexes: RuntimeIndexes,
): SessionDAO => ({
  get: (id) => {
    if (!store.hasRow('sessions', id)) return null
    return toSessionRecord(id, store.getRow('sessions', id))
  },
  // ...
})
```

### Type Narrowing

Type narrowing happens once, inside the DAO. `toSessionRecord` converts TinyBase's broad `string` into `SessionStatus`, `toMessageRecord` validates the stored `object` cell into `StoredMessage`, etc. Code outside the DAO never sees raw TinyBase row types.

DAOs own the normalizers. If a stored value doesn't match a known enum, the DAO either returns a default or `null` — the decision is per-entity, made in one place.

### Timestamp Management

DAOs auto-inject `updatedAt` on every write. No caller passes timestamps. This eliminates the three copies of `now()` and the inconsistency risk.

`createdAt` is set once at insert time by the DAO. Never updated.

### Transactions

DAOs expose individual operations. Transactions that span multiple entities are handled by the caller using a `transaction` function exposed from the data layer:

```ts
// data/stores.ts
export type DataLayer = {
  sessions: SessionDAO
  messages: MessageDAO
  commands: CommandDAO
  agents: AgentDAO
  uiState: UIStateDAO
  transaction: (fn: () => void) => void
}
```

The `transaction` wrapper calls `runtimeStore.transaction()` internally. The caller doesn't know or care that transactions are a TinyBase concept.

**Open question:** Should `transaction` be the only cross-entity coordination, or should there be named compound operations (e.g. `createSessionWithDefaults`)? Leaning toward keeping transactions explicit — compound operations tend to accumulate business logic that should live in command handlers, not the data layer.

### React Bindings

React hooks wrap DAOs with TinyBase's `ui-react` subscriptions. One hook per DAO query that the UI needs:

```ts
// data/react.ts
export const useSession = (id: string): SessionRecord | null => { ... }
export const useSessionIds = (): string[] => { ... }
export const useMessage = (id: string): MessageRecord | null => { ... }
export const useSessionMessageIds = (sessionId: string): string[] => { ... }
export const useActiveSessionId = (): string => { ... }
```

For tables with object cells (`messages.message`, `commands.payload`), hooks use per-cell subscriptions and reconstruct the record. For tables without object cells (`sessions`, `agents`), hooks use `useRow` directly. Both paths go through the same DAO `toRecord` transformer.

When TinyBase fixes the `useRow` instability with object cells, collapse everything to `useRow` + transform. The hooks' public interface doesn't change.

**Alternative worth investigating:** A single `useRecord(dao, id)` generic hook that determines subscription strategy from the schema. More DRY, but TinyBase's `ui-react` hooks have specific type signatures that may resist generalization.

## Command System

### Type Map

Commands are a closed discriminated union. The type map is the single source of truth for "what commands exist and what data they carry."

```ts
// commands/types.ts

export type CommandDefs = {
  send: {
    assistantMessageId: string
    sourceMessageId: string
  }
  retry: {
    assistantMessageId: string
    replacedMessageId: string
  }
  cancel: {
    targetCommandId: string
  }
}

export type CommandType = keyof CommandDefs

export type Command<T extends CommandType = CommandType> = {
  id: string
  sessionId: string
  type: T
  payload: CommandDefs[T]
  status: CommandStatus
  // ... audit fields
}
```

Adding a new command type means adding one entry to `CommandDefs`. The dispatcher, processor, and handler routing all derive from this map.

### Dispatch (UI → Store)

Dispatch is the public API for UI code. Type-safe, synchronous store writes.

```ts
// commands/dispatch.ts

export type CommandDispatch = {
  send: (sessionId: string, text: string) => string | null
  retry: (sessionId: string) => string | null
  cancel: (sessionId: string) => string | null
}
```

Each method validates preconditions (session exists, not streaming, etc.), creates the appropriate records (user message + command for send, just command for retry/cancel), and returns the command ID or null.

Dispatch methods receive the `DataLayer`, not stores. They call `data.sessions.get()`, `data.messages.insert()`, `data.commands.insert()`, etc.

Dispatch replaces the current `commands.ts` module. The name change avoids collision with the TinyBase command rows themselves.

### Processor (Store → Handlers)

The processor is the command bus. It watches for pending commands, claims them, and routes to handlers.

```ts
// commands/processor.ts

export type CommandProcessor = {
  start: () => void
  stop: () => void
}
```

Internally:
- Subscribes to the commands table via store listener
- Debounces sweeps to microtask (same pattern as current)
- Claims commands with a runtime ID
- Routes by `command.type` to the matching handler
- Manages `activeSessions` set for concurrency control
- Wraps each handler in try/catch/finally for status transitions

The processor does NOT contain command logic. It's pure orchestration: watch → claim → delegate → finalize.

**Handler contract:**

```ts
type CommandHandler<T extends CommandType> = (
  command: Command<T>,
  ctx: HandlerContext,
) => Promise<void>
```

Where `HandlerContext` provides what handlers need without exposing the bus internals:

```ts
type HandlerContext = {
  data: DataLayer
  streaming: StreamExecutor
  signal: AbortSignal
}
```

The processor creates the `AbortController`, passes `signal` to the handler, and owns abort lifecycle. Handlers never create their own controllers.

### Handlers

Each handler is a function, not a method on a class.

**Send handler:**
1. Read session + agent config from `ctx.data`
2. Build message history from `ctx.data.messages`
3. Insert assistant placeholder
4. Update session status
5. Call `ctx.streaming.stream(...)` with config + signal
6. On success: finalize command, set session idle
7. On abort: clean up empty placeholder, mark canceled

**Retry handler:**
1. Read session + agent + history from `ctx.data`
2. Validate target message is latest assistant
3. Snapshot the replaced message for rollback
4. Delete old, insert new placeholder at same seq
5. Call `ctx.streaming.stream(...)` — same streaming path as send
6. On success: finalize
7. On abort/error: restore original message

**Cancel handler:**
1. Look up target command's abort controller (passed via context or registry)
2. Call abort
3. Finalize cancel command

Send and retry share the streaming call. The difference is preparation (what history, what placeholder) and cleanup (abort-send deletes placeholder; abort-retry restores original). This replaces the current 80% duplication between `handleSend` and `handleRetry`.

## Streaming

### Executor

The stream executor owns AI SDK interaction. It doesn't know about commands, sessions, or TinyBase.

```ts
// streaming/executor.ts

export type StreamConfig = {
  messages: StoredMessage[]
  assistantMessageId: string
  agent: AgentRecord
  sessionId: string
  signal: AbortSignal
  trigger: 'submit-message' | 'regenerate-message'
  onUpdate: (message: StoredMessage) => void
}

export type StreamExecutor = {
  stream: (config: StreamConfig) => Promise<StreamResult>
}

export type StreamResult =
  | { status: 'complete' }
  | { status: 'aborted' }
  | { status: 'error'; error: Error }
```

The executor:
1. Calls transport with agent config + messages
2. Iterates the UI message stream
3. Calls `onUpdate` for each partial message (handler uses this to write to store via DAO)
4. Returns a discriminated result — no thrown errors for expected abort/failure

The `onUpdate` callback is how the streaming layer writes to the store without importing TinyBase. The handler passes `(msg) => data.messages.update(id, { message: msg })`.

**Why `onUpdate` callback instead of returning the stream?** The handler needs to write each partial update to TinyBase for reactive UI. Returning an async iterable would push that loop into every handler. The callback centralizes the "stream → store" bridge.

### Transport

Transport wraps `DefaultChatTransport` from AI SDK. Created at init, configured once.

```ts
// streaming/transport.ts
export const createTransport = () =>
  new DefaultChatTransport<UIMessage>({ api: '/api/chat' })
```

Separated from the executor so transport config (API URL, headers) can evolve independently.

## Runtime Lifecycle

```ts
// runtime.ts

export type Runtime = {
  initialize: () => Promise<void>
  start: () => void
  stop: () => void
  data: DataLayer
  dispatch: CommandDispatch
}
```

`initialize`:
1. Create stores, persisters, indexes
2. Start auto-persisting (await IndexedDB load)
3. Seed default data if needed
4. Recover interrupted commands/sessions

`start`:
1. Create stream executor with transport
2. Create command processor with data layer + executor
3. Start processor (begins watching commands table)

`stop`:
1. Stop processor
2. (Future: stop persisters, cleanup)

### Recovery

Recovery runs during `initialize`, after persistence loads but before the processor starts. It:
1. Finds all `processing` commands → marks them `error`
2. Finds all `streaming` sessions → marks them `error`
3. Logs what it recovered (structured logging)

Same behavior as current, but isolated as a function that receives the data layer.

## Public API

```ts
// app.ts — thin surface

export const createChatApp = (): Runtime => {
  // Wire everything together, return Runtime
}
```

No singleton. The caller (React `PrototypeApp` component) creates and owns the instance. If testing needs a second instance, it creates one.

The React component tree receives the runtime via context or TinyBase's Provider (for store subscriptions). Command dispatch is accessed via a hook or imported directly.

**Open question:** Should dispatch functions be importable standalone (current pattern, convenient but couples to a specific instance) or accessed through context/hook (`useDispatch().send(...)`)? Standalone is simpler for prototype speed. Context is cleaner for testing and multi-instance. Leaning toward context since we're rewriting anyway.

## Design Properties

**TinyBase is an implementation detail.** Nothing above the `data/` layer imports from TinyBase. If TinyBase is replaced, only `data/` changes. Orchestration, commands, streaming, and React hooks keep their interfaces.

**Type safety is enforced at the boundary.** DAOs narrow TinyBase's broad types on read and validate on write. Everything above works with domain types (`SessionStatus`, `CommandDefs`, `StoredMessage`).

**The command bus is typed end-to-end.** `CommandDefs` → `dispatch.send()` → processor routes by type → handler receives `Command<'send'>` with typed payload. No runtime type guards needed in handlers.

**Streaming is a service, not embedded logic.** The executor is injected into command handlers via context. It can be mocked, swapped, or extended (e.g., adding tool execution) without touching the command system.

**Handlers are functions, not methods.** Each handler is independently testable. Preparation and cleanup logic is explicit and separate from the streaming call.
