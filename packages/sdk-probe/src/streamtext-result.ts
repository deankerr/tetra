// oxlint-disable no-inline-comments
// oxlint-disable sort-keys

/**
 * Captures the complete AI SDK streamText result, annotated.
 * Goal: document everything available so we can decide later what to store where.
 * Run: bun run --filter @tetra/sdk-probe streamtext-result
 *
 * Output files:
 *   overall.json          — genuinely cross-step data (totalUsage, finishReason, warnings)
 *   step-N.json           — per-step metadata, usage, providerMetadata, content
 *   step-N-request.json   — exact JSON body sent to the provider for that step
 *   step-N-response.json  — inbound response metadata including ModelMessage[] history
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, stepCountIs, tool } from 'ai'
import { z } from 'zod'

const MODEL = 'deepseek/deepseek-v4-flash'
const OUT = join(import.meta.dir, '../output')

// Clear and recreate the output dir so every run is a clean snapshot.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const apiKey = process.env.OPENROUTER_API_KEY
if (apiKey === undefined) {
  throw new Error('OPENROUTER_API_KEY not set')
}

const openrouter = createOpenRouter({ apiKey })

const getCurrentDateTime = tool({
  description: 'Get the current local date, time, and timezone.',
  execute: () => {
    const now = new Date()
    const fmt = Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' })
    const { locale, timeZone } = fmt.resolvedOptions()
    return { iso: now.toISOString(), local: fmt.format(now), locale, timeZone }
  },
  inputSchema: z.object({}),
})

const result = streamText({
  messages: [{ role: 'user', content: 'What is the exact current time? Use the tool.' }],
  model: openrouter(MODEL),
  providerOptions: {
    openrouter: {
      reasoning: { effort: 'low' },
    },
  },
  stopWhen: stepCountIs(4),
  tools: { getCurrentDateTime },
})

// Drain the stream — all result promises below resolve only after this.
await result.consumeStream()

// ─── Resolve everything the SDK exposes ──────────────────────────────────────

const [
  steps,
  totalUsage,
  // Top-level convenience fields below are aliases for the LAST step only.
  // In a multi-step run they do NOT aggregate across steps.
  // Most are NOT captured — use step-N.json for per-step data.
  finishReason, // normalised: 'stop' | 'tool-calls' | 'length' | 'error' | 'content-filter' | 'other'
  warnings, // any SDK warnings (deprecations, unsupported params, etc.)
] = await Promise.all([result.steps, result.totalUsage, result.finishReason, result.warnings])

// ─── NOT CAPTURED (and why) ──────────────────────────────────────────────────
//
// ── Top-level last-step aliases (use step-N.json instead) ──
// result.content          — last step only; full content is in step-N.json
// result.text             — derived from content[type=text]; in step-N.json
// result.reasoning        — derived from content[type=reasoning]; in step-N.json
// result.reasoningText    — convenience string of reasoning; in step-N.json
// result.sources          — last step only; in step-N.json
// result.files            — last step only; in step-N.json
// result.toolCalls        — ALWAYS EMPTY when last step is 'stop' (tool-loop case)
// result.toolResults      — ALWAYS EMPTY when last step is 'stop' (tool-loop case)
// result.providerMetadata — last step only; in step-N.json
// result.request          — last step only; in step-N.json
// result.response         — last step only; in step-N.json
//
// ── Methods ──
// result.toUIMessageStream()             — method, not data
// result.pipeUIMessageStreamToResponse() — method, not data
// result.toUIMessageStreamResponse()     — method, not data
// result.toTextStreamResponse()          — method, not data
// result.pipeTextStreamToResponse()      — method, not data
// result.consumeStream()                 — method, already called above
// result.partialOutputStream             — ReadableStream<TextStreamPart>, consumed above
// result.elementStream                   — structured output stream, unused here
// result.output                          — requires experimental_output config
//
// ── Not available on top-level result ──
// result.rawFinishReason  — only on each step
//
// ── Per-step fields omitted from step-N.json ──
// step.text               — derived from step.content[type=text]; redundant
// step.reasoning          — derived from step.content[type=reasoning]; redundant
// step.reasoningText      — convenience string; derived from step.reasoning
// step.sources            — derived from step.content; redundant
// step.files              — derived from step.content; redundant
// step.toolCalls          — derived from step.content[type=tool-call]; redundant
// step.toolResults        — derived from step.content[type=tool-result]; redundant
// step.staticToolCalls    — always === step.toolCalls when no dynamic tools are used
// step.dynamicToolCalls   — always empty when no dynamic tools are used
// step.staticToolResults  — always === step.toolResults when no dynamic tools are used
// step.dynamicToolResults — always empty when no dynamic tools are used
// step.stepType           — does NOT exist in ai@6.0.177 (field removed or never added)
// step.functionId         — telemetry group ID, undefined without experimental_telemetry
// step.metadata           — telemetry key-value bag, undefined without experimental_telemetry
// step.experimental_context — our own credential bag; we already have it

// ─── overall.json ────────────────────────────────────────────────────────────
// Only fields that are genuinely cross-step aggregates or describe the run as a whole.

const overall = {
  // The normalised outcome of the final step — describes whether the whole run succeeded.
  finishReason,

  // totalUsage is the only field the SDK actually aggregates across steps.
  // NOTE: cost is NOT included — the SDK does not sum it. Sum steps[n].usage.raw.cost manually.
  totalUsage,

  // SDK-level warnings (deprecations, unsupported params). Step-level warnings are in step-N.json.
  warnings,
}

// ─── step-N.json / step-N-request.json / step-N-response.json ───────────────
// One set of files per step. step-N.json has metadata and content; request and
// response are split out because they are large and often inspected separately.

for (const step of steps) {
  const n = step.stepNumber

  const stepData = {
    stepNumber: n,

    finishReason: step.finishReason, // normalised
    rawFinishReason: step.rawFinishReason, // raw provider string, e.g. 'tool_calls'

    // The model object — { provider, modelId } using the requested alias.
    // The pinned version actually served is in step-N-response.json as modelId.
    model: step.model,

    // Full usage for this step.
    // usage.raw is the unmodified provider JSON — cost lives here as usage.raw.cost
    // because the AI SDK does not promote cost into the normalised fields.
    usage: step.usage,

    // Full provider metadata for this step.
    // OpenRouter shape: { openrouter: { usage, provider, reasoning_details } }
    // - usage: mirrors step.usage with extra fields (costDetails, promptTokensDetails)
    // - provider: the backend that actually served the request ('Novita', 'DeepSeek', etc.)
    // - reasoning_details: the reasoning chain — also duplicated on each content item's
    //   providerMetadata (OpenRouter quirk). Read reasoning from step.content instead.
    providerMetadata: step.providerMetadata,

    // Content parts produced in this step — the cleanest representation of what happened.
    // Part shapes:
    //   { type: 'reasoning', text, providerMetadata }
    //   { type: 'text', text, providerMetadata }
    //   { type: 'tool-call', toolCallId, toolName, input, providerMetadata }
    //   { type: 'tool-result', toolCallId, toolName, output, providerMetadata }
    // Note: providerMetadata on each part is an OpenRouter quirk — it repeats the
    // step-level reasoning_details on every part, not part-specific metadata.
    content: step.content,

    warnings: step.warnings,
  }

  // The exact JSON body sent to the provider for this step.
  // Includes model, full message history at this point, tools, and providerOptions.
  // Essential for debugging: confirms reasoning effort, message serialisation, tool schema.
  // Note: outbound headers are not recorded by the SDK.
  const requestData = step.request

  // Inbound response metadata for this step.
  // response.messages is the ModelMessage[] produced by this step's exchange —
  // the correct surface for building the next turn's (or step's) message history.
  const responseData = {
    id: step.response.id, // generation ID — use for OpenRouter dashboard tracing
    modelId: step.response.modelId, // pinned version, e.g. 'deepseek/deepseek-v4-flash-20260423'
    timestamp: step.response.timestamp,
    headers: step.response.headers,
    messages: step.response.messages,
  }

  writeFileSync(join(OUT, `step-${n}.json`), JSON.stringify(stepData, null, 2))
  writeFileSync(join(OUT, `step-${n}-request.json`), JSON.stringify(requestData, null, 2))
  writeFileSync(join(OUT, `step-${n}-response.json`), JSON.stringify(responseData, null, 2))
}

writeFileSync(join(OUT, 'overall.json'), JSON.stringify(overall, null, 2))

const files = [
  'overall.json',
  ...steps.flatMap((s) => [
    `step-${s.stepNumber}.json`,
    `step-${s.stepNumber}-request.json`,
    `step-${s.stepNumber}-response.json`,
  ]),
]
console.log(files.join('\n'))
