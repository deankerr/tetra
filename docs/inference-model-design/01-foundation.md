# 01 — Foundation

## What this is

The inference model is the core of Tetra. It covers everything from a user action triggering an LLM call through to the results being durable in TinyBase and reactive in React. It spans the data schema, the execution loop, the streaming pipeline, and the React read layer.

This document covers the stack, goals, invariants, and the architectural philosophy that shapes all subsequent decisions.

---

## Stack

| Layer             | Technology                                   | Role                                                                                          |
| ----------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| State store       | TinyBase `MergeableStore`                    | Durable schema, reactive subscriptions, OPFS persistence, sync substrate                      |
| Inference         | AI SDK `streamText`                          | Multi-step streaming, tool loops, step lifecycle callbacks                                    |
| Stream processing | AI SDK `processUIMessageStream`              | `UIMessageChunk` → `UIMessage` accumulation (partial JSON, chunk IDs, part state transitions) |
| Provider          | OpenRouter via `@openrouter/ai-sdk-provider` | Sole LLM provider                                                                             |
| UI                | React + `useSyncExternalStore`               | Reactive reads from TinyBase and the live stream                                              |

---

## Goals

**Correct multi-turn history.** The exact data the provider needs for each subsequent turn — including provider-specific echoing requirements (`reasoning_details`, signed tokens) — must survive a page reload without any transformation.

**Live streaming rendering.** Text, reasoning, and tool inputs render incrementally at the token level. Partial JSON tool inputs parse progressively. The rendering pipeline handles all of this correctly, including multi-part and multi-step exchanges.

**Durable at step boundaries.** A completed step is fully persisted to OPFS. If the browser reloads, all completed steps are recoverable; only sub-step ephemeral state is lost.

**Token and cost accounting.** Every step records normalized usage (`inputTokens`, `outputTokens`) and the provider's raw usage (which carries `cost` for OpenRouter). Costs are summable per-request and queryable per-step.

**Sync-ready data shapes.** Completed data is append-only and CRDT-friendly. The `MergeableStore` is not cosmetic — its HLC timestamps and merge semantics are designed to be used.

---

## Invariants

These are hard constraints. Design decisions that would violate them require explicit reconsideration.

1. **TinyBase is the only durable store.** No other persistence layer, no secondary state that diverges from it.

2. **The live stream never writes to TinyBase per-token.** Token-level writes destroy TinyBase's reactivity model (O(tokens) cell mutations, O(tokens) CRDT timestamps, O(tokens) OPFS flushes). The durable write boundary is a step completion.

3. **`step.response.messages` is the canonical history.** Multi-turn history is built from the `ResponseMessage[]` the AI SDK emits from `step.response.messages`. It is never reconstructed by converting from `UIMessage` parts. This preserves all provider-specific `providerOptions` (including `reasoning_details`) without any transformation.

4. **Steps are immutable after completion.** A step row is written once via `onStepFinish` and never updated. This makes step rows safe for CRDT merge and reliable for audit.

5. **Streaming state is ephemeral by design.** Sub-step token output lives in a runtime-owned Map. Its loss on reload is acceptable; all durable information is in the step rows.

---

## AI SDK philosophy: collaboration, not encapsulation

The AI SDK is not a vendor to be abstracted away. It defines the types our entire system is built on — `UIMessage`, `ModelMessage`, `ResponseMessage`, `ContentPart`, `UIMessageChunk` — and provides the stream processing machinery (`processUIMessageStream`) that would be substantial to replicate correctly.

Prior versions of this system tried to hide the AI SDK behind wrapper types (`InferenceSession`, `InferenceStepMetadata`). This forced re-describing the same shapes and prevented direct access to AI SDK features like `onStepFinish`, `response.messages`, and the full stream.

**The new stance:** AI SDK types are first-class. They are imported and re-exported freely. `processUIMessageStream`, `streamText`, `onStepFinish`, `ResponseMessage` appear by name in our execution code, not through adapters. The boundary between our code and the AI SDK is a collaboration point, not an isolation layer.

---

## Two major components

The system has two largely independent execution paths that both receive output from the same `streamText` call.

```
                    streamText
                        │
          ┌─────────────┴─────────────┐
          │                           │
   onStepFinish                  toUIMessageStream
          │                           │
   ┌──────▼──────┐           ┌────────▼────────┐
   │  DURABLE    │           │   LIVE STREAM   │
   │  BACKEND    │           │   PROCESSING    │
   └──────┬──────┘           └────────┬────────┘
          │                           │
   TinyBase writes            processUIMessageStream
   (steps, messages,                  │
    requests)               StreamingState Map
          │                           │
   TinyBase hooks             useSyncExternalStore
          │                           │
          └──────────┬────────────────┘
                     │
              React component
```

**Durable backend** — owns the TinyBase writes. Triggered by `onStepFinish`, it writes a completed step row and updates the message rendering cache. It also handles history reconstruction (reading from TinyBase before a new `streamText` call). It is write-only during a stream; reads happen at request start.

**Live stream processing** — owns the in-progress UIMessage state. `processUIMessageStream` accumulates `UIMessageChunk` events into a `UIMessage` snapshot, which is published to a subscription Map. React reads this via `useSyncExternalStore`. It has no TinyBase interaction.

These two paths share one `streamText` result object but are otherwise independent. A React component switches between them based on whether a stream is active for a given message ID. The transition — streaming state to TinyBase state — is described in [03-components.md](./03-components.md).

---

## Package topology

The current `packages/runtime` + `packages/inference` split is inverted relative to the new design. `packages/inference` existed to hide the AI SDK behind `createInference → InferenceSession`. That boundary is now removed.

The revised split:

**`packages/inference`** — owns the full streaming and persistence loop. Accepts a `TetraStore`, credentials, tools, and request config. Calls `streamText` directly. Wires `onStepFinish` → TinyBase. Returns the live `ReadableStream<UIMessageChunk>` for the streaming path. Re-exports the AI SDK types that callers need. Has no wrapper types over the AI SDK.

**`packages/runtime`** — thin session and request coordinator. Creates session and message rows, manages `AbortController` instances, resolves credentials and tools, calls into `packages/inference` to start execution. Owns the `StreamingState` Map and exposes it to React.

**`packages/store`**, **`packages/credentials`**, **`packages/tools`** — unchanged in role.
