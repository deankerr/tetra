# Usage Data

Usage data is easy to misread because several useful numbers look similar:

- the tokens in one model call,
- the accumulated outcome shown as one assistant message,
- the current conversation context that will be sent to the model,
- the cumulative billable usage across a conversation,
- and the provider's post-hoc accounting metadata.

Those are related, but they answer different product questions. A good usage
surface should keep them separate.

## Core Concepts

### Step

A step is one model/provider call.

In a tool loop, one assistant message can require many steps:

```text
step 0: model reads conversation, asks to call tools
step 1: model reads conversation + tool result, asks to call more tools
step 2: model reads conversation + more tool results, writes final answer
```

Each step has its own prompt/input tokens, output tokens, finish reason, model
version, provider metadata, and cost. This is the level where provider billing
is usually measured.

Be careful with the word "request". If it is used at all, it should mean the
provider call for a single step, not the user turn and not the assistant
message.

### Message

A message is the user-visible outcome.

For an assistant message, that outcome can include text, reasoning summaries,
tool calls, tool results, sources, files, errors, and step boundaries. The
message is not itself a model call. It is the accumulated result of one or more
steps.

Message usage answers:

- How many steps did this assistant outcome take?
- How many tokens were used to produce this outcome?
- How much did producing this outcome cost?
- Which step produced which text, tool call, or final answer?

### Conversation

A conversation is a sequence of messages.

Conversation usage has two separate ledgers:

- Billing usage: the sum of usage across every completed step.
- Context usage: how many tokens are in the prompt that will be sent to the
  model for the next step.

These ledgers should not be collapsed into one number.

## The Main Trap: Billing Usage Is Not Context Usage

Input tokens are billed per step. In a multi-step tool loop, the same
conversation history can be sent repeatedly. Some of it may be cache-read and
cheaper, but it is still part of the prompt for that step.

That makes cumulative billed input useful for cost, but wrong for a context
window meter.

Example:

```text
model context limit:       400,000 tokens
cumulative billed input:   131,241 tokens  -> 32.8%
latest measured prompt:     69,366 tokens  -> 17.3%
```

The first percentage is a spend/billing fact. The second is much closer to
"how full is the model context right now?"

For a context meter, prefer the tokens in the next assembled prompt. If the next
prompt has not been assembled yet, the latest step's input tokens are the best
measured fallback.

## What We Want To Render

### Per Message

A message-level display should summarize the total outcome and let the user
inspect the steps beneath it.

```text
Assistant message
$0.0201 | 134.3K tokens | 6 steps

Input
130.8K total
72.4K uncached
58.4K cache read

Output
3.5K total
2.3K text
1.2K reasoning

Steps
#0 tool-calls  1.6K tokens   $0.0008
#1 tool-calls 12.3K tokens   $0.0027
#2 tool-calls 12.5K tokens   $0.0005
#3 tool-calls 12.8K tokens   $0.0007
#4 tool-calls 23.7K tokens   $0.0032
#5 stop       71.3K tokens   $0.0122
```

The message headline answers "what did this outcome cost?" The step list
answers "why did it cost that much?"

### Per Conversation

A conversation-level display should show context pressure and spend as distinct
facts.

```text
Context
69.4K / 400K
17.3% of selected model context

Spend
$0.0213 total

Billed tokens
131.2K input
 72.9K uncached
 58.4K cache read
  0.0K cache write
  4.4K output
  1.4K reasoning
```

The context line should not use cumulative billed input. It should use the next
prompt size, or the latest measured prompt size when that is all that is
available.

## Token Categories

Input tokens:

- `input.total`: all prompt tokens for a step.
- `input.noCache`: prompt tokens billed at the normal input rate.
- `input.cacheRead`: prompt tokens read from provider cache, usually cheaper.
- `input.cacheWrite`: prompt tokens written into provider cache, if reported.
- `input.audio`, `input.video`, etc.: modality-specific input tokens, if
  reported.

Output tokens:

- `output.total`: all completion tokens for a step.
- `output.text`: visible text tokens.
- `output.reasoning`: reasoning tokens.
- `output.audio`, `output.image`, etc.: modality-specific output tokens, if
  reported.

When a provider reports only totals plus cache/reasoning details:

```text
input.noCache = input.total - input.cacheRead - input.cacheWrite
output.text   = output.total - output.reasoning - otherOutputModalities
```

Some SDK/provider adapters use "no cache" to mean "not cache-read", which can
include cache-write tokens. For display buckets, prefer exclusive categories so
`input.noCache + input.cacheRead + input.cacheWrite` does not exceed
`input.total`.

Do not assume missing fields are zero in the raw data. A missing field often
means "not reported by this provider/model."

## Cost Categories

The useful cost questions are:

- total cost for one step,
- total cost for one assistant message,
- total cost for the conversation,
- input cost,
- output cost,
- cache-read cost or cache savings,
- cache-write cost, if the provider/model charges for it,
- add-on costs such as web, file, data, or search usage.

Some providers return exact cost. Others return only token counts, so the app
must compute cost from a pricing snapshot.

For cache accounting, distinguish cost from savings:

```text
normal input price:   $0.20 / 1M tokens
cache-read price:     $0.02 / 1M tokens
cache-read savings:   normal input cost - cache-read cost
```

OpenRouter's `usage_cache` value in generation metadata is a negative discount
or savings amount. It is not the cache-read cost itself.

Cache-write accounting is a provider/model-specific open question. Some
providers may charge or report cache writes separately, but an app should not
infer a cache-write cost from an ordinary uncached input charge. Treat
cache-read cost, cache-write cost, and cache savings as separate concepts and
only render a cache-write number when the provider actually reports one or a
provider-specific pricing rule justifies deriving it.

## OpenRouter Generation Metadata

OpenRouter exposes post-hoc generation metadata records. In the captured data,
there is one generation record per step.

These records are not the object returned at the end of a normal text stream.
They are dashboard/API accounting records that can be fetched or inspected after
the provider call has completed.

Important fields:

| Field                                         | Meaning                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `generation_id`                               | Stable ID for the generation. This should match the live SDK step response ID.        |
| `request_id`                                  | OpenRouter's provider-call HTTP request ID.                                           |
| `created_at`                                  | When the generation record was created.                                               |
| `provider_name`                               | Provider that served the generation, such as `OpenAI`.                                |
| `model`                                       | Model slug used by OpenRouter, often including the pinned version.                    |
| `finish_reason`                               | OpenRouter finish reason, such as `tool_calls` or `stop`.                             |
| `native_finish_reason`                        | Native provider finish reason.                                                        |
| `generation_time`                             | Time spent generating, in milliseconds.                                               |
| `latency`                                     | Latency measurement, in milliseconds.                                                 |
| `tokens_prompt`                               | OpenRouter-reported prompt tokens. This can differ from native prompt tokens.         |
| `tokens_completion`                           | OpenRouter-reported completion tokens. This can differ from native completion tokens. |
| `native_tokens_prompt`                        | Provider/model-native prompt tokens.                                                  |
| `native_tokens_cached`                        | Provider/model-native cache-read prompt tokens.                                       |
| `native_tokens_completion`                    | Provider/model-native completion tokens.                                              |
| `native_tokens_reasoning`                     | Provider/model-native reasoning tokens.                                               |
| `native_tokens_completion_images`             | Completion image tokens, when relevant.                                               |
| `usage`                                       | Total billed cost for the generation.                                                 |
| `usage_upstream`                              | Upstream inference cost reported by OpenRouter.                                       |
| `usage_cache`                                 | Negative cache discount/savings.                                                      |
| `usage_data`, `usage_web`, `usage_file`, etc. | Add-on usage costs, often `null`.                                                     |
| `provider_responses`                          | Backend provider response metadata, including status and response ID.                 |

In the captured records, the `native_*` token fields line up with the live AI
SDK step usage. The non-native `tokens_*` fields differ in at least one record,
so reconciliation should prefer `native_*` fields when comparing generation
metadata to model-call usage.

Example generation row:

```json
{
  "generation_id": "gen-1779786498-BqKUHstyo6RzHbrfk8N0",
  "model": "openai/gpt-5.4-nano-20260317",
  "provider_name": "OpenAI",
  "finish_reason": "tool_calls",
  "native_tokens_prompt": 12521,
  "native_tokens_cached": 11776,
  "native_tokens_completion": 235,
  "native_tokens_reasoning": 149,
  "usage": 0.00067827,
  "usage_cache": -0.00211968
}
```

Interpretation:

```text
input total:       12,521
input cache read:  11,776
input uncached:       745
output total:         235
output reasoning:     149
output text:           86
total cost:       $0.00067827
```

Generation metadata is excellent for reconciliation and debugging. It is not a
complete replacement for the live step data because it arrives after the fact.
The live stream does not include many generation-record fields, including
`request_id`, `created_at`, `generation_time`, `latency`, `native_tokens_*`,
`usage_cache`, `provider_responses`, and dashboard/workspace metadata.

The live stream has a smaller `usage` payload. That payload should be treated as
the primary source for real-time step accounting. Generation metadata is a
post-hoc reconciliation source.

### Cache Read, Cache Write, And Savings

In observed OpenRouter records, cache-read accounting appears in both live step
usage and post-hoc generation metadata:

- live raw usage: `prompt_tokens_details.cached_tokens`,
- AI SDK normalized usage: `inputTokenDetails.cacheReadTokens`,
- generation metadata: `native_tokens_cached`.

OpenRouter generation metadata also includes `usage_cache` when a cache discount
was applied. This is a negative savings amount. For example, a Gemini generation
with `native_tokens_prompt: 45998` and `native_tokens_cached: 45010` reported
`usage: 0.00156875` and `usage_cache: -0.01012725`. The `usage` value is the
actual billed total after the cache discount; `usage_cache` is the discount that
made the cached input cheaper than full-price input.

Do not assume the same record contains a cache-write ledger. In the live OpenAI
and Google/Gemini probes, OpenRouter returned
`prompt_tokens_details.cache_write_tokens: 0` even for cold, large prompts that
later produced substantial cache reads. The matching generation metadata exposed
cache-read tokens and cache savings, but no separate cache-write token or
cache-write cost field.

The portable rule is:

- preserve the raw usage object,
- normalize cache-read tokens when reported,
- normalize cache-write tokens only when reported,
- treat missing or zero cache-write fields as "no write value reported", not as
  proof that the provider has no internal cache population cost,
- avoid deriving cache-write cost unless a provider-specific pricing rule says
  how to do so.

## AI SDK Packaging

These notes use AI SDK 6 terminology.

### `streamText`

`streamText` exposes both step-level data and final aggregate data.

Important result fields:

| Field                 | Scope            | Notes                                              |
| --------------------- | ---------------- | -------------------------------------------------- |
| `steps`               | all steps        | Array of `StepResult`, one per model call.         |
| `usage`               | last step        | Last step only. Do not use as a multi-step total.  |
| `totalUsage`          | all steps        | SDK-summed token usage across steps.               |
| `finishReason`        | last step        | Normalized finish reason from the final step.      |
| `rawFinishReason`     | last step        | Provider finish reason from the final step.        |
| `request`             | last step        | Provider-call metadata for the final step.         |
| `response`            | last step        | Response metadata for the final step.              |
| `providerMetadata`    | last step        | Provider-specific metadata for the final step.     |
| `fullStream`          | streaming events | Includes `finish-step` events with per-step usage. |
| `toUIMessageStream()` | message stream   | Converts the step stream into UI message chunks.   |

`totalUsage` aggregates token counts. Provider-specific cost is not generally
promoted into the normalized aggregate, so cost usually needs to be read from
each step's provider/raw usage and summed separately.

### `StepResult`

Each `StepResult` is the durable unit of model-call accounting.

Important fields:

| Field               | Meaning                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `stepNumber`        | Zero-based step index.                                                                  |
| `model`             | Requested model/provider pair.                                                          |
| `content`           | Parts produced by this step: text, reasoning, tool calls, tool results, sources, files. |
| `finishReason`      | SDK-normalized finish reason.                                                           |
| `rawFinishReason`   | Provider-native finish reason.                                                          |
| `usage`             | Normalized token usage for this step, with provider raw usage attached.                 |
| `warnings`          | Provider or SDK warnings for this step.                                                 |
| `request`           | Metadata for the provider call.                                                         |
| `response.id`       | Provider generation ID when available.                                                  |
| `response.modelId`  | Actual/pinned model ID returned by the provider.                                        |
| `response.messages` | Model messages accumulated for the generated response so far.                           |
| `providerMetadata`  | Provider-specific structured metadata.                                                  |

`response.messages` is easy to over-store. In a multi-step tool loop, observed
AI SDK behavior is that later steps contain earlier assistant/tool response
messages plus the newly produced ones. That makes it useful for reconstructing
the next provider call, but it duplicates content already represented by step
parts and message parts.

### `LanguageModelUsage`

The SDK normalizes provider usage into this conceptual shape:

```ts
type LanguageModelUsage = {
  inputTokens: number | undefined
  inputTokenDetails: {
    noCacheTokens: number | undefined
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
  }
  outputTokens: number | undefined
  outputTokenDetails: {
    textTokens: number | undefined
    reasoningTokens: number | undefined
  }
  totalTokens: number | undefined
  raw?: unknown
}
```

`raw` is important. It preserves the provider's original usage payload, which
can include fields that the SDK does not normalize, such as provider-specific
cost details.

Current AI SDK results may also include deprecated top-level aliases such as
`reasoningTokens` and `cachedInputTokens`. Treat those as compatibility noise.
Canonical storage and comparisons should use the nested `inputTokenDetails` and
`outputTokenDetails` fields.

### Stream Events

The full text stream emits events such as:

```text
start
start-step
reasoning-delta
text-delta
tool-call
tool-result
finish-step
finish
```

The `finish-step` event carries the per-step usage:

```ts
{
  type: 'finish-step',
  response,
  usage,
  finishReason,
  rawFinishReason,
  warnings,
  providerMetadata,
}
```

The final `finish` event carries `totalUsage`, the SDK's aggregate token usage
for the whole generated response.

`warnings` has a structured AI SDK type, not an arbitrary raw array. In current
AI SDK 6, the known variants are:

```ts
type CallWarning =
  | { type: 'unsupported'; feature: string; details?: string }
  | { type: 'compatibility'; feature: string; details?: string }
  | { type: 'other'; message: string }
```

For storage, avoid overfitting to that exact union. A future SDK/provider can add
new warning variants, so a durable warning shape should at least require
`type: string`, keep unknown extra fields, and treat `feature`, `details`, and
`message` as optional strings.

For app-owned step records, prefer stable containers: store `raw` as an object
and `warnings` as an array on every step. When there is no provider raw payload,
`raw` can be `{}`; when there are no warnings, `warnings` can be `[]`. Readers
can then check the specific raw key or warning entry they need instead of first
checking whether the container exists.

Do not confuse `fullStream` events with UI message stream chunks. The
`fullStream` `finish-step` event carries accounting data. In observed
`toUIMessageStream()` output, `finish-step` chunks are lifecycle markers without
usage payloads.

### UI Messages

`toUIMessageStream()` converts model-call events into UI message chunks. A
`UIMessage` represents the accumulated outcome the user sees.

A UI message can contain:

- `text` parts,
- `reasoning` parts,
- tool input and output parts,
- source and file parts,
- `step-start` boundary parts.

The UI message stream can also emit `start-step` and `finish-step` chunks while
the message is being built. Those stream chunks are useful lifecycle events, not
the accounting source. The final `UIMessage.parts` array uses `step-start` as
the durable step boundary part.

That makes UI messages the right surface for rendering the conversation, but
steps remain the right surface for model-call accounting.

## OpenRouter Through AI SDK

With the OpenRouter AI SDK provider, OpenRouter usage appears in three places:

### Live Stream Usage, Not Generation Metadata

The OpenRouter AI SDK provider does not surface the whole OpenRouter generation
metadata object for text generation.

For chat and completion calls, the provider parses the OpenRouter
chat/completion response. That response can contain a `usage` object shaped like
this:

```ts
{
  prompt_tokens: number
  prompt_tokens_details?: {
    cached_tokens: number
    cache_write_tokens?: number | null
    audio_tokens?: number
    video_tokens?: number
  } | null
  completion_tokens: number
  completion_tokens_details?: {
    reasoning_tokens: number
    image_tokens?: number
    audio_tokens?: number
  } | null
  total_tokens: number
  cost?: number
  is_byok?: boolean
  cost_details?: {
    upstream_inference_cost?: number | null
    upstream_inference_prompt_cost?: number
    upstream_inference_completions_cost?: number
  } | null
}
```

For streaming calls, the provider watches streamed chunks for `usage`. When a
chunk contains usage, it:

- normalizes token counts into the AI SDK `LanguageModelUsage` shape,
- keeps the original provider usage object as `usage.raw`,
- copies a smaller summary into `providerMetadata.openrouter.usage`,
- emits that usage on the final stream finish event.

It does not call or embed the post-hoc generation metadata endpoint as part of
the stream result.

The provider can ask OpenRouter to include usage in the response. In current
provider code this can happen through OpenRouter's `usage: { include: true }`
setting, and in strict compatibility mode through
`stream_options.include_usage`. The exact transport detail is provider-specific;
the important product fact is that the stream emits a usage object, not a
generation record.

### Normalized SDK Usage

OpenRouter raw usage fields are normalized like this:

| OpenRouter raw usage                         | AI SDK usage                         | Meaning                                 |
| -------------------------------------------- | ------------------------------------ | --------------------------------------- |
| `prompt_tokens`                              | `inputTokens`                        | Total prompt tokens.                    |
| `prompt_tokens_details.cached_tokens`        | `inputTokenDetails.cacheReadTokens`  | Cache-read prompt tokens.               |
| `prompt_tokens_details.cache_write_tokens`   | `inputTokenDetails.cacheWriteTokens` | Cache-write prompt tokens, if reported. |
| `completion_tokens`                          | `outputTokens`                       | Total completion tokens.                |
| `completion_tokens_details.reasoning_tokens` | `outputTokenDetails.reasoningTokens` | Reasoning tokens.                       |
| `total_tokens`                               | `totalTokens`                        | Total input plus output tokens.         |
| full raw `usage` object                      | `raw`                                | Provider-specific usage payload.        |

### Provider Metadata

OpenRouter also passes structured metadata through `providerMetadata.openrouter`:

```ts
{
  provider: string
  reasoning_details?: unknown[]
  usage: {
    promptTokens: number
    promptTokensDetails?: { cachedTokens: number }
    completionTokens: number
    completionTokensDetails?: { reasoningTokens: number }
    totalTokens: number
    cost?: number
    costDetails?: { upstreamInferenceCost: number }
  }
}
```

This is useful for display and debugging, but it may not include every raw field
the provider returned. Keep `usage.raw` available when exact reconciliation
matters. In the probe data, `providerMetadata.openrouter.usage` omitted fields
that remained available in `usage.raw`, including `cache_write_tokens`, audio,
video, and image token fields, `is_byok`, and the prompt/completion cost split.

### Post-Hoc Generation Metadata

OpenRouter generation metadata can be joined back to the live step through the
generation ID:

```text
AI SDK step.response.id  ==  OpenRouter generation_id
```

That join allows a usage UI to reconcile live SDK data with post-hoc dashboard
data such as provider latency, backend response status, cache savings, and
OpenRouter's own billing report.

This join is optional for core accounting. The live step usage should already
have the token counts and cost needed for ordinary billing display, assuming
OpenRouter included usage in the model response. The generation metadata adds
diagnostics and reconciliation fields that are not part of the stream.

## Assembly Required By An App

To answer the product questions, an app generally has to assemble usage at
three scopes.

Step:

- capture normalized token usage,
- keep provider raw usage,
- keep generation ID and model ID,
- keep finish reason and provider metadata,
- capture step cost if the provider reports it.

Message:

- group the steps that contributed to the assistant outcome,
- sum token usage across those steps,
- sum cost across those steps,
- keep the step list available for drill-down.

Conversation:

- sum finalized step usage for billing totals,
- sum finalized step cost for spend totals,
- compute current context from the next assembled prompt,
- use the latest measured step prompt only as a fallback for context.

Cost:

- if provider raw usage includes exact cost, sum exact step costs,
- if only token counts are available, compute cost from a pricing snapshot,
- if cache-read/cache-write cost needs to be shown, keep either exact cost
  details or the pricing snapshot required to derive them,
- treat provider add-on costs as separate optional buckets.

## Checklist

- Do not use cumulative billed input tokens as a context-window percentage.
- Do not treat one assistant message as one model call.
- Do not treat top-level `streamText().usage` as a multi-step total.
- Do use `steps` for per-model-call accounting.
- Do use `totalUsage` for SDK-summed token totals.
- Do sum provider/raw cost yourself when cost is not normalized.
- Do preserve generation IDs so live step data can be reconciled with provider
  generation metadata.
- Do keep cache-read cost, cache-write cost, and cache savings conceptually
  distinct.
