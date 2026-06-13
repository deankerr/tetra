# OpenRouter Feature Map

Research compiled 2026-06-13 from https://openrouter.ai/docs. Catalog of OpenRouter capabilities Tetra could surface, organized by theme. Each entry: what it is, why it matters for Tetra, doc reference.

Annotated 2026-06-13 against the current codebase. Legend: ✅ implemented · 🟡 partial · ⬜ not implemented · ➖ nothing to build.

A cross-cutting note on status: the `providerOptions` cell on run configs ([run-config.ts](../../packages/store-schema/src/run-config.ts)) is passed verbatim as `providerOptions.openrouter` to `streamText` ([run.ts](../../packages/core/src/runtime/run.ts)), and the web app has a free-form key/value editor for it ([provider-options-editor.tsx](../../apps/web/src/session/settings/provider-options-editor.tsx)). So most request-body features below are _reachable today_ by hand-authoring JSON — "⬜" for those means "no dedicated schema/UI/behavior", not "impossible".

Out of scope by decision: enterprise features (orgs, workspaces, guardrails admin, broadcast/observability destinations, sovereign AI), account management (key management API, credits, analytics), and manual protocol selection (chat completions vs responses vs anthropic messages — we stay on whatever the AI SDK provider uses).

Current baseline: standard LLM chat with image input/output via Vercel AI SDK + OpenRouter provider. Most features below are request-body fields or headers, so they pass through the AI SDK via the OpenRouter provider's `extraBody`/provider options — a few (TTS/STT, video, OAuth) are separate endpoints.

---

## 1. Model Catalog & Discovery

### Models API metadata

`GET /api/v1/models` returns rich per-model metadata: pricing (input/output/request/image/web-search/caching), context window, max completion tokens, input/output modalities, `supported_parameters` (tools, reasoning, structured_outputs, …), tokenizer, deprecation dates. Supports filtering by modality/parameters and sorting by price/context/throughput/latency/popularity/recency.

- Tetra: this is the backbone of a power-user model picker — capability badges, price display, "find cheapest tool-calling model", filtering the catalog by what the current session needs (e.g. only show vision models when images are attached). We already refresh a catalog; the question is how much of this metadata we persist and expose.
- **Status: 🟡 partial.** [catalog.ts](../../packages/core/src/catalog.ts) fetches `/api/v1/models` hourly and persists id, name, provider, context length, modalities, and `supported_parameters` to the `languageModels` table. **Pricing, max completion tokens, tokenizer, and deprecation dates are dropped at parse time.** The picker ([picker.tsx](../../apps/web/src/session/settings/model-picker/picker.tsx)) supports search, modality filters, favorites, sort modes, and provider grouping — but doesn't use `supported_parameters` and can't show prices. CLI has a `models` command.
- Ref: https://openrouter.ai/docs/guides/overview/models

### Endpoints API

`GET /api/v1/models/:author/:slug/endpoints` lists the concrete provider endpoints behind a model — per-provider pricing, quantization, uptime, latency/throughput stats.

- Tetra: powers a per-model "providers" view and informed provider-routing choices. Pure power-user transparency.
- **Status: ⬜ not implemented.** No endpoint-level data anywhere; would pair with the provider routing panel below.
- Ref: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints

### Model variants (slug suffixes)

Suffix-based variants of a base model: `:free`, `:extended` (longer context), `:thinking` (reasoning-enabled), `:nitro` (throughput-sorted), `:exacto` (tool-calling-optimized provider set), `:floor` (cheapest, opts out of Auto Exacto). `:online` is deprecated in favor of the web search server tool.

- Tetra: cheap to support (it's just a model id), but a good picker surfaces variants as toggles on the base model rather than separate catalog entries.
- **Status: 🟡 incidental.** Variants that appear as separate entries in the models API (e.g. `:free`) land in the catalog as independent rows; suffixes can also be typed into `modelId` by hand. No variant-aware grouping or toggles in the picker.
- Ref: https://openrouter.ai/docs/guides/routing/model-variants/free (sibling pages per variant)

### Latest-resolution aliases

`~author/family-latest` (e.g. `~anthropic/claude-opus-latest`) resolves to the newest model in a family. Response `model` field reports the concrete model used. No fallback if the family is empty; not reproducible by design.

- Tetra: nice option for run configs that should track frontier releases; we already snapshot the resolved model per request so reproducibility concerns are mitigated by our own records.
- **Status: ⬜ not implemented** as a picker concept — though the resolved-model record already exists: steps persist `response.modelId` per step ([steps.ts](../../packages/core/src/runtime/steps.ts)), so the concrete model that served an aliased request would be captured today.
- Ref: https://openrouter.ai/docs/guides/routing/routers/latest-resolution

---

## 2. Routing Controls

### Provider routing (`provider` object)

Per-request control over which provider endpoints serve the request: `order`, `only`/`ignore`, `allow_fallbacks`, `require_parameters` (only providers supporting every requested feature), `sort` (price/throughput/latency), `max_price`, `quantizations`, `data_collection` (allow/deny), `zdr`, `preferred_min_throughput`/`preferred_max_latency`.

- Tetra: this is the flagship "power users shape the system" feature — a provider routing panel on run configs. `require_parameters` is especially relevant when combining structured outputs/tools with routing.
- **Status: 🟡 passthrough only.** Hand-authorable via the provider-options editor (a `provider` object entry); no schema, validation, or dedicated UI. The serving provider is already persisted per step (`providerMetadata.openrouter.provider` → `steps.provider`) and shown in the run detail sheet ([run-detail-sheet.tsx](../../apps/web/src/session/run-detail-sheet.tsx)), so the read side has a head start.
- Ref: https://openrouter.ai/docs/guides/routing/provider-selection

### Model fallbacks (`models` array)

Ordered list of fallback models tried automatically on provider downtime, rate limits, context-length validation errors, or moderation refusals. Billed at whichever model actually answered.

- Tetra: fits naturally into run configs (primary model + ordered fallbacks). Pairs with router metadata to show which model actually served the request.
- **Status: ⬜ not implemented.** Run config holds a single `modelId`. (A `models` array in providerOptions may pass through, but the config shape and UI have no fallback concept.)
- Ref: https://openrouter.ai/docs/guides/routing/model-fallbacks

### Routers (meta-models)

Special model slugs that pick the real model server-side:

- **Auto Router** (`openrouter/auto`) — NotDiamond-powered selection by prompt complexity/task; optional `session_id` stickiness (5-min pin), model allowlist wildcards, 0–10 cost/quality dial. No routing fee.
- **Pareto Router** (`openrouter/pareto-code`) — cheapest currently-available coding model above a `min_coding_score` quality threshold (Artificial Analysis percentile tiers).
- **Fusion Router** (`openrouter/fusion`) — panel of up to 8 models answer in parallel, judge model compares, outer model synthesizes. ~4–5× cost of a single completion. Also exposed as the `openrouter:fusion` server tool on any base model.
- **Free Models Router** — routes among free models.
- **Body Builder** (`openrouter/bodybuilder`) — natural language → array of valid OpenRouter request bodies (free; for building parallel multi-model requests).

- Tetra: routers are just model ids, so they come almost for free once the picker treats them as first-class entries. Fusion is a genuinely interesting power-user toy; Body Builder could back a "fan out this prompt to N models" UX.
- **Status: 🟡 incidental.** Router slugs that appear in the models API show up in the catalog and can be selected like any model; no router-specific config (session_id, cost dial, panel composition) or presentation.
- Refs: https://openrouter.ai/docs/guides/routing/routers/auto-router · /pareto-router · /fusion-router · /free-router · /body-builder

---

## 3. Request Features

### Full sampling parameter surface

Beyond the OpenAI basics: `top_k`, `min_p`, `top_a`, `repetition_penalty`, `seed`, `logit_bias`, `logprobs`/`top_logprobs`, `stop`, `verbosity`. The models API reports `supported_parameters` per model.

- Tetra: a parameters panel that greys out unsupported params per model (derive from catalog) is exactly the "controls, not hidden details" vision. Pair with `provider.require_parameters`.
- **Status: 🟡 passthrough only.** All hand-authorable via the provider-options editor; `supported_parameters` is already in the catalog but unused by any UI. No typed params panel, no per-model gating. Note: AI SDK first-class params (`temperature`, `topP`, `maxOutputTokens`, …) aren't wired up either — providerOptions is currently the only knob.
- Ref: https://openrouter.ai/docs/api/reference/parameters

### Unified reasoning (`reasoning` object)

One parameter across vendors: `effort` (minimal→xhigh, OpenAI/Grok), `max_tokens` (Anthropic/Gemini/Qwen budget), `enabled`, `exclude` (use reasoning but don't return it). Reasoning streams as `reasoning_details` delta chunks (types: `reasoning.text`, `reasoning.summary`, `reasoning.encrypted`). Preserving reasoning across turns matters for tool loops: pass back `message.reasoning_details` unmodified.

- Tetra: reasoning controls per run config + transcript rendering of reasoning blocks + correctly round-tripping `reasoning_details` in multi-turn/tool flows. The round-trip requirement has data-model implications (store reasoning_details on assistant messages verbatim).
- **Status: 🟡 partial.** Display side works: `streamText` runs with `sendReasoning: true`, reasoning parts are persisted in message parts and rendered ([parts.tsx](../../apps/web/src/session/message/parts.tsx)); reasoning token counts are captured per step and summarized ([usage.ts](../../packages/core/src/usage.ts)). The `reasoning` request object is passthrough-only (no config UI). **Verbatim `reasoning_details` round-trip is unverified** — transcripts are rebuilt from UI parts via `convertToModelMessages` ([run.ts](../../packages/core/src/runtime/run.ts)), which carries reasoning text but may not preserve structured/encrypted reasoning blocks across turns. Needs investigation before leaning on multi-turn reasoning + tools.
- Ref: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

### Tool calling + Auto Exacto

Standardized `tools`/`tool_choice`/`parallel_tool_calls` across models. OpenRouter validates tool-call args against JSON Schema and tracks per-provider Tool Call Error Rate; **Auto Exacto** automatically reorders providers for tool-calling requests by tool-call reliability (default on; opt out with `:floor`).

- Tetra: we get most of this through the AI SDK already; the interesting bits are surfacing `parallel_tool_calls` as a control and knowing Auto Exacto exists when explaining provider selection.
- **Status: ✅ core loop / 🟡 controls.** Client-side tool calling works end to end: registry ([tools.ts](../../packages/core/src/tools/tools.ts), Exa + datetime), per-config `toolIds`, multi-step loop (`stopWhen: stepCountIs(6)`), step records per tool round. No `tool_choice`/`parallel_tool_calls` controls; step cap is hardcoded. Auto Exacto applies automatically upstream — nothing to build, but nothing surfaces it either.
- Refs: https://openrouter.ai/docs/guides/features/tool-calling · https://openrouter.ai/docs/guides/routing/auto-exacto

### Structured outputs

`response_format: { type: "json_schema", strict: true }` with JSON Schema. Check model support via `supported_parameters=structured_outputs`; combine with `require_parameters` to avoid silently lax providers. The Response Healing plugin repairs malformed JSON on non-streaming requests.

- Tetra: candidate for a "schema mode" on a run config; also useful internally (title generation, tagging).
- **Status: ⬜ not implemented.** No `response_format` anywhere; no internal structured-output use yet (no auto-titling etc.).
- Ref: https://openrouter.ai/docs/guides/features/structured-outputs

### Prompt caching

Provider-level prompt caches with sticky routing to keep them warm; explicit `session_id` (body or `x-session-id` header, ≤256 chars) pins provider for cache continuity. OpenAI/Gemini/DeepSeek/Groq etc. are automatic; Anthropic and Qwen need `cache_control: { type: "ephemeral" }` breakpoints (Anthropic: ≤4 breakpoints, optional `ttl: "1h"`). Savings reported via `usage.prompt_tokens_details.cached_tokens`, `cache_write_tokens`, and `cache_discount`.

- Tetra: send a stable `session_id` per Tetra session (near-free win), optionally manage Anthropic cache breakpoints for long system prompts, and render cache hit/discount stats in usage display.
- **Status: 🟡 read side only.** Cache read/write tokens are captured per step (SDK details with raw `prompt_tokens_details` fallback, [steps.ts](../../packages/core/src/runtime/steps.ts)) and rendered in the run detail sheet. **No `session_id` is sent** — the near-free win is unclaimed — and no `cache_control` management; `cache_discount` isn't extracted.
- Ref: https://openrouter.ai/docs/guides/best-practices/prompt-caching

### Context compression (message transforms)

Plugin `{ id: "context-compression" }` middle-out truncates oversized prompts to fit the model's context (keeps start + end, drops the middle). Auto-enabled for ≤8k-context models unless disabled.

- Tetra: tension with our Context Management goal — we likely want explicit user-driven context selection, with this as an opt-in safety net. Worth knowing it can silently alter prompts; surfacing when it fired (via router metadata `pipeline`) keeps the user in control.
- **Status: ⬜ not implemented** (passthrough-reachable). Tetra has its own lever instead: `maxMessages` on run configs truncates the transcript client-side before sending. Note the auto-enable on small-context models can fire today without us noticing — detection requires router metadata (§6).
- Ref: https://openrouter.ai/docs/guides/features/message-transforms

### Response caching

`X-OpenRouter-Cache: true` header caches identical requests (same key/model/body) server-side; hits are instant and free. TTL 1s–24h (default 5 min). Disabled under ZDR.

- Tetra: niche for chat (bodies rarely repeat) but useful for regeneration/compare-models workflows and dev iteration.
- **Status: ⬜ not implemented.** No custom headers are sent at all — `createOpenRouter` is called with apiKey only ([language-model-resolver.ts](../../packages/core/src/runtime/language-model-resolver.ts)).
- Ref: https://openrouter.ai/docs/guides/features/response-caching

### Presets (server-side config)

Named server-side configs (`@preset/slug`) bundling model/fallbacks, system prompt, params, provider routing, with version history. Referenced via model slug or `preset` field; request params shallow-merge over the preset.

- Tetra: philosophically overlaps with our local RunConfigs — we probably keep config local-first. Still worth supporting _referencing_ a preset slug as a model id for users who already maintain presets on OpenRouter.
- **Status: 🟡 incidental.** `@preset/slug` typed into `modelId` should pass through unimpeded (it's just a string); untested, and the picker/catalog has no preset awareness.
- Ref: https://openrouter.ai/docs/guides/features/presets

### Service tiers

`service_tier: "flex" | "priority"` trades cost vs latency (flex ≈ 50% discount, higher latency; OpenAI + Google providers only). Response reports the tier that actually served.

- Tetra: cheap to expose as a run-config dropdown.
- **Status: ⬜ not implemented** (passthrough-reachable).
- Ref: https://openrouter.ai/docs/guides/features/service-tiers

---

## 4. Server Tools & Plugins

### Server tools (`{ type: "openrouter:..." }` in the tools array)

OpenRouter executes these server-side mid-request — no client implementation, and they mix freely with our own function tools:

| Tool                          | What it does                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openrouter:web_search`       | Model-initiated web search. Engines: auto/native/Exa/Parallel/Perplexity/Firecrawl(BYOK). Options: `max_results` (1–25), `max_total_results`, `search_context_size`, domain allow/exclude lists. Results return as `url_citation` annotations. ~$0.005/request for Exa/Parallel/Perplexity. Replaces the deprecated `:online` variant / web plugin. |
| `openrouter:web_fetch`        | Fetch URL content.                                                                                                                                                                                                                                                                                                                                  |
| `openrouter:datetime`         | Current date/time awareness.                                                                                                                                                                                                                                                                                                                        |
| `openrouter:image_generation` | On-demand image gen inside a text conversation.                                                                                                                                                                                                                                                                                                     |
| `openrouter:apply_patch`      | Model proposes file edits as diffs.                                                                                                                                                                                                                                                                                                                 |
| `openrouter:fusion`           | Panel-of-models + judge consultation (see Fusion Router).                                                                                                                                                                                                                                                                                           |
| `openrouter:advisor`          | Mid-generation consultation of a stronger model; optional sub-agent tools, transcript forwarding, multiple named advisors, cross-request memory via transcript replay.                                                                                                                                                                              |
| `openrouter:subagent`         | Delegate a self-contained task to a cheaper/faster worker model (`model`, `instructions`, `max_tool_calls` 1–25; no conversation history; only server tools nestable).                                                                                                                                                                              |

Server tool usage is reported in the `usage` object (e.g. `web_search_requests`).

- Tetra: high leverage. A "server tools" section in the tool registry (toggles + per-tool config) gives web search, fetch, image gen, and date awareness with zero execution infrastructure. Advisor/subagent are a server-side cousin of our sub-agents vision (`reference/sub-agents.md`) — worth studying their shape (task delegation, no shared history, recursion guards) even where we build our own.
- **Status: ⬜ not implemented.** The tool registry is exclusively client-side AI SDK function tools (`createTool` + `execute`); there's no representation for an execution-less, config-only tool, and the `tools` array sent to `streamText` can't currently carry an `openrouter:` entry. Notably the two existing client tools (Exa web search, datetime) duplicate server-tool equivalents — server tools could replace or complement them without the EXA_API_KEY credential requirement.
- Refs: https://openrouter.ai/docs/guides/features/server-tools/overview · /web-search · /web-fetch · /datetime · /image-generation · /apply-patch · /fusion · /advisor · /subagent

### Plugins (`plugins` array — run once per request)

- **Response Healing** (`response-healing`) — auto-repairs malformed JSON for structured outputs (non-streaming).
- **Context Compression** — see §3.
- **PDF parsing** — see §5.
- **Pareto Router defaults**, **Web Search (deprecated)**.

- **Status: ⬜ not implemented** (passthrough-reachable via a `plugins` array entry in providerOptions).
- Ref: https://openrouter.ai/docs/guides/features/plugins/overview

---

## 5. Multimodal

### Image input / output

Already supported in Tetra. Additional surface: `image_config` (aspect ratio 1:1–21:9, resolution 0.5K–4K, provider-specific options), image-to-image editing via input images + strength, streaming image generation. Output arrives as base64 data URLs in the assistant message's `images` field; `modalities: ["image", "text"]` selects output modes.

- **Status: ✅ baseline / 🟡 config.** Image attachments in the composer ([composer.tsx](../../apps/web/src/session/composer.tsx), `accept="image/*"`), file parts rendered inline including images ([parts.tsx](../../apps/web/src/session/message/parts.tsx)); image output tokens are even captured in step usage. No `image_config` surface (aspect/resolution/strength) beyond passthrough.
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

### PDF inputs

`file` content part, URL or base64, works with _all_ models. Parsing engines via plugin config: `native` (models with file support, billed as input tokens; default), `pdf-text` / Cloudflare AI (free markdown conversion fallback), `mistral-ocr` (scanned/image-heavy, per-1k-pages pricing, ≤8 images forwarded). Responses include **file annotations** (hash + parsed content) that can be resent on follow-ups to skip re-parsing — annotations even survive in error metadata for retries.

- Tetra: strong candidate for the media/file-support goal. Data-model note: persist file annotations alongside messages to avoid re-parse costs in multi-turn.
- **Status: ⬜ not implemented.** Composer accepts images only; the file-part renderer has a generic branch but nothing produces PDF parts, and no annotation persistence exists.
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/pdfs

### Audio in / out (chat completions)

Input: `input_audio` content part, base64 only (no URLs), WAV/MP3/OGG/FLAC/etc. Output: `modalities: ["text", "audio"]` + voice/format config; **requires streaming**, audio arrives base64 in `delta.audio`.

- **Status: ⬜ not implemented** (audio tokens are parsed in step usage if they ever appear, but no input/output path exists).
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/audio

### Video input

`video_url` content part; provider-specific (e.g. YouTube URLs on Gemini).

- **Status: ⬜ not implemented.**
- Ref: https://openrouter.ai/docs/guides/overview/multimodal/videos

### Dedicated endpoints (separate from chat)

- **TTS** `/api/v1/audio/speech` (MP3/PCM out) — https://openrouter.ai/docs/guides/overview/multimodal/tts
- **STT** `/api/v1/audio/transcriptions` — https://openrouter.ai/docs/guides/overview/multimodal/stt
- **Video generation** `/api/v1/videos` (async, poll + webhook delivery) — https://openrouter.ai/docs/guides/overview/multimodal/video-generation
- **Embeddings** `/api/v1/embeddings` and **Rerank** `/api/v1/rerank` — https://openrouter.ai/docs/api/reference/embeddings

- Tetra: lower priority; STT (voice input) and TTS (read responses aloud) are the most chat-adjacent. Embeddings only matter if we build local RAG/search over transcripts.
- **Status: ⬜ not implemented** (all of them; these need real client work, not passthrough).

---

## 6. Observability, Usage & Reliability

### Usage accounting (always on)

Every response now includes full usage automatically: prompt/completion/total tokens (native tokenizer), reasoning tokens, cached + cache-write tokens, and **cost** (account charge). Streaming: arrives in the final SSE chunk. The old `usage: { include: true }` opt-in is deprecated.

- Tetra: aligns directly with "requests are a first-class, persisted entity" — persist the whole usage object per request, show cost in the UI, aggregate per session.
- **Status: ✅ implemented — the strongest area.** Per-step capture in [steps.ts](../../packages/core/src/runtime/steps.ts) parses SDK-normalized usage _and_ raw OpenRouter fields (cost, `cost_details` incl. BYOK upstream costs, cached/cache-write/reasoning/audio/image tokens), stores sparse normalized rows plus the full raw usage blob, and [usage.ts](../../packages/core/src/usage.ts) aggregates per run. Run detail sheet renders tokens, cache, and cost with per-step breakdown and JSON export. Session-level aggregation is the main gap.
- Ref: https://openrouter.ai/docs/cookbook/administration/usage-accounting

### Generation endpoint

`GET /api/v1/generation?id=...` retrieves usage/cost/provider details for any past generation by response id.

- Tetra: backfill or audit tool for persisted requests.
- **Status: 🟡 prerequisite done.** `generationId` (the response id) is persisted on every step and shown in the run detail sheet; no fetch against the endpoint yet.
- Ref: https://openrouter.ai/docs/api/api-reference/generations/get-generation

### Router metadata

`X-OpenRouter-Metadata: enabled` header → response includes `openrouter_metadata`: requested slug, routing strategy, retry attempt, candidate endpoints + selected one, and a `pipeline` of plugins that materially affected the request (compression, healing, guardrails, tools). Works streaming + non-streaming; also surfaces on errors.

- Tetra: the transparency feature. "Which provider actually served this, what was retried, did compression touch my prompt" rendered on the request inspector. Cheap to adopt (one header + persist the object).
- **Status: ⬜ not implemented.** No headers are sent. We do already get the serving provider and concrete model per step via `providerMetadata`, which covers the most-asked question — but strategy/attempts/candidates/pipeline are invisible. Open question: whether the AI SDK provider exposes the `openrouter_metadata` response object; may need `extraBody`/fetch-level access.
- Ref: https://openrouter.ai/docs/guides/features/router-metadata

### Errors & debugging

Consistent `{ error: { code, message, metadata } }`; mid-stream errors arrive as SSE events with `finish_reason: "error"` under HTTP 200. Moderation errors include flagged-text metadata. `debug: { echo_upstream_body: true }` (streaming) echoes the transformed provider payload as the first chunk — shows exactly what OpenRouter sent upstream.

- Tetra: persist error responses on the request entity; `echo_upstream_body` is a killer dev/power-user inspector feature ("show me the real request").
- **Status: 🟡 partial.** Runs persist a flattened `errorMessage` string and terminal status; step records keep `finishReason` + `rawFinishReason` and warnings. The structured error object (code, moderation metadata) is not preserved, and `echo_upstream_body` is unused.
- Ref: https://openrouter.ai/docs/api/reference/errors-and-debugging

### Zero completion insurance

Automatic, no setup: no charge when a response has zero completion tokens with blank/error finish reason.

- **Status: ➖ nothing to build** (upstream default).
- Ref: https://openrouter.ai/docs/guides/features/zero-completion-insurance

### App attribution

`HTTP-Referer` + `X-Title` headers attribute traffic to the app (leaderboard/marketplace presence).

- Tetra: two static headers; trivially done.
- **Status: ⬜ not implemented.** `createOpenRouter({ apiKey })` only — no headers configured.
- Ref: https://openrouter.ai/docs/app-attribution

---

## 7. Credentials & Privacy (selective)

### OAuth PKCE

One-click "connect your OpenRouter account": redirect to `openrouter.ai/auth` with `callback_url` + S256 `code_challenge`, exchange the returned code at `/api/v1/auth/keys` for a user-controlled API key. Localhost callbacks supported on any port (good for CLI).

- Tetra: a much smoother onboarding than paste-your-key, while keeping the user-owns-credentials model. Works for both web and CLI surfaces.
- **Status: ⬜ not implemented.** Credentials are manual paste: `@tetra/credentials` localStorage registry keyed by `OPENROUTER_API_KEY`, gated in the new-session flow ([new-session-page.tsx](../../apps/web/src/session/new-session-page.tsx)).
- Ref: https://openrouter.ai/docs/guides/overview/auth/oauth

### Privacy routing knobs

`provider.data_collection: "deny"` and `provider.zdr: true` restrict routing to non-retaining endpoints; `GET /api/v1/endpoints/zdr` lists ZDR endpoints. Provider-by-provider logging policies documented.

- Tetra: belongs in the provider-routing panel as privacy toggles.
- **Status: ⬜ not implemented** (passthrough-reachable, same as provider routing).
- Refs: https://openrouter.ai/docs/guides/privacy/provider-logging · https://openrouter.ai/docs/guides/routing/provider-selection

---

## Cross-cutting observations

1. **Most features are request-body fields** (`provider`, `models`, `reasoning`, `plugins`, server tools, `session_id`, `image_config`) or headers (`X-OpenRouter-Metadata`, `X-OpenRouter-Cache`). With the AI SDK OpenRouter provider these flow through provider options/extraBody — no protocol work needed. The exceptions are the dedicated endpoints (TTS/STT/video/embeddings/generation/models) and OAuth.
2. **Config snapshot synergy**: provider routing, fallbacks, reasoning, plugins, and server-tool config are all natural RunConfig fields, and "requests as first-class entities" pairs perfectly with persisting `usage`, `openrouter_metadata`, and the resolved model per request.
3. **Two round-trip obligations** shape the message data model: `reasoning_details` (must be returned verbatim for multi-turn reasoning/tool flows) and PDF file annotations (resend to avoid re-parse costs).
4. **Routers and variants are just model ids** — the catalog/picker design decides how visible they are, at near-zero runtime cost.
5. **Server tools vs our tool registry**: server tools need a distinct representation (no executor, config-only, `openrouter:` type) but slot into the same registry/toggle UX. Advisor/subagent overlap with the sub-agents vision and are worth a comparative read before we design ours.

## Gap summary (from the 2026-06-13 annotation pass)

Where Tetra stands today, condensed:

- **Strong**: usage/cost accounting per step (best-in-class capture incl. raw payloads), client tool-calling loop, reasoning display, image in/out, run config snapshots, run inspector.
- **Half-built**: catalog (drops pricing/deprecation at parse time), `supported_parameters` persisted but unused, generationId persisted but generation endpoint unqueried, errors flattened to strings, reasoning round-trip unverified.
- **Unstructured**: everything reachable only through the free-form providerOptions editor — provider routing, fallbacks, sampling params, reasoning config, plugins, service tiers, privacy knobs. The doc's recurring theme: the passthrough exists; the power-user _controls_ don't yet.
- **Absent**: all headers (app attribution, router metadata, response caching), `session_id` for cache stickiness, server tools, structured outputs, PDF/audio/video, dedicated endpoints, OAuth PKCE.
- **Cheapest wins available**: app attribution headers, `session_id` per session, keep pricing in the catalog, stop dropping the structured error object.
