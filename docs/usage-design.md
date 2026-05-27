# Usage Storage Design

`usage.md` describes the general usage-accounting problem. This companion note
tracks Tetra-specific storage and rendering design choices as they evolve.

The goal is not to model every upstream field ahead of time. The goal is to
preserve the data returned by providers, extract the small set of fields Tetra
needs for product surfaces, and avoid duplicating hot conversation state.

## Current Direction

Step data is complete when it arrives.

Unlike message parts, step accounting does not stream in token by token. A step
record becomes available at the end of a model call, after the provider and AI
SDK have produced usage, finish reason, model metadata, and provider-specific
raw data. Once captured, this data should be treated as immutable.

That property changes the storage trade-off. There is less value in exploding
step usage into many reactive cells, because the app does not need fine-grained
updates while a step is being produced. Object records are a better default for
provider usage payloads because they preserve upstream shape and avoid a brittle
schema for every possible token subtype.

Prefer the pure model until there is evidence to add machinery: immutable step
records are canonical, and message/request/session totals can be derived from
those records wherever they are needed. Tetra is not yet pushing session sizes
large enough to require precomputed summaries for efficiency.

## Vocabulary

### Message generation

A message generation is Tetra's volatile streaming state for one assistant
outcome.

It exists mainly to isolate constantly changing UI parts from the committed
message row. This keeps the conversation view manageable in React while text,
reasoning, tool calls, and tool results are still streaming.

Message generations are ephemeral. They should not become stable foreign keys
for immutable usage records.

### Message

A message is the committed user-visible outcome.

For assistant messages, it owns the final conversation parts: text, reasoning,
tool calls, tool results, sources, files, errors, and step boundary parts.

### Step record

A step record is an immutable accounting and metadata record for one completed
model call.

It is not the entire AI SDK step. It should not duplicate message parts,
streamed content, rendered reasoning blocks, or response messages used to build
the next prompt. Those belong to message generation state while streaming, and
to the message after commit.

## Step Table Scope

Tetra stores completed model-call sidecar data in a `steps` table:

```ts
{
  stepId,
  sessionId,
  messageId,
  requestId,
  stepNumber,
  provider,
  model,
  generationId,
  finishReason,
  createdAt,
  usage,
  cost,
  raw,
  warnings,
}
```

The important omission is intentional: no `messageGenerationId`.

The generation row is ephemeral and can be found through more relevant entity
IDs while it exists. The stable relationship is between the step and the
assistant outcome it contributed to, represented by `messageId`, plus the
conversation represented by `sessionId`.

The step table should also avoid storing:

- UI message parts,
- AI SDK `content`,
- streamed text,
- rendered reasoning content,
- response messages used internally by the SDK for subsequent steps.

Those are conversation content, not accounting data.

## Usage Payload Shape

The storage shape should separate interpreted fields from raw provider data.

`usage` contains the small normalized token facts Tetra knows how to
display and sum today:

```ts
{
  input: {
    total,
    noCache,
    cacheRead,
    cacheWrite,
  },
  output: {
    total,
    text,
    reasoning,
  },
  total,
}
```

`raw` preserves provider-native accounting data that should not be promoted to a
top-level cell without a clear read/index/render reason:

```ts
{
  finishReason,
  usage: {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost,
    cost_details,
    ...
  },
}
```

The raw object is important because upstream providers can add fields without
warning. Multimodal usage is a good example: cached audio, image output, video
input, or future provider-specific categories should not be lost simply because
Tetra has not designed a display for them yet.

Every step stores a `raw` object, even when it is empty. This keeps read sites
simple: they can check `raw.usage`, `raw.finishReason`, or future raw keys
directly without also checking whether the raw container exists.

`cost` stores the small interpreted cost facts Tetra renders today:

```ts
{
  total,
  input,
  output,
  currency,
}
```

Provider-specific cost details stay in `raw.usage` so the step row does not
duplicate the same payload twice. Provider-native finish reasons stay in
`raw.finishReason` for the same reason: they are useful for debugging and
reconciliation, but the normal UI reads the normalized `finishReason`.

`warnings` is a separate structured field because SDK/provider warnings explain
why a step may not match the requested settings. It should be permissive:
require a string `type`, preserve unknown extra fields, and treat `feature`,
`details`, and `message` as optional strings.

Every step stores `warnings`, usually as an empty array. Warnings are not
provider raw payload; they are structured SDK diagnostics that may need direct
rendering or inspection.

Missing interpreted fields should mean "not reported or not derivable", not
zero. The raw object is the source for later reconciliation when Tetra learns
how to interpret a new provider field.

## Why Not Fixed Token Cells

Fixed cells such as `inputAudio`, `outputVideo`, or `cachedAudioTokens` look
convenient until the upstream schema moves.

They also blur two different concerns:

- token direction, such as input or output;
- billing or rate category, such as cache read, reasoning, audio, or a provider
  add-on.

The storage layer should not pretend those categories are stable. It should
promote fields only when Tetra needs them for rendering, pricing, or querying.

## Derived Totals

Totals should be derived from step records by default.

Current derivation points:

- message totals for message headers and footers,
- request totals for the request table,
- session totals for conversation-level spend surfaces,
- latest measured prompt size for context-window display.

At the current app scale, these do not need to be stored. A message component
can read the steps for its current request and memoize a local total. A session
view can read all steps for the session when it needs a conversation-level
total.

If a summary is added later, it should be justified by measured UI pressure or a
clear product need. It should remain a derived cache, not a canonical
accounting record. Rebuilding it from immutable step records should always be
possible.

It is acceptable for totals to update at step boundaries rather than
continuously. Step data itself only arrives at step boundaries.

## TinyBase Metrics And Queries

TinyBase Metrics are useful for scalar aggregates over numeric cells in a table.
They are less useful for provider usage stored as nested object records.

TinyBase Queries can group and aggregate row-shaped facts, which might become
interesting if Tetra later introduces a `usageFacts` table. That would make
dynamic reporting easier, but it would also add row count, more schema surface,
and more conceptual machinery.

For the first serious design, manual summary derivation from immutable step
records is likely clearer than forcing usage payloads into Metrics or Queries.

## Options

### Embedded steps on messages

This is close to the current shape.

It keeps message rendering simple, but it mixes immutable accounting sidecars
with conversation content and makes session-level aggregation depend on scanning
message objects.

### Steps table with object usage records

This is the current preferred direction.

It keeps completed model-call accounting in one stable place, preserves raw
provider data, allows indexes by session and message, and avoids a fixed cell
schema for every token subtype.

The trade-off is that message rendering must join from message parts to step
metadata when it wants step headers or usage drill-down.

This option should not automatically imply stored message or session summaries.
The first version should derive totals directly from step rows.

### Steps table plus usage facts table

This would flatten token and cost facts into rows, such as one row per
direction/component/unit.

It would make aggregate reporting and TinyBase query usage easier, but it is
probably too much structure before Tetra knows which reporting surfaces matter.
It also risks creating a custom accounting ledger too early.

## Decisions

### 2026-05-27: Step records do not include `messageGenerationId`

Message generations are ephemeral streaming state. Step records should attach
to stable entities instead: the session, the assistant outcome/message, and the
provider generation ID when available.

### 2026-05-27: Step records store accounting metadata, not parts

Conversation parts remain in message generation state while streaming and in
messages after commit. Step records should not duplicate them.

### 2026-05-27: Preserve provider raw data in one cell

Normalized fields are useful for UI and summaries, but raw provider usage and
provider-native finish reasons should be kept so new upstream fields are not
silently discarded. They live together in one `raw` cell to avoid minting
top-level cells without a concrete read/index/render reason.

### 2026-05-27: Do not store usage summaries without evidence

At current app scale, message, request, and session totals can be derived from
step records at the read sites that need them. Stored summaries add machinery
and duplicate data, so they should wait until there is evidence that deriving
from step rows is too expensive or awkward.

## Open Questions

- Should `stepId` be generated, or derived from `messageId` and `stepNumber`?
- Should generation metadata fetched after the stream be stored on the step row,
  or as a separate reconciliation record joined by provider generation ID?
- How much cost derivation should happen at capture time versus display time
  when a provider returns tokens but not exact cost?
- What evidence would justify adding stored summaries later?
