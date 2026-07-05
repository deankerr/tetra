# OpenRouter Feature Map

Catalog of OpenRouter capabilities, organized by theme. Each entry: what it is, current status, doc reference.

Compiled 2026-06-13, re-annotated 2026-07-05 against the codebase.

**Legend:** ✅ done · 🟡 partial · 🔧 passthrough · ⬜ not implemented · ➖ nothing to build

- **🔧 passthrough** — fully usable _today_ by hand-authoring JSON in the provider-options editor ([provider-options-editor.tsx](../../apps/web/src/session/settings/provider-options-editor.tsx)), which is passed verbatim as `providerOptions.openrouter` to `streamText` ([run.ts](../../packages/core/src/runtime/run.ts)). What's missing is dedicated schema/UI, not capability. Only request-_body_ fields qualify — header-only and separate-endpoint features are `⬜` because the editor shapes the body only.

Out of scope by decision: enterprise features (orgs, workspaces, guardrails admin, observability destinations, sovereign AI), account management (key management API, credits, analytics), and manual protocol selection (chat completions vs responses vs anthropic messages).

---

## 1. Model Catalog & Discovery

### Models API metadata

`GET /api/v1/models` returns rich per-model metadata: pricing (input/output/request/image/web-search/caching), context window, max completion tokens, input/output modalities, `supported_parameters`, tokenizer, deprecation dates. Filterable by modality/parameters, sortable by price/context/throughput/latency/popularity/recency.

- **🟡 partial.** [catalog.ts](../../packages/core/src/catalog.ts) fetches hourly and persists id, name, provider, context length, modalities, and `supported_parameters`. **Pricing, max completion tokens, tokenizer, and deprecation dates are dropped at parse time.** The picker ([picker.tsx](../../apps/web/src/session/settings/model-picker/picker.tsx)) has search, modality filters, favorites, sort modes, provider grouping — but ignores `supported_parameters` and can't show prices. CLI has a `models` command.
- Ref: https://openrouter.ai/docs/guides/overview/models

### Endpoints API

`GET /api/v1/models/:author/:slug/endpoints` lists the concrete provider endpoints behind a model — per-provider pricing, quantization, uptime, latency/throughput.

- **⬜ not implemented.** No endpoint-level data anywhere; pairs with a provider routing panel.
- Ref: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints

### Model variants (slug suffixes)

Suffix variants of a base model: `:free`, `:extended` (longer context), `:thinking`, `:nitro` (throughput-sorted), `:exacto` (tool-calling-optimized), `:floor` (cheapest, opts out of Auto Exacto). `:online` is deprecated in favor of the web search server tool.

- **🟡 incidental.** Variants that appear as separate models-API entries (e.g. `:free`) land in the catalog as independent rows; suffixes can also be typed into `modelId`. No variant-aware grouping or toggles in the picker.
- Ref: https://openrouter.ai/docs/guides/routing/model-variants/free

### Latest-resolution aliases

`~author/family-latest` resolves to the newest model in a family; response `model` reports the concrete model used. Not reproducible by design.

- **➖ available via picker.** Just a model id — routes like any other. The resolved model is captured per step (`response.modelId`, [steps.ts](../../packages/core/src/runtime/steps.ts)), backing reproducibility.
- Ref: https://openrouter.ai/docs/guides/routing/routers/latest-resolution

---

## 2. Routing Controls

### Provider routing (`provider` object)

Per-request control over which endpoints serve the request: `order`, `only`/`ignore`, `allow_fallbacks`, `require_parameters`, `sort` (price/throughput/latency), `max_price`, `quantizations`, `data_collection`, `zdr`, `preferred_min_throughput`/`preferred_max_latency`.

- **🔧 passthrough.** No schema, validation, or dedicated UI. The serving provider is already persisted per step (`steps.provider`) and shown in the run detail sheet ([run-detail-sheet.tsx](../../apps/web/src/session/run-detail-sheet.tsx)).
- Ref: https://openrouter.ai/docs/guides/routing/provider-selection

### Model fallbacks (`models` array)

Ordered fallback models tried automatically on provider downtime, rate limits, context-length errors, or moderation refusals. Billed at whichever model answered.

- **🔧 passthrough.** A `models` array passes through, but the run config holds a single `modelId` — no first-class fallback concept in schema or UI.
- Ref: https://openrouter.ai/docs/guides/routing/model-fallbacks

### Routers (meta-models)

Special model slugs that pick the real model server-side:

- **Auto Router** (`openrouter/auto`) — NotDiamond selection; optional `session_id` stickiness, model allowlist wildcards, 0–10 cost/quality dial.
- **Pareto Router** (`openrouter/pareto-code`) — cheapest coding model above a `min_coding_score` threshold.
- **Fusion Router** (`openrouter/fusion`) — up to 8 models answer in parallel, judge compares, outer model synthesizes (~4–5× cost). Also the `openrouter:fusion` server tool.
- **Free Models Router** — routes among free models.
- **Body Builder** (`openrouter/bodybuilder`) — natural language → array of valid request bodies.

- **➖ available via picker.** Routers are just model ids; those in the models API are selectable like any model. Optional router-specific knobs (Auto Router `session_id`/cost dial, Fusion panel composition) remain hand-authorable via provider options.
- Refs: https://openrouter.ai/docs/guides/routing/routers/auto-router · /pareto-router · /fusion-router · /free-router · /body-builder

---

## 3. Request Features

### Full sampling parameter surface

Beyond OpenAI basics: `top_k`, `min_p`, `top_a`, `repetition_penalty`, `seed`, `logit_bias`, `logprobs`/`top_logprobs`, `stop`, `verbosity`. `supported_parameters` reports per-model support.

- **🔧 passthrough.** No typed params panel, no per-model gating (though `supported_parameters` is already in the catalog). AI SDK first-class params (`temperature`, `topP`, `maxOutputTokens`, …) aren't wired up either — providerOptions is the only knob.
- Ref: https://openrouter.ai/docs/api/reference/parameters

### Unified reasoning (`reasoning` object)

One parameter across vendors: `effort` (minimal→xhigh), `max_tokens` (Anthropic/Gemini/Qwen budget), `enabled`, `exclude`. Reasoning streams as `reasoning_details` chunks (`reasoning.text`/`.summary`/`.encrypted`); preserving them across turns matters for tool loops.

- **✅ functional.** Configured per run config via provider options and displayed end to end: `streamText` runs with `sendReasoning: true`, reasoning parts are persisted and rendered ([parts.tsx](../../apps/web/src/session/message/parts.tsx)), token counts captured per step ([usage.ts](../../packages/core/src/usage.ts)). One open nuance: **verbatim `reasoning_details` round-trip is unverified** — transcripts rebuilt via `convertToModelMessages` may not preserve structured/encrypted reasoning blocks across turns. Confirm before leaning hard on multi-turn reasoning + tools.
- Ref: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

### Tool calling + Auto Exacto

Standardized `tools`/`tool_choice`/`parallel_tool_calls`. OpenRouter validates args against JSON Schema; **Auto Exacto** reorders providers by tool-call reliability (default on; opt out with `:floor`).

- **✅ functional.** Client-side tool calling works end to end: registry ([tools.ts](../../packages/core/src/tools/tools.ts), Exa + datetime), per-config `toolIds`, multi-step loop (`stopWhen: stepCountIs(6)`), step records per tool round. Auto Exacto applies upstream. `tool_choice`/`parallel_tool_calls` aren't exposed as controls and the step cap is hardcoded, but the core capability is complete.
- Refs: https://openrouter.ai/docs/guides/features/tool-calling · https://openrouter.ai/docs/guides/routing/auto-exacto

### Structured outputs

`response_format: { type: "json_schema", strict: true }`. Check `supported_parameters=structured_outputs`; combine with `require_parameters`. Response Healing plugin repairs malformed JSON (non-streaming).

- **🔧 passthrough.** No "schema mode" on run configs and no internal use yet (auto-titling, tagging).
- Ref: https://openrouter.ai/docs/guides/features/structured-outputs

### Prompt caching

Provider-level caches with sticky routing; `session_id` (≤256 chars) pins the provider for cache continuity. OpenAI/Gemini/DeepSeek/Groq automatic; Anthropic and Qwen need `cache_control: { type: "ephemeral" }` breakpoints (≤4, optional `ttl: "1h"`). Savings reported via `cached_tokens`, `cache_write_tokens`, `cache_discount`.

- **🟡 mostly done.** `session_id` is sent per Tetra session ([run.ts](../../packages/core/src/runtime/run.ts)); cache read/write tokens captured per step ([steps.ts](../../packages/core/src/runtime/steps.ts)) and rendered in the run detail sheet. **Remaining gap: Anthropic/Qwen `cache_control` breakpoints** on long system prompts (message-content, so not editor-reachable). Minor: `cache_discount` unextracted.
- Ref: https://openrouter.ai/docs/guides/best-practices/prompt-caching

### Context compression (message transforms)

Plugin `{ id: "context-compression" }` middle-out truncates oversized prompts (keeps start + end). Auto-enabled for ≤8k-context models unless disabled.

- **🔧 passthrough.** Tetra's own lever is `maxMessages` on run configs (client-side truncation). Auto-enable on small-context models can fire unnoticed — detection needs router metadata (§6).
- Ref: https://openrouter.ai/docs/guides/features/message-transforms

### Response caching

`X-OpenRouter-Cache: true` header caches identical requests server-side; hits are instant and free. TTL 1s–24h.

- **⬜ not implemented.** Header-only, so not editor-reachable — `createOpenRouter` is called with apiKey only ([language-model-resolver.ts](../../packages/core/src/runtime/language-model-resolver.ts)).
- Ref: https://openrouter.ai/docs/guides/features/response-caching

### Presets (server-side config)

Named server-side configs (`@preset/slug`) bundling model/fallbacks, system prompt, params, routing, with version history. Referenced via slug or `preset` field; request params shallow-merge over the preset.

- **🔧 passthrough.** `@preset/slug` in `modelId` or a `preset` field passes through; picker/catalog have no preset awareness. Overlaps philosophically with our local run configs.
- Ref: https://openrouter.ai/docs/guides/features/presets

### Service tiers

`service_tier: "flex" | "priority"` trades cost vs latency (flex ≈ 50% discount; OpenAI + Google only).

- **🔧 passthrough.**
- Ref: https://openrouter.ai/docs/guides/features/service-tiers

---

## 4. Server Tools & Plugins

### Server tools (`{ type: "openrouter:..." }` in the tools array)

OpenRouter executes these server-side mid-request — no client implementation, and they mix with our function tools:

| Tool                          | What it does                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `openrouter:web_search`       | Model-initiated web search (auto/native/Exa/Parallel/Perplexity/Firecrawl). `max_results`, domain lists, `url_citation` annotations.      |
| `openrouter:web_fetch`        | Fetch URL content.                                                                                                                        |
| `openrouter:datetime`         | Current date/time awareness.                                                                                                              |
| `openrouter:image_generation` | On-demand image gen inside a text conversation.                                                                                           |
| `openrouter:apply_patch`      | Model proposes file edits as diffs.                                                                                                       |
| `openrouter:fusion`           | Panel-of-models + judge consultation.                                                                                                     |
| `openrouter:advisor`          | Mid-generation consultation of a stronger model; sub-agent tools, transcript forwarding, cross-request memory.                            |
| `openrouter:subagent`         | Delegate a self-contained task to a cheaper worker model (`model`, `instructions`, `max_tool_calls`; no history, only server tools nest). |

Usage is reported in the `usage` object (e.g. `web_search_requests`).

- **⬜ not implemented.** The registry is exclusively client-side function tools (`createTool` + `execute`); no representation for an execution-less, config-only tool, and the `tools` array sent to `streamText` can't carry an `openrouter:` entry (so not editor-reachable). The two existing client tools (Exa search, datetime) duplicate server-tool equivalents and could be replaced without the EXA_API_KEY requirement. Advisor/subagent overlap with the sub-agents vision (`reference/sub-agents.md`).
- Refs: https://openrouter.ai/docs/guides/features/server-tools/overview · /web-search · /web-fetch · /datetime · /image-generation · /apply-patch · /fusion · /advisor · /subagent

### Plugins (`plugins` array — run once per request)

Response Healing (`response-healing`), Context Compression (§3), PDF parsing (§5), Pareto Router defaults, Web Search.

- **🔧 passthrough** (via a `plugins` array entry).
- Ref: https://openrouter.ai/docs/guides/features/plugins/overview

---

## 5. Multimodal

### Image input / output

Additional surface beyond baseline: `image_config` (aspect ratio, resolution, provider options), image-to-image editing via input images + strength, streaming image generation. Output arrives as base64 data URLs; `modalities: ["image", "text"]` selects output modes.

- **✅ done.** Image attachments in the composer ([composer.tsx](../../apps/web/src/session/composer.tsx)), file parts rendered inline ([parts.tsx](../../apps/web/src/session/message/parts.tsx)), image output tokens captured. `image_config` (aspect/resolution/strength) remains passthrough with no dedicated UI.
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

### PDF inputs

`file` content part (URL or base64), works with all models. Engines via plugin: `native`, `pdf-text`/Cloudflare AI (free fallback), `mistral-ocr`. Responses include **file annotations** (hash + parsed content) resendable to skip re-parsing.

- **⬜ not implemented.** Composer accepts images only; the file-part renderer has a generic branch but nothing produces PDF parts, and no annotation persistence exists.
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/pdfs

### Audio in / out (chat completions)

Input: `input_audio` content part (base64 only). Output: `modalities: ["text", "audio"]` + voice/format; requires streaming, audio in `delta.audio`.

- **⬜ not implemented.** Audio tokens parse in step usage if they appear, but no input/output path exists.
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/audio

### Video input

`video_url` content part; provider-specific (e.g. YouTube on Gemini).

- **⬜ not implemented.**
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/videos

### Dedicated endpoints (separate from chat)

TTS `/api/v1/audio/speech`, STT `/api/v1/audio/transcriptions`, video generation `/api/v1/videos` (async), embeddings `/api/v1/embeddings`, rerank `/api/v1/rerank`.

- **⬜ not implemented.** All need real client work, not passthrough. STT/TTS are the most chat-adjacent; embeddings only matter for local RAG over transcripts.

---

## 6. Observability, Usage & Reliability

### Usage accounting (always on)

Every response includes full usage: prompt/completion/total tokens, reasoning tokens, cached + cache-write tokens, and **cost**. Streaming: in the final SSE chunk.

- **✅ implemented — the strongest area.** Per-step capture ([steps.ts](../../packages/core/src/runtime/steps.ts)) parses SDK-normalized usage _and_ raw OpenRouter fields (cost, `cost_details` incl. BYOK, cached/cache-write/reasoning/audio/image tokens), stores sparse rows plus the full raw blob; [usage.ts](../../packages/core/src/usage.ts) aggregates per run. Run detail sheet renders tokens, cache, cost with per-step breakdown and JSON export. Session-level aggregation is the main gap.
- Ref: https://openrouter.ai/docs/cookbook/administration/usage-accounting

### Generation endpoint

`GET /api/v1/generation?id=...` retrieves usage/cost/provider details for a past generation by response id.

- **🟡 prerequisite done.** `generationId` is persisted on every step and shown in the run detail sheet; no fetch against the endpoint yet.
- Ref: https://openrouter.ai/docs/api/api-reference/generations/get-generation

### Router metadata

`X-OpenRouter-Metadata: enabled` header → `openrouter_metadata`: requested slug, routing strategy, retry attempt, candidate + selected endpoints, and a `pipeline` of plugins that touched the request. Streaming + non-streaming; surfaces on errors.

- **⬜ not implemented.** Header-only. We get serving provider + concrete model per step via `providerMetadata`, but strategy/attempts/candidates/pipeline are invisible. Open question whether the AI SDK provider exposes `openrouter_metadata`.
- Ref: https://openrouter.ai/docs/guides/features/router-metadata

### Errors & debugging

Consistent `{ error: { code, message, metadata } }`; mid-stream errors as SSE events with `finish_reason: "error"` under HTTP 200. Moderation errors include flagged-text metadata. `debug: { echo_upstream_body: true }` echoes the transformed provider payload as the first chunk.

- **🟡 mostly done.** Runs now persist a nested `error` object — `{ message, status?, detail? }` — holding the flattened message, the HTTP status, and the raw provider payload verbatim (rendered as a collapsible JSON blob in the run detail sheet). The original structured error is captured at the `toUIMessageStream` boundary before the AI SDK flattens it to text ([run.ts](../../packages/core/src/runtime/run.ts), [runs.ts](../../packages/core/src/runtime/runs.ts)). Steps also keep `finishReason`/`rawFinishReason` + warnings. Remaining: `echo_upstream_body` (a body field, editor-reachable) is unused.
- Ref: https://openrouter.ai/docs/api/reference/errors-and-debugging

### App attribution

`HTTP-Referer` + `X-Title` headers attribute traffic to the app.

- **⬜ not implemented.** Header-only — `createOpenRouter({ apiKey })` sets none.
- Ref: https://openrouter.ai/docs/app-attribution

---

## 7. Credentials & Privacy

### OAuth PKCE

One-click "connect your OpenRouter account": redirect to `openrouter.ai/auth` with `callback_url` + S256 `code_challenge`, exchange the code at `/api/v1/auth/keys`. Localhost callbacks on any port (good for CLI).

- **⬜ not implemented.** Credentials are manual paste: `@tetra/credentials` localStorage registry keyed by `OPENROUTER_API_KEY`, gated in the new-session flow ([new-session-page.tsx](../../apps/web/src/session/new-session-page.tsx)).
- Ref: https://openrouter.ai/docs/guides/overview/auth/oauth

### Privacy routing knobs

`provider.data_collection: "deny"` and `provider.zdr: true` restrict routing to non-retaining endpoints; `GET /api/v1/endpoints/zdr` lists ZDR endpoints.

- **🔧 passthrough** (a subset of the `provider` object).
- Refs: https://openrouter.ai/docs/guides/privacy/provider-logging · https://openrouter.ai/docs/guides/routing/provider-selection

---

## Gap summary (2026-07-05)

- **Done**: usage/cost accounting per step (best-in-class), client tool-calling loop (Auto Exacto upstream), reasoning (config + display), image in/out, `session_id` cache stickiness, structured error capture (message + status + raw payload), run config snapshots, run inspector.
- **Partial**: catalog drops pricing/deprecation at parse time; `supported_parameters` persisted but unused; generationId persisted but endpoint unqueried; `reasoning_details` round-trip unverified; Anthropic/Qwen `cache_control` breakpoints unmanaged.
- **🔧 Passthrough (usable now, needs UI)**: provider routing, model fallbacks, sampling params, structured outputs, context compression, presets, service tiers, plugins, privacy knobs.
- **Absent (needs client work)**: app attribution + router-metadata + response-caching headers, server tools, PDF/audio/video, dedicated endpoints, OAuth PKCE.
- **Cheapest wins remaining**: app attribution headers, keep pricing in the catalog.

## Cross-cutting notes

1. Provider routing, fallbacks, reasoning, plugins, and server-tool config are all natural run-config fields; "requests as first-class entities" pairs with persisting `usage`, `openrouter_metadata`, and the resolved model per request.
2. Two round-trip obligations shape the message data model: `reasoning_details` (verbatim for multi-turn reasoning/tool flows) and PDF file annotations (resend to avoid re-parse costs).
3. Server tools need a distinct representation (no executor, config-only, `openrouter:` type) but slot into the same registry/toggle UX. Advisor/subagent overlap with the sub-agents vision.
