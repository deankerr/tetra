# 03 — Components

## Overview

Two independent components receive output from the same `streamText` call. They share nothing except the `streamText` result object.

```
streamText({ ..., onStepFinish })
       │                │
       │         toUIMessageStream()
       │                │
  onStepFinish   ReadableStream<UIMessageChunk>
       │                │
  DURABLE          processUIMessageStream
  BACKEND               │
       │          StreamingState.update(messageId, snapshot)
  TinyBase              │
  writes           Map<messageId, UIMessage>
```

---

## Durable backend

The durable backend is entirely driven by the `onStepFinish` callback passed to `streamText`. When each step completes, all its output is available synchronously: `step.content`, `step.response.messages`, `step.usage`, `step.providerMetadata`.

### Step write

```ts
onStepFinish: (step) => {
  const stepId = generateId.step()

  store.transaction(() => {
    // Canonical step record
    store.setRow('steps', stepId, {
      content: step.content,
      finishReason: step.finishReason,
      messageId: assistantMessageId,
      model: step.model,
      providerMetadata: step.providerMetadata,
      requestId,
      responseMessages: step.response.messages,
      sessionId,
      stepNumber: step.stepNumber,
      usage: {
        inputTokens: step.usage.inputTokens,
        outputTokens: step.usage.outputTokens,
        totalTokens: step.usage.totalTokens,
        raw: step.usage.raw,
      },
    })

    // Update the assistant message's rendering cache
    store.setPartialRow('messages', assistantMessageId, {
      parts: derivePartsFromContent(accumulatedContent),
      updatedAt: Date.now(),
    })
  })
}
```

The `store.transaction()` wraps both writes so TinyBase's listeners see them as one atomic change. React does not see a state between "step written" and "rendering cache updated."

`accumulatedContent` is the union of `step.content` across all completed steps for this message — accumulated in the closure alongside `onStepFinish`.

### History reconstruction

`gatherModelMessages` reads TinyBase synchronously and returns a `ModelMessage[]` ready to pass directly to `streamText`:

```ts
function gatherModelMessages(
  ctx: { indexes; store },
  args: { assistantMessageId; maxMessages?; sessionId },
): ModelMessage[] {
  const messageIds = indexes
    .getSliceRowIds('messagesBySession', sessionId)
    .filter((id) => id !== assistantMessageId)
    .slice(-(args.maxMessages ?? Infinity))

  const messages: ModelMessage[] = []

  for (const id of messageIds) {
    const { role, parts } = store.getRow('messages', id)

    if (role === 'user') {
      messages.push({
        role: 'user',
        content: parts as UserModelMessage['content'],
      })
      continue
    }

    // Collect ResponseMessage[] from each step in order.
    // These are already in ModelMessage format — no convertToModelMessages needed.
    const stepIds = indexes.getSliceRowIds('stepsByMessage', id)
    for (const stepId of stepIds) {
      const step = store.getRow('steps', stepId)
      messages.push(...(step.responseMessages as ResponseMessage[]))
    }
  }

  return messages
}
```

The only conversion in this path is user messages: `UIMessage['parts']` → `UserModelMessage['content']`, which is a direct structural match for text and file parts.

### Request completion

After the stream drains (all steps complete), `result.totalUsage` resolves and the request row is finalised:

```ts
const totalUsage = await result.totalUsage
store.setPartialRow('requests', requestId, {
  status: 'completed',
  totalUsage,
})
```

On abort or error the request is marked accordingly. The assistant message row and any completed step rows are left as-is — partial progress is better than none.

---

## Live stream processing

The live stream path processes `UIMessageChunk` events into an accumulated `UIMessage` snapshot, published to a `StreamingState` Map that React can subscribe to.

### `StreamingState`

```ts
class StreamingState {
  private snapshots = new Map<string, UIMessage>()
  private listeners = new Map<string, Set<() => void>>()

  update(messageId: string, snapshot: UIMessage): void {
    // Shallow-copy parts so useSyncExternalStore sees a new reference
    this.snapshots.set(messageId, { ...snapshot, parts: [...snapshot.parts] })
    this.listeners.get(messageId)?.forEach((fn) => fn())
  }

  subscribe(messageId: string, fn: () => void): () => void {
    if (!this.listeners.has(messageId)) this.listeners.set(messageId, new Set())
    this.listeners.get(messageId)!.add(fn)
    return () => this.listeners.get(messageId)?.delete(fn)
  }

  get(messageId: string): UIMessage | null {
    return this.snapshots.get(messageId) ?? null
  }

  delete(messageId: string): void {
    this.snapshots.delete(messageId)
    this.listeners.get(messageId)?.forEach((fn) => fn())
    this.listeners.delete(messageId)
  }
}
```

The `update` call shallow-copies the snapshot so `useSyncExternalStore` detects a reference change and schedules a re-render. Without this, React's strict equality check on `getSnapshot` would suppress updates when `processUIMessageStream` mutates the message object in place (which it does for performance).

### Wiring `processUIMessageStream`

`processUIMessageStream` takes a `runUpdateMessageJob` callback. This is the seam — in `useChat` it's wired to a `SerialJobExecutor` + React state; here it's wired to `StreamingState.update`.

```ts
const streamingState = createStreamingUIMessageState({
  lastMessage: undefined,
  messageId: assistantMessageId,
})

await consumeStream({
  stream: processUIMessageStream({
    stream: result.toUIMessageStream({ sendReasoning: true }),
    runUpdateMessageJob: async ({ state, write }) => {
      write()
      streaming.update(assistantMessageId, state.message)
    },
    onError: (err) => {
      throw err
    },
  }),
})

// Stream complete — remove from streaming state
streaming.delete(assistantMessageId)
```

`processUIMessageStream` handles everything inside the stream: text accumulation by chunk ID, partial JSON parsing for tool inputs (`parsePartialJson`), state transitions (`input-streaming → input-available → output-available`), reasoning part assembly, and `providerMetadata` threading. None of that logic lives in our code.

---

## Frontend switching

A React component rendering a message needs to decide which source to read from. The rule is simple: if a live snapshot exists, show it; otherwise show the TinyBase row.

```ts
// In apps/web

export function useMessage(messageId: string): UIMessage | null {
  const streaming = useStreamingMessage(messageId) // reads StreamingState via useSyncExternalStore
  const completed = useTinyBaseMessage(messageId) // reads TinyBase via store.useRow

  return streaming ?? completed
}
```

`useStreamingMessage` returns `null` once `streaming.delete(messageId)` is called — which happens synchronously after `consumeStream` resolves and before any subsequent state changes.

### The transition sequence

The critical ordering is: TinyBase write → StreamingState delete → React re-render.

```
onStepFinish fires
  → store.transaction() writes step + message.parts  ← TinyBase sees new state
  → streaming.update() called by processUIMessageStream continues
  → consumeStream resolves
  → streaming.delete(messageId)                       ← StreamingState cleared
  → listeners notified
  → React re-renders useMessage(messageId)
     → streaming = null
     → completed = TinyBase row (already updated)
     → returns TinyBase row                           ← seamless switch
```

Because `onStepFinish` fires before `processUIMessageStream`'s `transform` function returns for that step's `finish-step` chunk, TinyBase always has the completed state before `StreamingState` is cleared. There is no frame where `streaming` is null and TinyBase hasn't been written yet.

### Multi-step messages

For tool-calling exchanges, a single assistant message spans multiple steps. `StreamingState` holds the live snapshot across all steps — `processUIMessageStream` accumulates parts across `start-step` / `finish-step` boundaries naturally. TinyBase receives a step write at each `onStepFinish`. The rendering cache (`messages.parts`) is updated after each step with the accumulated content.

The component shows live streaming state throughout the multi-step exchange. When the final step completes and `streaming.delete()` fires, the component switches to the TinyBase row which now contains all steps' accumulated parts.

### Status tracking

`requests.status` in TinyBase drives loading states and cancel affordances. The state machine:

```
'streaming'   — set when execution begins, before the first token
'completed'   — set after result.totalUsage resolves
'error'       — set on any thrown error
'cancelled'   — set when the AbortController fires with 'user-cancel'
```

React reads request status via `useActiveRequest(sessionId)` (TinyBase index lookup). The streaming visual (spinner, stop button) is driven by status, not by whether `StreamingState` has a snapshot for the message.
