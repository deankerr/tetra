# 02 — Data Model

## TinyBase schema

### `sessions`

```ts
sessions: {
  config: object // ModelConfig — mutable inference config for this session
  createdAt: number
  title: string
  updatedAt: number
}
```

### `messages`

```ts
messages: {
  createdAt: number
  parts: array // UIMessage['parts'] — the canonical persisted message content
  role: string // 'user' | 'assistant'
  sessionId: string
  updatedAt: number
}
```

`parts` holds `UIMessage['parts']` for both roles, but the write timing differs:

- **User messages** — written once at creation. Parts contain the user's text (and eventually file parts). Never updated.
- **Assistant messages** — written once at request completion. Parts are the final `UIMessage` snapshot produced by `readUIMessageStream` after the stream drains. They include all step output: text, reasoning, tool calls, tool results, and step boundaries.

This is not a rendering cache derived from other data — it is the authoritative record. On reload, `messages.parts` is what React renders. For an active stream, the live snapshots from `onSnapshot` are what the UI renders (see [03-components.md](./03-components.md)).

### `steps`

```ts
steps: {
  accounting: object // StepAccounting — token counts, cost, model identity
  createdAt: number
  finishReason: string // 'stop' | 'tool-calls' | 'length' | 'error' | 'content-filter' | 'other'
  messageId: string
  requestId: string
  sessionId: string
  stepNumber: number
}
```

Step rows are accounting records only. They are written at each step boundary via `onStepFinish` and are never updated. They are not used for history reconstruction or rendering — both are driven by `messages.parts`.

### `requests`

```ts
requests: {
  assistantMessageId: string
  completedAt: number
  config: object // ModelConfig snapshot — what was actually used
  createdAt: number
  errorMessage: string
  sessionId: string
  status: string // 'streaming' | 'completed' | 'error' | 'cancelled'
  totalUsage: object // cross-step aggregate from result.totalUsage
}
```

`config` is a snapshot taken at execution time. If the user edits the session config mid-stream, the active request is unaffected.

`totalUsage` is the AI SDK's cross-step aggregate (`inputTokens`, `outputTokens`, `totalTokens`). It does not include cost — use `steps[n].accounting.cost.total` for per-step cost.

### Indexes

```ts
messagesBySession // 'messages' → 'sessionId', sorted by HLC row ID (creation order)
stepsByMessage // 'steps'    → 'messageId', sorted by 'stepNumber'
requestsBySession // 'requests' → 'sessionId', sorted by 'createdAt' descending
requestByAssistantMessage // 'requests' → 'assistantMessageId'
```

HLC row IDs give `messagesBySession` a deterministic creation-time sort without a secondary sort field.

---

## Token and cost accounting

### The `accounting` object

Each step row carries a structured `accounting` object assembled in `onStepFinish` from two sources: the AI SDK's normalised `step.usage` (fully typed), and `step.usage.raw` (the verbatim provider JSON, sole source of cost data).

```ts
accounting: {
  // Model identity
  requestedModel: string // alias we sent (e.g. 'openai/gpt-4o-mini')
  servedModel: string // pinned version that actually ran
  backendProvider: string // infrastructure backend (e.g. 'Novita', 'Azure')
  generationId: string // OpenRouter trace ID for this generation

  // Cost (from step.usage.raw — AI SDK does not normalise cost)
  cost: {
    total: number | null
    prompt: number | null
    completion: number | null
    isByok: boolean
  }

  // Token counts (mixed sources — see below)
  tokens: {
    input: number // SDK normalised
    output: number // SDK normalised
    total: number // SDK normalised
    text: number // SDK normalised (output breakdown)
    reasoning: number // SDK normalised (output breakdown)
    cacheRead: number // SDK normalised (input breakdown)
    cacheWrite: number // SDK normalised (input breakdown)
    audioIn: number // raw only
    audioOut: number // raw only
    imageOut: number // raw only
    videoIn: number // raw only
  }
}
```

Media tokens (`audioIn`, `audioOut`, `imageOut`, `videoIn`) are only present in the raw provider JSON, not in the SDK's normalised fields.

### Request-level cost

To sum cost across all steps for a request:

```ts
const totalCost = indexes
  .getSliceRowIds('stepsByMessage', assistantMessageId)
  .reduce((sum, stepId) => {
    const { accounting } = store.getRow('steps', stepId)
    const cost = (accounting as { cost?: { total?: number } }).cost?.total
    return sum + (cost ?? 0)
  }, 0)
```

### `requests.totalUsage`

The AI SDK aggregates `inputTokens`, `outputTokens`, and `totalTokens` across all steps into `result.totalUsage`. This is stored on the request row. It does not include cost, reasoning tokens, or media tokens — use `step.accounting` for those.

---

## Multi-turn history

History reconstruction uses `convertToModelMessages(uiMessages)`, where `uiMessages` are built from the stored `messages.parts` rows.

`convertToModelMessages` maps each UIMessage part's `providerMetadata` to `providerOptions` on the outgoing `ModelMessage` content part. This is the correct path for preserving `reasoning_details` across turns — including signed tokens from providers like Anthropic Claude and Google Gemini, which must be echoed verbatim or the provider rejects the context.

The assistant placeholder (the empty message created at request start) is always excluded from history — it is filtered out before conversion.
