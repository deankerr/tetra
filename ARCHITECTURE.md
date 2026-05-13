# Architecture

Tetra is a local-first LLM chat app. A Bun monorepo with one web app and several focused packages.

## Package Index

### `apps/web` — UI

Vite + React + TanStack Router. Initializes the store and runtime, provides them via React context, and renders the chat interface.

Entry: `getTetra()` singleton creates the store, wires OPFS persistence, then creates and starts the runtime. The app is wrapped in a TinyBase `Provider` and a `RuntimeContext`. Components call `useRuntime()` for commands and TinyBase hooks for reactive reads.

### `packages/store` — Data model

TinyBase schema, store creation, indexes, decoders, and ID generation. No React dependency. Runs anywhere.

**Tables:** `sessions`, `messages`, `requests`
**Indexes:** messages by session (ordered by sequence), requests by session, request by assistant message ID

### `packages/runtime` — Business logic

Orchestrates Tetra processes. Receives a `TetraStore` and exposes commands: `createSession`, `sendMessage`, `deleteMessage`, `updateSessionConfig`. No React dependency.

`sendMessage` is the core turn: atomically writes user message + assistant placeholder + request row, then runs inference via `queueMicrotask` — outside the React lifecycle. Streams `UIMessage` snapshots back into the store on each token. On startup, `start()` recovers stale requests.

### `packages/inference` — AI SDK adapter

Wraps AI SDK + OpenRouter. No TinyBase dependency. Given provider credentials, config, messages, and an abort signal, yields `UIMessage` snapshots via async generator.

### `packages/credentials` — Secrets

localStorage-backed registry of API keys (OpenRouter, Jina). Syncs across tabs via storage events. Secrets are never persisted to the domain store.

### `packages/tools` — Tool registry

AI SDK `ToolSet` definitions: web search, URL fetch, current date/time. Each tool declares its credential requirements. The runtime resolves tool IDs at inference time, reads credentials, and passes them in an `experimental_context` bag.

### `packages/ui` — Component library

React components built on Base UI + Tailwind CSS 4. Exports chat primitives (via ai-elements), markdown rendering (Streamdown + Shiki), and shared UI utilities.

## Data Flow

```
User action
  → runtime.commands.sendMessage()
  → atomic store write: user message + assistant placeholder + request row
  → queueMicrotask: executeRequest()
      → read messages, credentials, tool definitions
      → streamInference() → UIMessage snapshots
      → write snapshots to assistant message row
  → TinyBase notifies React hooks → components re-render
```

Switching sessions updates the `session` URL search param via TanStack Router. The active stream is unaffected — it writes to its session in the store regardless of what the UI is showing.

## Dependency Graph

```
web
 ├─ store
 ├─ runtime ─── inference
 │           ├─ tools ─── credentials
 │           └─ credentials
 ├─ ui
 └─ credentials

inference   (no TinyBase)
credentials (no dependencies)
```

## Key Patterns

**Reactive state via TinyBase.** The store is the single source of truth shared by React and the runtime. React reads with hooks; the runtime reads and writes imperatively. Streams survive navigation and unmount with no handshake.

**Config snapshots.** Each request row stores a copy of its inference config (model, system prompt, tool IDs) at creation time. The session holds the current editable config separately.

**Boundary validation.** Stored config is treated as untrusted input. `parseRequestConfig` validates it at execution time via Zod.

**No secrets in the store.** Credentials live in localStorage, read on demand at inference time.
