# 03 — Components

## The execution loop

### `execute()` — synchronous setup

`execute()` returns a `requestId` immediately after writing the initial rows. The async stream runs independently of the caller.

```ts
execute(sessionId, { content, config, onSnapshot }) {
  const validConfig = ModelConfig.parse({ ...sessions.getConfig(sessionId), ...config })

  // Write synchronously — visible in the store before execute() returns
  sessions.addMessage(sessionId, { content, role: 'user' })
  const assistantMessageId = sessions.addMessage(sessionId, { content: '', role: 'assistant' })

  const requestId = generateId.request()
  store.setRow('requests', requestId, { ..., status: 'streaming' })

  void runStream(requestId, sessionId, assistantMessageId, validConfig, abort, onSnapshot)

  return requestId
}
```

### `runStream()` — async core

History is gathered at the start of `runStream`, after `execute()` has written the new user message and assistant placeholder. By the time `runStream` reads, they are already in the store.

```ts
async function runStream(...) {
  // Build ModelMessage[] from stored UIMessages
  const messages = await sessions.gatherModelMessages(sessionId, assistantMessageId, maxMessages)

  const result = streamText({
    messages,
    model,
    onStepFinish: (step) => {
      // Accounting write only — no content, no history.
      const prior = store.getCell('requests', requestId, 'steps') as StepRecord[]
      store.setCell('requests', requestId, 'steps', [...prior, parseStep(step)])
    },
  })

  // Stream processing and live rendering
  let finalParts: UIMessage['parts'] = []
  for await (const msg of readUIMessageStream({
    stream: result.toUIMessageStream({ sendReasoning: true }),
  })) {
    onSnapshot?.(msg)        // live rendering callback
    finalParts = msg.parts   // accumulate; last iteration = complete message
  }

  // Durable write — once, after the stream drains
  store.setPartialRow('messages', assistantMessageId, { parts: finalParts, updatedAt: Date.now() })

  store.setPartialRow('requests', requestId, { status: 'completed' })
}
```

On abort or error, the catch block sets `status: 'error'` or `status: 'cancelled'`. The assistant message row is left with empty parts — partial results are not persisted.

---

## History reconstruction

`gatherModelMessages` builds `UIMessage[]` from stored rows and converts them to `ModelMessage[]` via `convertToModelMessages`:

```ts
async function gatherModelMessages(sessionId, assistantMessageId, maxMessages) {
  let messageIds = indexes
    .getSliceRowIds('messagesBySession', sessionId)
    .filter((id) => id !== assistantMessageId) // exclude the current placeholder

  if (maxMessages !== undefined) {
    messageIds = messageIds.slice(-maxMessages)
  }

  const uiMessages: UIMessage[] = messageIds.map((id) => {
    const row = store.getRow('messages', id)
    return {
      id,
      parts: row.parts as UIMessage['parts'],
      role: row.role === 'assistant' ? 'assistant' : 'user',
    }
  })

  return convertToModelMessages(uiMessages)
}
```

`convertToModelMessages` maps each part's `providerMetadata` to `providerOptions` on the outgoing content part. This is what preserves `reasoning_details` for signing providers (Anthropic Claude, Google Gemini) across turns — it is the AI SDK's designed path for this requirement, not a workaround.

---

## Live rendering

### The `onSnapshot` callback

`onSnapshot` is the seam between the runner and the consumer's rendering layer. It receives a `UIMessage` snapshot on each meaningful update from `readUIMessageStream`: a text chunk arriving, a tool result completing, a step boundary — anything that changes the assembled message state.

The runner passes `onSnapshot` through from `execute()` to `runStream()`. Different callers wire it differently:

**CLI:** prints the text delta to stdout on each snapshot.

```ts
let lastLen = 0
runner.execute(sessionId, {
  content: message,
  onSnapshot: (msg) => {
    const text = msg.parts
      .filter((p): p is { text: string; type: 'text' } => p.type === 'text')
      .map((p) => p.text)
      .join('')
    process.stdout.write(text.slice(lastLen))
    lastLen = text.length
  },
})
```

**React runtime:** publishes each snapshot to a `StreamingState` Map that React reads via `useSyncExternalStore`.

```ts
runner.execute(sessionId, {
  content: message,
  onSnapshot: (msg) => streamingState.update(assistantMessageId, msg),
})
```

### `StreamingState` (React)

`StreamingState` is an in-memory Map owned by the runtime. It holds live snapshots during a stream and notifies React subscribers on each update.

```ts
class StreamingState {
  private snapshots = new Map<string, UIMessage>()
  private listeners = new Map<string, Set<() => void>>()

  update(messageId: string, snapshot: UIMessage): void {
    // Shallow-copy parts so useSyncExternalStore detects a reference change
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

The shallow copy on `update` is necessary — `useSyncExternalStore` uses reference equality, so mutating the snapshot in place would suppress re-renders.

---

## Frontend switching

A React component decides which source to render based on whether a live snapshot exists:

```ts
export function useMessage(messageId: string): UIMessage | null {
  const streaming = useStreamingMessage(messageId) // StreamingState via useSyncExternalStore
  const completed = useTinyBaseMessage(messageId) // TinyBase row
  return streaming ?? completed
}
```

### The transition

When the `readUIMessageStream` loop ends:

1. `messages.parts` is written to TinyBase with the final snapshot
2. `requests.status` is set to `'completed'`
3. The caller's runtime calls `streamingState.delete(assistantMessageId)`
4. `useStreamingMessage` returns `null`
5. React re-renders `useMessage` — `streaming` is null, `completed` is the TinyBase row

TinyBase is written before `StreamingState` is cleared, so there is no frame where `streaming` is null and TinyBase hasn't been written yet.

### Status tracking

`requests.status` drives loading states and cancel affordances — it is independent of whether `StreamingState` has a snapshot.

```
'streaming'   — set synchronously in execute(), before the first token
'completed'   — set after the UI message stream drains and final parts are written
'error'       — set on any thrown error
'cancelled'   — set when the AbortController fires with 'user-cancel'
```
