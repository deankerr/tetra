# 01 — Foundation

## What this is

The inference model is the core of Tetra. It covers everything from a user action triggering an LLM call through to the results being durable in TinyBase and reactive in React. It spans the data schema, the execution loop, the streaming pipeline, and the React read layer.

This document covers the stack, goals, invariants, and the architectural philosophy that shapes all subsequent decisions.

---

## Stack

| Layer             | Technology                                   | Role                                                                                |
| ----------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| State store       | TinyBase `Store`                             | Durable schema, reactive subscriptions, SQLite persistence (dev), OPFS (production) |
| Inference         | AI SDK `streamText`                          | Multi-step streaming, tool loops, step lifecycle callbacks                          |
| Stream processing | AI SDK `readUIMessageStream`                 | `UIMessageChunk` stream → sequence of assembled `UIMessage` snapshots               |
| History           | AI SDK `convertToModelMessages`              | `UIMessage[]` → `ModelMessage[]` for the next `streamText` call                     |
| Provider          | OpenRouter via `@openrouter/ai-sdk-provider` | Sole LLM provider                                                                   |
| UI                | React + `useSyncExternalStore`               | Reactive reads from TinyBase and the live stream                                    |

---

## Goals

**Correct multi-turn history.** The exact data the provider needs for each subsequent turn — including provider-specific echoing requirements (`reasoning_details`, signed tokens) — must survive a page reload. `UIMessage` parts carry `providerMetadata` that `convertToModelMessages` maps to `providerOptions` automatically on the next call.

**Live streaming rendering.** Text, reasoning, and tool inputs render incrementally. `readUIMessageStream` emits a `UIMessage` snapshot on each meaningful update (text chunk, tool result state change). The caller receives these via an `onSnapshot` callback and updates its rendering layer.

**Durable at request completion.** The final `UIMessage` is written to TinyBase once, after the stream drains. If the process restarts mid-stream, the partial result is lost but the system recovers cleanly — the request is marked as interrupted.

**Token and cost accounting.** Every step records normalised usage and the provider's raw usage (which carries `cost` for OpenRouter). Each request row embeds a `steps` array of flat step records with token breakdowns, cost, and model identity.

---

## Invariants

These are hard constraints. Design decisions that would violate them require explicit reconsideration.

1. **TinyBase is the only durable store.** No other persistence layer, no secondary state that diverges from it.

2. **`UIMessage` is the canonical persisted form.** `messages.parts` stores `UIMessage['parts']` directly — not a derived cache, but the actual record. It is written once per request, after the stream completes.

3. **No per-token TinyBase writes.** The durable write boundary is request completion, not step completion and not individual tokens.

4. **Steps are accounting-only.** `requests.steps` records token usage, cost, and model identity. It is not used for history reconstruction or rendering.

5. **Streaming state is ephemeral by design.** Live `UIMessage` snapshots are delivered via the `onSnapshot` callback and kept in memory by the caller. Their loss on reload is acceptable — the durable record is in the messages table.

---

## AI SDK philosophy: collaboration, not encapsulation

The AI SDK defines the types our entire system is built on — `UIMessage`, `ModelMessage`, `UIMessageChunk` — and provides the stream processing machinery that would be substantial to replicate correctly.

**The stance:** AI SDK types are first-class. `readUIMessageStream`, `convertToModelMessages`, `streamText`, and `onStepFinish` appear by name in execution code, not through adapters. The boundary between our code and the AI SDK is a collaboration point, not an isolation layer.

---

## The execution loop

`execute()` is synchronous. It writes the user message, assistant placeholder, and request row to TinyBase immediately, then hands off to `runStream()` as a fire-and-forget.

`runStream()` is the async core. It runs the inference and owns all durable writes:

```
execute()  [synchronous]
    │
    ├── messages row  (user, parts: [{ type: 'text', text }])
    ├── messages row  (assistant placeholder, parts: [])
    └── requests row  (status: 'streaming')
                │
                │ fire-and-forget
                ▼
         runStream()  [async]
                │
                ├── gatherModelMessages()
                │      convertToModelMessages(uiMessages)
                │
                ├── streamText()
                │       │
                │       └── onStepFinish ──► requests.steps[] (accounting)
                │
                └── readUIMessageStream()
                        │
                        for await (snapshot) {
                        │   onSnapshot?.(snapshot)   ← caller's live rendering
                        │   finalParts = snapshot.parts
                        │ }
                        │
                        ▼
                  messages.parts = finalParts   ← durable write
                  requests.status = 'completed'
```

The two outputs of `streamText` serve different purposes:

- **`onStepFinish`** fires when a step completes. It appends accounting data (tokens, cost, model identity) to the request row's embedded `steps` array. It has no role in history or rendering.

- **`toUIMessageStream()` → `readUIMessageStream()`** converts the chunk stream into assembled `UIMessage` snapshots. Each snapshot is passed to `onSnapshot` for live rendering. After the loop, the final snapshot is the complete message that gets persisted.
