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
  steps: StepRecord[] // embedded accounting records, one per completed model step
}
```

`config` is a snapshot taken at execution time. If the user edits the session config mid-stream, the active request is unaffected.

`steps` is an embedded array on the request row, not a separate table. Step records are accounting records only. They are appended at each step boundary via `onStepFinish` and are not used for history reconstruction or rendering — both are driven by `messages.parts`.

### Indexes

```ts
messagesBySession // 'messages' → 'sessionId', sorted by HLC row ID (creation order)
requestsBySession // 'requests' → 'sessionId', sorted by 'createdAt' descending
requestByAssistantMessage // 'requests' → 'assistantMessageId'
```

HLC row IDs give `messagesBySession` a deterministic creation-time sort without a secondary sort field.

---

## Token and cost accounting

### `StepRecord`

Each entry in `requests.steps` is a flat `StepRecord` assembled in `onStepFinish` from two sources: the AI SDK's normalised `step.usage` (fully typed), and `step.usage.raw` (the verbatim provider JSON, sole source of cost data).

```ts
{
  cost: {
    completion: number | null
    isByok: boolean
    prompt: number | null
    total: number | null
  }
  createdAt: number
  finishReason: string
  generationId: string
  model: string
  provider: string
  stepNumber: number
  tokens: {
    audioIn: number
    audioOut: number
    cacheRead: number
    cacheWrite: number
    imageOut: number
    input: number
    output: number
    reasoning: number
    total: number
    videoIn: number
  }
}
```

Media tokens (`audioIn`, `audioOut`, `imageOut`, `videoIn`) are only present in the raw provider JSON, not in the SDK's normalised fields.

### Request-level cost

To sum cost across all steps for a request:

```ts
const steps = request.steps as StepRecord[]
const totalCost = steps.reduce((sum, step) => sum + (step.cost.total ?? 0), 0)
```

### Request-level usage

Tetra does not store `result.totalUsage` separately. Request-level usage is derived from the embedded `requests.steps` array so the request row has one accounting source of truth.

---

## Multi-turn history

History reconstruction uses `convertToModelMessages(uiMessages)`, where `uiMessages` are built from the stored `messages.parts` rows.

`convertToModelMessages` maps each UIMessage part's `providerMetadata` to `providerOptions` on the outgoing `ModelMessage` content part. This is the correct path for preserving `reasoning_details` across turns — including signed tokens from providers like Anthropic Claude and Google Gemini, which must be echoed verbatim or the provider rejects the context.

The assistant placeholder (the empty message created at request start) is always excluded from history — it is filtered out before conversion.
