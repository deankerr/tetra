# tinybasechat

LLM chat app for power users. Local-first, composable, built on TinyBase.

**Primary goal:** Evaluate TinyBase as the reactive data layer for an agent runtime — not just a chat UI, but foundations that can grow into composable prompt management, tool use, and sub-agent delegation.

**Stack:** TinyBase, AI SDK, OpenRouter, React, TanStack Start, Tailwind, shadcn/ui, AI Elements

## Core Principle

TinyBase is the synchronization boundary between the UI and the runtime.

```
React UI  ◄──reads/writes──►  TinyBase Store  ◄──reads/writes──►  Runtime
```

React and the runtime never call each other. Both read from and write to TinyBase. React observes state reactively via hooks. The runtime manages async work independently.

This is not a React optimization. It is a decoupling strategy:

- Streams survive navigation, unmounts, and remounts
- Switching conversations does not kill active requests
- The UI shows whatever state is in the store when it mounts — no handshake needed
- The runtime can move to a service worker or remote server without changing the UI contract

**The key test:** Start a stream in session A. Switch to session B. Switch back. The stream is still running. Cancel it. This works because React never held the stream — TinyBase did.

## Architecture

Single TinyBase store. The runtime is an in-browser module, not tied to React's lifecycle.

**Note: Implentations may diverge as we discover the best patterns. This document should be maintained a regular intervals.**

### Layers

1. **Schema** — TinyBase table/value definitions, store creation, persistence, indexes
2. **DAOs + codecs** — Type-safe read/write per entity. Codecs separate persisted row shape from domain types. Types inferred from decode functions.
3. **Domain operations** — Named business actions (`createSession`, `sendMessage`). Multi-entity writes. No transport, no streaming.
4. **Streaming runtime** — Pure execution: read state, call transport, write results back to store. Owns abort controllers. Not aware of React.
5. **Actions** — Bridge between UI intent and domain operations + runtime. Components call actions. Actions decide what to write and whether to stream.
6. **React hooks** — Subscribe to store data, return decoded domain types. Colocated with DAOs.
7. **Components** — Read via hooks, write via actions. Never import runtime or transport.

### Data Flow

**Send message:**

1. Component calls `actions.send(sessionId, text)`
2. Action calls `operations.sendMessage(data, sessionId, text)` — writes user message, bumps seq
3. Action calls `runtime.streamResponse(data, sessionId)` — fire and forget
4. Runtime sets `session.status = 'streaming'`, inserts placeholder, iterates stream, writes partial updates
5. Components re-render reactively as message cells change
6. On complete/error/abort: runtime sets session status, cleans up

**Cancel:**

1. Component calls `actions.cancel(sessionId)`
2. Action aborts the active controller for that session
3. Runtime's stream iteration stops, cleanup runs, session goes idle
4. UI reflects the change reactively

**Switch session during stream:**

1. Component calls `operations.selectSession(data, newSessionId)` — writes `activeSessionId` value
2. UI re-renders to show the new session
3. The stream in the original session continues — it doesn't know or care about `activeSessionId`
4. Switching back shows the stream still progressing

## Data Model

Single store, persisted to IndexedDB.

### Agents

```
agents:
  id              (string)   — agent ID
  name            (string)
  model           (string)   — e.g. openrouter/anthropic/claude-sonnet-4
  provider        (string)   — provider key
  systemPrompt    (string)
  temperature     (number)
  maxOutputTokens (number)
```

### Sessions

```
sessions:
  id              (string)
  agentId         (string)   — FK to agent
  title           (string)
  status          (string)   — idle | streaming | error
  lastSeq         (number)   — highest message seq in session
  errorMessage    (string)
  createdAt       (number)
  updatedAt       (number)
```

`status` is written by the runtime, read by the UI. The runtime owns transitions.

### Messages

```
messages:
  id              (string)
  sessionId       (string)   — FK to session
  seq             (number)   — per-session ordering
  role            (string)   — user | assistant | system
  message         (object)   — full UIMessage from AI SDK
  createdAt       (number)
  updatedAt       (number)
```

Whole-message storage in an `object` cell. Matches AI SDK's UIMessage shape for direct round-trip. If streaming write volume becomes a problem, normalize into a parts table later.

### Values

```
values:
  activeSessionId (string)   — currently viewed session
```

### Indexes

- `sessionsByRecency` — sessions sorted by `updatedAt` descending
- `messagesBySession` — messages grouped by `sessionId`, sorted by `seq`

## TinyBase Constraints

- **`useRow` instability with object cells:** TinyBase rebuilds nested values on read, which can trigger `useSyncExternalStore` infinite loops. Use per-cell `useCell` subscriptions for tables with object cells (messages). Use `useRow` for scalar-only tables (sessions, agents). Collapse to `useRow` everywhere if TinyBase fixes this.
- **Index gotcha:** Constant slice IDs like `'all'` must be passed as functions (`() => 'all'`), not string literals.

## What's Built

- `lib/core/data/` — Schema, store, DAOs (agents, sessions, messages), codecs, React hooks
- `lib/core/operations.ts` — Domain operations (createSession, selectSession, sendMessage, updateAgentConfig, ensureDefaults)
- `lib/core/stream.ts` — Transport interface, default AI SDK transport, `streamResponse()` execution path
- `routes/api/stream.ts` — Server endpoint for OpenRouter streaming
- `components/chat/` — Workspace, session list, message list, composer, agent panel — all wired to core data layer
- `components/chat/core-app.tsx` — Bootstrap: initializes persistence, seeds defaults, provides TinyBase context

### Temporary

- `sendAndStream` in operations.ts — direct imperative bridge, bypasses proper action layer
- No cancel or retry yet
- `lib/chat/` — old prototype code, kept for reference, not used by the app

## What's Next

### Requests Table

A `requests` table as the signaling mechanism between the UI and the runtime. All scalar cells — no object payloads.

```
requests:
  id            (string)
  sessionId     (string)
  status        (string)   — pending | streaming | completed | cancelled | error
  errorMessage  (string)
  createdAt     (number)
```

The UI writes request rows and status changes. The runtime watches for pending requests and reacts. No type field — every request means "stream a response for this session." The difference between send and retry is just what messages exist when the request is created. Cancel is a status change on the active request, not a separate entity.

Session `status` becomes a pure projection — written by the runtime, read by the UI.

### Runtime

An in-browser module that watches the requests table via TinyBase listeners. Holds abort controllers in memory (ephemeral). Processes one request per session concurrently across sessions. On startup, recovers interrupted requests (stuck in `streaming`) by marking them as errors.

### Actions Layer

Functions the UI calls to express intent. They coordinate domain operations (write messages, update sessions) with request creation (write request rows). Components never touch the runtime or transport directly.

Send: insert user message → insert request `pending`. Cancel: set active request to `cancelled`. Retry: remove last assistant message → insert request `pending`.

## Feature Layers

### Layer 0: Data Foundation (done)

Schema, DAOs, codecs, persistence, reactive hooks, indexes.

### Layer 1: Chat Runtime (in progress)

Session lifecycle, streaming, cancel, retry. The actions layer completes this.

### Layer 2: Agent Configuration

Multiple agents, agent selector, import/export.

### Layer 3: Composable Prompt Management

Reusable prompt fragments, assembly, preview. Bridge from chat app to context engineering tool.

### Layer 4: Tool System

Tool registry, execution loop, result rendering. AI SDK tool calling.

### Layer 5: Sub-Agents

Sessions spawn sub-sessions via tools. See [reference/sub-agents.md](reference/sub-agents.md).

### Layer 6: Image/File Support

Image/file input and output.

## Interaction Model

Power-user-first. Slash commands and command palette as primary interaction surfaces.

```
/new              — create session
/retry            — regenerate last response
/cancel           — abort active request
/model sonnet     — switch model
/agent <name>     — switch agent
/clear            — clear history
/export           — export session/agent
```

Command palette (Cmd+K) surfaces the same actions plus navigation.

## Open Questions

- Streaming write volume: does replacing the entire message object cell on every token cause performance issues at scale?
- Schema evolution: how does TinyBase handle schema changes across app versions?
- Large conversations: at what point does message volume stress TinyBase or IndexedDB?
- Whether the requests table needs additional fields (e.g. type) as the runtime grows
