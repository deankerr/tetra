# 02 — Data Model

## TinyBase schema

### `sessions`

```ts
sessions: {
  config: object // RequestConfig — mutable inference config for this session
  createdAt: number
  title: string
  updatedAt: number
}
```

### `messages`

```ts
messages: {
  createdAt: number
  parts: array // UIMessage['parts'] — rendering cache
  role: string // 'user' | 'assistant'
  sessionId: string
  updatedAt: number
}
```

`parts` serves two purposes depending on role:

- **User messages** — written once at creation, never updated. Content is the user's text and file parts, stored directly as `UIMessage['parts']`.
- **Assistant messages** — a rendering cache derived from completed steps. Written once per step completion (not per token) by the durable backend. Reflects all content accumulated across steps so far.

The rendering cache means React's `useMessage` hook returns something useful even after a reload, without needing to re-derive UIMessage parts from the steps table. For an active stream, the React component ignores this and reads from `StreamingState` instead (see [03-components.md](./03-components.md)).

### `steps`

```ts
steps: {
  content: array // ContentPart[] — from step.content; used for rendering cache derivation
  finishReason: string // 'stop' | 'tool-calls' | 'length' | 'error' | 'content-filter' | 'other'
  messageId: string // assistant message this step belongs to
  model: object // { provider: string, modelId: string }
  providerMetadata: object // step-level provider metadata
  requestId: string
  responseMessages: array // ResponseMessage[] from step.response.messages
  sessionId: string
  stepNumber: number // zero-based index within this message
  usage: object // see Token accounting below
}
```

`steps` is the canonical record of what happened. Two fields carry the AI SDK's designed output surfaces:

**`responseMessages`** (`ResponseMessage[]`, i.e. `AssistantModelMessage | ToolModelMessage`) is what `step.response.messages` returns. This is the exact data needed to build the next turn's message history — already in `ModelMessage` format, with all `providerOptions` intact. It is passed directly to the next `streamText` call without conversion.

**`content`** (`ContentPart[]`) is the step's output in a rendering-friendly form. It maps directly to `UIMessage` parts (reasoning → reasoning, text → text, tool-call → tool-input-available, tool-result → tool-output-available). It is used by the durable backend to update the `messages.parts` rendering cache after each step.

### `requests`

```ts
requests: {
  assistantMessageId: string
  config: object // RequestConfig snapshot — what was actually used
  createdAt: number
  errorMessage: string
  sessionId: string
  status: string // 'streaming' | 'completed' | 'error' | 'cancelled'
  totalUsage: object // cross-step aggregate from result.totalUsage
}
```

`config` is a snapshot taken at execution time, not a reference to the session config. If the user edits the session config mid-stream, the active request is unaffected.

`totalUsage` is the AI SDK's cross-step aggregate (`inputTokens`, `outputTokens`, `totalTokens`). It does not include cost — the SDK does not aggregate that. Use `steps[n].usage.raw.cost` for per-step cost and sum manually.

### Indexes

```ts
messagesBySession // 'messages' → 'sessionId', sorted by HLC row ID (creation order)
stepsByMessage // 'steps'    → 'messageId', sorted by 'stepNumber'
requestsBySession // 'requests' → 'sessionId', sorted by 'createdAt' descending
requestByAssistantMessage // 'requests' → 'assistantMessageId'
```

HLC row IDs give `messagesBySession` a deterministic creation-time sort without a secondary sort field. The `stepsByMessage` index uses `stepNumber` directly since steps are always written in order within a request.

---

## OpenRouter multi-turn requirements

OpenRouter requires `reasoning_details` to be echoed back in subsequent assistant messages for providers that produce them. The exact behavior depends on the upstream model:

- **Signing providers** (Anthropic Claude, Google Gemini): `reasoning_details` carry a cryptographic signature. The signed entry must be echoed verbatim in the next turn's assistant message or the provider rejects the context.
- **Non-signing providers** (DeepSeek via OpenRouter): `reasoning_details` are emitted with `format: "unknown"` and no signature. Echoing is harmless but not required.

`reasoning_details` arrive in two places during a stream:

1. On the `reasoning-end` chunk's `providerMetadata` — the accumulated details for the reasoning part
2. On `tool-call` chunks' `providerMetadata` — same details, duplicated so they survive serialisation through `response.messages`

The OpenRouter provider's `findFirstReasoningDetails()` reads from `tool-call` parts first, then `reasoning` parts, when reconstructing the outgoing assistant message for the next API call.

**How we preserve them:** `step.response.messages` (stored in `steps.responseMessages`) already carries `reasoning_details` inside `providerOptions` on the assistant message's content parts — exactly as required. No special handling is needed. When `gatherModelMessages()` reads `steps.responseMessages` and passes them directly to the next `streamText`, the OpenRouter provider finds and echoes them automatically.

**What to avoid:** reconstructing message history from `messages.parts` (UIMessage format) and calling `convertToModelMessages`. This path works for non-signing providers today but is fragile. `steps.responseMessages` is the correct surface.

---

## Token accounting

### Normalised usage (AI SDK)

Each step's `usage` field stores the AI SDK's normalised shape:

```ts
{
  inputTokens: number // prompt tokens for this step
  outputTokens: number // completion tokens for this step
  totalTokens: number // sum of above
}
```

`result.totalUsage` (stored in `requests.totalUsage`) aggregates these across all steps in the request.

### Provider-raw usage (OpenRouter cost)

The AI SDK does not normalise cost. It lives in `step.usage.raw`, which is the unmodified provider JSON. For OpenRouter:

```ts
step.usage.raw = {
  // OpenRouter-specific: cost in USD
  cost: number

  // Extended token detail (when available)
  promptTokensDetails?: {
    cachedTokens?: number
    audioTokens?: number
  }
  completionTokensDetails?: {
    reasoningTokens?: number   // tokens used for chain-of-thought
    audioTokens?: number
    acceptedPredictionTokens?: number
    rejectedPredictionTokens?: number
  }
}
```

The `providerMetadata.openrouter.usage` on each step mirrors much of this and includes additional OpenRouter-specific fields (e.g. `provider` — the backend that actually served the request).

### Computing request cost

```ts
// Total cost for a request:
const steps = indexes
  .getSliceRowIds('stepsByMessage', messageId)
  .map((id) => store.getRow('steps', id))

const totalCost = steps.reduce((sum, step) => {
  const raw = (step.usage as any)?.raw
  return sum + (typeof raw?.cost === 'number' ? raw.cost : 0)
}, 0)
```

### What `requests.totalUsage` does and doesn't include

`result.totalUsage` (AI SDK) sums `inputTokens` and `outputTokens` across all steps. It does not sum cost. It also does not include `reasoningTokens` from `completionTokensDetails` — those are only in `step.usage.raw`. For accurate cost and reasoning token accounting, always use the per-step `usage.raw`.

### Model identity per step

Each step records `model: { provider, modelId }` using the alias requested (e.g. `deepseek/deepseek-v4-flash`). The pinned version actually served (e.g. `deepseek/deepseek-v4-flash-20260423`) is in `step.response.headers` and available via `providerMetadata.openrouter`. This distinction matters for reproducibility — the pinned model is what actually ran.
