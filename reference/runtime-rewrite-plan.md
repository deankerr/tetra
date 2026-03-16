# Runtime Rewrite — Implementation Outline

Loose ordering. Each section is a design unit that can be built and verified before moving on.

Single store. No work queue table for now — runtime calls AI directly. Add durable queue when retry/cancel/recovery needs justify it.

## 1. Data Layer (done)

Single TinyBase store with DAOs for agents, sessions, messages. Zod codecs for object cells. Types inferred from decode functions. `DataLayer` composes DAOs with store access and persistence.

**Exists in:** `lib/core/data/`

**Remaining:** ~~Remove `activeWorkItemId` from sessions schema~~ Done. Consider whether `status` and `errorMessage` belong on the session row at all, or if they should be computed by the runtime and exposed as ephemeral values.

## 2. UI State

TinyBase `Values` for app-level state that should survive navigation but isn't entity data.

- `activeSessionId` (already in schema)
- Future: `sidebarOpen`, per-session input drafts

**Design choice:** Keep in the same store as runtime data. Separate store is premature — a single `Values` namespace is simpler and we can split later if needed.

**DAO:** A small `UIStateDAO` or just direct value accessors on the `DataLayer`. No codec needed — these are plain scalars.

## 3. Domain Operations (done)

Named functions for multi-entity writes. This is where business logic lives — not in DAOs (too low-level) and not in components (too coupled).

Examples for the initial chat loop:

- `createSession(data, agentId)` — insert session, set active
- `selectSession(data, sessionId)` — validate exists, set active
- `sendMessage(data, sessionId, text)` — insert user message, bump seq, return message id
- `updateAgentConfig(data, agentId, patch)` — validate + write

These accept `DataLayer` (or a subset) and return results. No side effects beyond store writes. No transport, no streaming.

**Exists in:** `lib/core/operations.ts` — flat file, not a domain folder yet. Also includes `ensureDefaults()` for startup seeding and `getMessageText()` helper.

**Codex idea worth adopting:** "domain-first, not table-first" — operations are named for what the user is doing, not what table is changing. `sendMessage` not `insertMessageAndBumpSeq`.

## 4. Streaming Runtime (done)

Minimal runtime that streams AI responses into TinyBase. No queue, no dispatcher, no recovery — just a function that takes a session, calls the API, and writes incremental updates.

```
streamResponse(data, sessionId, transport, signal?) → Promise<void>
```

Responsibilities:
- Read agent config + message history from `data`
- Set session status to `streaming`
- Create assistant placeholder message
- Call transport, iterate stream, write partial updates to message
- On complete: set session idle
- On error: set session error, write error message
- On abort (if signal provided): clean up placeholder, set idle

**No queue dispatch.** The caller (React action or future dispatcher) decides when to stream. This function is the pure execution path.

**Transport:** Injected, not imported. `ChatTransport` interface with one method: `stream(config) → Promise<AsyncIterable<UIMessage>>`. `createDefaultTransport()` wraps AI SDK's `DefaultChatTransport` + `readUIMessageStream`.

**Exists in:** `lib/core/stream.ts` — single file with transport interface, default adapter, and `streamResponse()`. Kept flat instead of `runtime/` folder.

**Type decision:** Messages use `UIMessage` from AI SDK as the canonical type throughout the app. Zod validates structural integrity on read from persistence, then casts to `UIMessage`. The DAO boundary handles the `UIMessage` interface → TinyBase `AnyObject` conversion via spread (`toObjectCell`).

## 5. React — Data Hooks

React hooks that subscribe to store data and return decoded domain types. This is the read path for components.

**Pattern:** Hooks call DAO decode logic under the hood, subscribed via TinyBase's `ui-react` hooks. Components get `Session | null`, `Message | null`, `Agent | null` — never raw rows.

For tables with object cells (messages): per-cell subscriptions reconstructed into domain records. For scalar-only tables (sessions, agents): `useRow` + decode.

When TinyBase fixes the `useRow` instability, collapse both paths.

**Hooks needed for basic chat:**

- `useActiveSessionId()` — value subscription
- `useSessionIds()` — index subscription (by recency)
- `useSession(id)` — row subscription → `Session | null`
- `useSessionMessageIds(sessionId)` — index subscription
- `useMessage(id)` — cell subscriptions → `Message | null`
- `useAgent(id)` — row subscription → `Agent | null`

**Where it lives:** `lib/core/data/react.ts` — colocated with the DAOs since it shares their decode logic.

**Codex idea worth adopting:** Hooks are derived from the same decode functions used outside React. One source of truth for record shape.

## 6. React — Actions

Functions that components call to do things. These bridge React event handlers to domain operations and the streaming runtime.

```ts
// Actions available to components
actions.createSession()
actions.selectSession(id)
actions.sendMessage(sessionId, text)  // domain op + trigger stream
actions.updateAgent(agentId, patch)
```

`sendMessage` is the interesting one — it calls the domain operation (insert user message), then kicks off `streamResponse`. The stream runs detached from the component lifecycle — navigating away doesn't kill it.

**How components access actions:** Via a React context that holds `DataLayer` + transport + action functions. Not via module-level singletons.

**Where it lives:** `lib/core/actions.ts` or `lib/core/domain/actions.ts`.

## 7. React — Components

Reuse existing component structure but rewire to new hooks and actions.

| Component | Reads | Writes |
|---|---|---|
| App shell | activeSessionId | — |
| Session list | sessionIds, session records | selectSession, createSession |
| Message list | messageIds, message records | — |
| Composer | session status | sendMessage |
| Agent panel | agent record | updateAgent |

**Bootstrap:** The app shell creates `DataLayer`, initializes persistence, provides via context. Runtime is not created in a React component — it's created at the app level and made available through context.

**Codex idea worth adopting:** Components should not import from the runtime layer. They read data hooks and call actions. The action layer owns the decision to stream.

## 8. Text Helpers

Small utility module for message text extraction and session title generation. Used by domain operations (auto-title on first message) and potentially by components.

- `getMessageText(message)` — extract text from parts
- `generateTitle(text)` — truncate to title length

**Where it lives:** `lib/core/domain/text.ts` or just inline in operations until it's needed in multiple places.

## Deferred

These are not part of the initial rewrite. They get designed when the basic chat loop works.

- **Work queue / dispatcher** — add back when retry, cancel, and recovery need it. The streaming function exists independently; the queue wraps it.
- **Recovery** — depends on work queue. Current approach: mark interrupted work as failed on startup.
- **Cancel** — needs abort controller registry. Can be a thin layer over the streaming function's signal.
- **Retry** — needs message replacement logic. Depends on cancel working first.
- **Runtime diagnostics panel** — useful but not blocking.
- **Multi-tab safety** — acknowledged, not addressed.

## Notes

### AI SDK Cross-Reference (2026-03-16)

Verified against AI SDK v6.0.116.

**UIMessage part types:** Our Zod validation covers `text`, `reasoning`, `source-url`, `file`, `step-start` with an `unknownPart` catchall. The SDK now also has `source-document` (distinct from `source-url` — has `mediaType`, `title`, `filename`) and typed `tool` / `data-*` parts. The catchall handles these safely for persistence; add explicit schemas when we render them.

**`reconnectToStream`:** The `ChatTransport` interface has a `reconnectToStream(options) → Promise<ReadableStream | null>` method. This enables resuming an interrupted stream by chat ID — relevant to our recovery story. Current prototype marks interrupted work as failed; this API could enable actual stream resumption. Evaluate when implementing the work queue / dispatcher.

**`HttpChatTransport`:** More configurable alternative to `DefaultChatTransport`. Exposes `prepareSendMessagesRequest` and `prepareReconnectToStreamRequest` hooks for custom headers, auth, etc. Consider when we need more control over the transport layer.
