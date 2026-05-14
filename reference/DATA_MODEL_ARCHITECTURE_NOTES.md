# Data Model Architecture Notes

Scratchpad from inspecting dev TinyBase snapshots and session-led exports.

This is not a formal proposal. It collects observations and design pressure points for later discussion.

## Domain: Core Shape

The current data model is good enough for baseline chat, but the latest inspection work shows that several distinct concepts are collapsed into `messages.parts`.

`messages.parts` currently acts as:

- the visible transcript,
- the live streaming UI state,
- the tool call/result log,
- raw tool output storage,
- provider continuation metadata storage,
- the source for future model context,
- and the easiest inspection surface.

That collapse is the central architectural issue. Jina output size is a symptom, not the root problem.

## Domain: Transcript

The human-visible transcript wants to be stable, compact, and editable.

The data suggests transcript rows should probably not own every raw execution detail forever. A message can reference execution artifacts without embedding all of their raw payloads inline.

Possible direction:

- Keep `messages` focused on authored/user-visible conversation.
- Let messages reference request, step, tool, and artifact records.
- Treat AI SDK `UIMessage` as a view derived from canonical rows, not necessarily the canonical storage model.

## Domain: Requests And Steps

A single request can contain multiple provider calls because tool loops create multiple steps.

Older usage captures showed final-step OpenRouter usage diverging from AI SDK total usage. The newer usage shape confirms the better model:

- `finalStep`: the final provider call,
- `steps`: each provider call,
- `total`: aggregate across the whole request.

Possible direction:

- Keep `requests` as the user-initiated run.
- Add first-class `modelSteps` for each provider call.
- Store per-step status, model, usage, cost, request/response metadata, and compiled context reference.
- Store aggregate request usage as a derived or cached summary.

## Domain: Tool Executions

Jina results quickly dominate context. Observed Jina output character counts include:

- `571,266` chars in one session,
- `394,617` chars in another,
- `214,866` chars in a single request.

The problem is not simply that Jina is verbose. It is that raw external data is stored inline in the conversation and then fed back into future model calls.

Possible direction:

- Add `toolExecutions` as first-class rows.
- Store tool input, status, timestamps, and output summary separately from raw output.
- Store large raw outputs as `artifacts`.
- Let messages reference tool executions instead of embedding raw tool payloads.

## Domain: Artifacts

Search results, fetched pages, generated files, and maybe long model outputs all want artifact semantics.

Useful artifact fields:

- source kind,
- source URL or query,
- content type,
- character count,
- token estimate if available,
- hash,
- raw storage location,
- summary/excerpt,
- created request/step/tool ids.

Possible direction:

- Keep raw content available for inspection and reprocessing.
- Feed summaries or excerpts into later model calls by default.
- Make full raw inclusion an explicit context decision.

## Domain: Context Assembly

Current context assembly is implicit: recent messages are converted with `convertToModelMessages`.

The data shows this is fragile. Follow-up prompts can exceed provider limits because earlier tool outputs are silently included in full.

Observed errors:

- `205376 tokens > 200000 maximum`
- `205538 tokens > 200000 maximum`

Possible direction:

- Introduce a context compiler.
- Give it model/provider budget awareness.
- Let it choose messages, summaries, excerpts, artifacts, and omissions.
- Persist a context manifest for each model step.
- Make omissions explicit, e.g. "Jina result omitted: 214866 chars, summary included."

## Package: `@tetra/store`

Current schema is intentionally small:

- `sessions`
- `messages`
- `requests`

That minimal model made rapid iteration easy, but now hides important distinctions inside object/array cells.

Likely future tables:

- `modelSteps`
- `toolExecutions`
- `artifacts`
- `contextBundles` or `contextManifests`
- maybe `messageLinks` if transcript rows reference non-message entities.

## Package: `@tetra/runtime`

Runtime currently owns orchestration, request execution, message selection, and message mutation.

The architectural pressure is that runtime needs to become the place where context is compiled, not just where messages are gathered.

Possible direction:

- Split "load transcript" from "compile model context".
- Store the compiled context manifest before each provider call.
- Apply tool output retention policies before calling inference.
- Track partial/error execution more explicitly.

## Package: `@tetra/inference`

Inference currently wraps AI SDK/OpenRouter and emits UI message snapshots.

The recent investigation showed:

- OpenRouter returns raw/provider usage and cost.
- AI SDK normalizes usage.
- AI SDK `totalUsage` aggregates across steps.
- Provider metadata may contain continuation-critical reasoning details.
- `toUIMessageStream` is useful, but it is designed for UI transport more than canonical persistence.

Possible direction:

- Keep inference free of TinyBase.
- Return structured run events in addition to UI snapshots.
- Preserve per-step usage/cost/provider metadata.
- Avoid making UI stream shape the only durable representation.

## Package: `@tetra/tools`

Jina currently returns large markdown strings directly as tool output.

Possible direction:

- Let tools return artifact references plus summaries.
- Store raw payloads separately.
- Attach character counts and token estimates at the tool boundary.
- Make each tool define its own inspection and context-retention behavior.

## Concept: Usage And Cost

We can now observe cost and tokens for successful completed requests with the new usage shape.

Still missing or weak:

- usage for errored/partial runs,
- cost attribution for failed requests where a tool or partial model step happened,
- per-context-component token attribution,
- provider-independent cost normalization.

Possible direction:

- Store per-step usage as canonical.
- Derive request totals from steps.
- Add context component token estimates to the context manifest.
- Preserve provider-specific raw accounting for audit/debugging.

## Concept: Reasoning And Provider Metadata

Reasoning has two roles:

- visible/inspectable model reasoning summaries,
- provider continuation state such as OpenRouter `reasoning_details`.

Those should not be treated as the same data.

Possible direction:

- Store display reasoning separately from continuation metadata.
- Keep exact provider continuation data when needed for future calls.
- Filter or summarize continuation metadata in inspection exports.

## Concept: Inspection Data

The new snapshot exports are already useful:

- table-led JSON,
- session-led joined JSON,
- reasoning detail truncation,
- Jina content truncation with character counts,
- per-step usage shape in newer requests.

Inspection output should remain derived and lossy. Canonical data should remain exact unless a retention policy explicitly says otherwise.

## Open Questions

- What is the canonical boundary between transcript and execution trace?
- Should raw tool outputs always be retained locally?
- When should raw artifacts be eligible for omission from model context?
- Should context bundles be fully persisted or only manifests?
- How should summaries be generated, invalidated, and tied back to source artifacts?
- How much of AI SDK `UIMessage` should be canonical vs derived?
- What should happen to partially completed requests on app restart?
- How should cost accounting work for failed or interrupted runs?
