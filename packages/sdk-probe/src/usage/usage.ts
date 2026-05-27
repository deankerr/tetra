// oxlint-disable no-console
// oxlint-disable no-inline-comments
// oxlint-disable sort-keys

/**
 * Focused OpenRouter + AI SDK usage probe.
 *
 * Goal: confirm which usage/cost fields are available from live streaming
 * results, how they are packaged per step vs final result, and how much of the
 * OpenRouter raw usage survives through the AI SDK.
 *
 * Run: bun run --filter @tetra/sdk-probe usage
 *
 * Output files:
 *   run.json                       - run-level settings and top-level result aliases
 *   steps.json                     - durable per-step accounting surfaces
 *   field-map.json                 - normalized/raw/provider-metadata comparison
 *   stream-events.json             - compact AI SDK stream/UI-message event summaries
 *   raw-provider-usage-chunks.json - OpenRouter raw chunks that contained usage/errors
 *   tool-executions.json           - local tool inputs and canned outputs
 *
 * Not captured:
 *   - OpenRouter generation metadata endpoint rows. This script checks only the
 *     live response path because that is what streamText returns.
 *   - Full text/reasoning deltas. We keep previews and lengths so the output is
 *     commit-friendly.
 *   - API headers beyond what the AI SDK exposes in step.response.headers.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, stepCountIs, tool } from 'ai'
import { z } from 'zod'

const MODEL = 'openai/gpt-5.4-nano'
const OUT = join(import.meta.dir, 'output')
const RUN_STARTED_AT = new Date().toISOString()

const SYSTEM_PROMPT = [
  'You are advising a TypeScript/React developer.',
  'Today is Wednesday, May 27, 2026 in Australia/Melbourne.',
  'Use the search tool before answering, then give a concise recommendation.',
].join('\n')

const USER_PROMPT = [
  'what libs can help me built an llm agent system in typescript/react?',
  'Make two targeted searches before the final answer.',
  'Use startPublishedDate only if you specifically need recent material.',
].join('\n')

type JsonRecord = Record<string, unknown>

interface UsageLike {
  inputTokenDetails: {
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
    noCacheTokens: number | undefined
  }
  inputTokens: number | undefined
  outputTokenDetails: {
    reasoningTokens: number | undefined
    textTokens: number | undefined
  }
  outputTokens: number | undefined
  raw?: unknown
  totalTokens: number | undefined
}

interface UsageStep {
  model: { modelId: string }
  providerMetadata: unknown
  rawFinishReason: string | undefined
  response: { id: string; modelId: string }
  stepNumber: number
  usage: UsageLike
}

interface ToolExecution {
  input: JsonRecord
  output: JsonRecord
  toolName: 'exaSearch'
}

// Start every run with a clean adjacent output directory.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Keep failures durable too, because provider/API shape bugs are often visible there.
try {
  await runProbe()
} catch (error) {
  writeJson('error.json', serializeError(error))
  throw error
}

async function runProbe() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey === undefined) {
    throw new Error('OPENROUTER_API_KEY not set')
  }

  // Usage accounting is an OpenRouter model setting; this is what asks the live
  // response to include usage rather than requiring a later generation lookup.
  const openrouter = createOpenRouter({ apiKey })
  const model = openrouter(MODEL, {
    reasoning: { effort: 'low' },
    usage: { include: true },
  })

  // The fake Exa tool keeps this probe focused on OpenRouter/AI SDK usage
  // packaging while still exercising the same multi-step tool loop shape.
  const toolExecutions: ToolExecution[] = []
  const exaSearch = tool({
    description:
      'Search the web for current technical information. Use targeted queries; startPublishedDate is only for explicitly recent material.',
    execute: (input) => {
      const output = buildSearchOutput(input)
      toolExecutions.push({ input: toRecord(input), output, toolName: 'exaSearch' })
      return output
    },
    inputSchema: z.object({
      query: z.string(),
      startPublishedDate: z.string().optional(),
    }),
  })

  // Callback collections let us compare what arrives at step-finish time with
  // what the final result promises expose after the stream is consumed.
  const stepFinishEvents: unknown[] = []
  const finalFinishEvents: unknown[] = []
  const streamChunks: unknown[] = []
  const rawProviderUsageChunks: unknown[] = []

  // Force a small but real tool loop: two model calls that must use a tool,
  // then a final model call that must answer without calling more tools.
  const result = streamText({
    includeRawChunks: true,
    maxOutputTokens: 900,
    messages: [{ content: USER_PROMPT, role: 'user' }],
    model,
    onChunk: ({ chunk }) => {
      if (chunk.type === 'raw') {
        const rawValue = toRecord(chunk.rawValue)
        if (hasInterestingRawProviderData(rawValue)) {
          rawProviderUsageChunks.push(toJsonValue(rawValue))
        }
        return
      }

      streamChunks.push(summarizeStreamChunk(chunk))
    },
    onFinish: (event) => {
      finalFinishEvents.push(summarizeFinishEvent(event))
    },
    onStepFinish: (event) => {
      stepFinishEvents.push(summarizeStep(event))
    },
    prepareStep: ({ stepNumber }) => {
      if (stepNumber < 2) {
        return { toolChoice: 'required' }
      }

      return { toolChoice: 'none' }
    },
    stopWhen: stepCountIs(5),
    system: SYSTEM_PROMPT,
    tools: { exaSearch },
  })

  // Consume through the UI message stream so we can inspect how step boundaries
  // and finish usage are packaged for a message-oriented renderer.
  const uiMessageChunks: unknown[] = []
  for await (const chunk of result.toUIMessageStream({ sendReasoning: true, sendSources: true })) {
    uiMessageChunks.push(summarizeUiMessageChunk(chunk))
  }

  // Resolve the result promises after the stream has been drained.
  const [steps, usage, totalUsage, finishReason, rawFinishReason, warnings, providerMetadata] =
    await Promise.all([
      result.steps,
      result.usage,
      result.totalUsage,
      result.finishReason,
      result.rawFinishReason,
      result.warnings,
      result.providerMetadata,
    ])

  // Build compact files around the questions we care about, instead of dumping
  // every large request/response object as separate files.
  const stepSummaries = steps.map((step) => summarizeStep(step))
  const fieldMap = buildFieldMap({ steps, totalUsage, usage, providerMetadata })
  const run = {
    finishedAt: new Date().toISOString(),
    finishReason,
    model: {
      requested: MODEL,
      servedByStep: steps.map((step) => ({
        responseModelId: step.response.modelId,
        stepNumber: step.stepNumber,
      })),
    },
    prompts: {
      system: SYSTEM_PROMPT,
      user: USER_PROMPT,
    },
    rawFinishReason,
    resultAliases: {
      providerMetadata: summarizeProviderMetadata(providerMetadata),
      usage,
      warnings,
    },
    settings: {
      maxOutputTokens: 900,
      openRouterModelSettings: {
        reasoning: { effort: 'low' },
        usage: { include: true },
      },
      stopWhen: 'stepCountIs(5)',
      toolLoop: 'steps 0 and 1 require a tool; later steps force toolChoice none',
    },
    startedAt: RUN_STARTED_AT,
    stepCount: steps.length,
    totalUsage,
  }

  writeJson('run.json', run)
  writeJson('steps.json', {
    stepFinishEvents,
    steps: stepSummaries,
  })
  writeJson('field-map.json', fieldMap)
  writeJson('stream-events.json', {
    aiSdkStream: summarizeEventSeries(streamChunks),
    finalFinishEvents,
    uiMessageStream: summarizeEventSeries(uiMessageChunks),
  })
  writeJson('raw-provider-usage-chunks.json', rawProviderUsageChunks)
  writeJson('tool-executions.json', toolExecutions)

  console.log(
    [
      join(OUT, 'run.json'),
      join(OUT, 'steps.json'),
      join(OUT, 'field-map.json'),
      join(OUT, 'stream-events.json'),
      join(OUT, 'raw-provider-usage-chunks.json'),
      join(OUT, 'tool-executions.json'),
    ].join('\n'),
  )
}

function buildSearchOutput(input: unknown): JsonRecord {
  const record = toRecord(input)
  const query = readString(record.query)
  const lowerQuery = query.toLowerCase()

  // Return small, deterministic results that look like Exa search summaries.
  const results = [
    {
      publishedDate: '2026-05-01',
      summary:
        'Mastra is a TypeScript-first agent framework with workflows, evals, memory, and tool abstractions.',
      title: 'Mastra: TypeScript Agent Framework',
      url: 'https://mastra.ai/docs',
    },
    {
      publishedDate: '2026-04-18',
      summary:
        'Vercel AI SDK provides model/provider abstractions, tool calling, streaming UI primitives, and framework integrations.',
      title: 'AI SDK Core and UI',
      url: 'https://ai-sdk.dev/docs',
    },
    {
      publishedDate: '2026-03-28',
      summary:
        'LangChain.js remains broad and integration-heavy, useful when you need many loaders, vector stores, and agent patterns.',
      title: 'LangChain.js Documentation',
      url: 'https://js.langchain.com/docs',
    },
    {
      publishedDate: '2026-02-12',
      summary:
        'VoltAgent focuses on TypeScript agent orchestration with observability, workflows, and provider integrations.',
      title: 'VoltAgent TypeScript Agents',
      url: 'https://voltagent.dev/docs',
    },
  ]

  const selectedResults = lowerQuery.includes('react')
    ? results.filter((result) => result.url.includes('ai-sdk') || result.url.includes('mastra'))
    : results

  return {
    costDollars: 0,
    query,
    requestId: `probe-${String(toolInputHash(query)).padStart(4, '0')}`,
    results: selectedResults,
    searchType: 'neural',
  }
}

function buildFieldMap({
  providerMetadata,
  steps,
  totalUsage,
  usage,
}: {
  providerMetadata: unknown
  steps: UsageStep[]
  totalUsage: unknown
  usage: unknown
}) {
  const lastStep = steps.at(-1)
  const summedUsage = sumStepUsage(steps)
  const comparableTotalUsage = toComparableUsage(totalUsage)

  return {
    availability: {
      costInProviderMetadata: steps.map(
        (step) => getOpenRouterProviderUsage(step.providerMetadata).cost,
      ),
      costInRawUsage: steps.map((step) => toRecord(step.usage.raw).cost),
      rawFinishReasonPerStep: steps.map((step) => step.rawFinishReason),
      rawUsagePerStep: steps.map((step) => step.usage.raw !== undefined),
      responseGenerationIds: steps.map((step) => step.response.id),
      servedModelIds: steps.map((step) => step.response.modelId),
      stepProviderNames: steps.map((step) => getOpenRouterProvider(step.providerMetadata)),
    },
    comparisons: {
      lastStepProviderMetadataMatchesTopLevel:
        JSON.stringify(lastStep?.providerMetadata) === JSON.stringify(providerMetadata),
      lastStepUsageMatchesTopLevel: JSON.stringify(lastStep?.usage) === JSON.stringify(usage),
      totalUsageMatchesSummedStepUsage:
        JSON.stringify(comparableTotalUsage) === JSON.stringify(summedUsage),
    },
    interpretation: steps.map((step) => {
      const rawUsage = toRecord(step.usage.raw)
      const rawPromptDetails = toRecord(rawUsage.prompt_tokens_details)
      const rawCompletionDetails = toRecord(rawUsage.completion_tokens_details)
      const providerUsage = getOpenRouterProviderUsage(step.providerMetadata)

      return {
        cost: {
          providerMetadata: {
            cost: providerUsage.cost,
            costDetails: providerUsage.costDetails,
          },
          raw: {
            cost: rawUsage.cost,
            costDetails: rawUsage.cost_details,
          },
        },
        ids: {
          generationId: step.response.id,
          requestedModel: step.model.modelId,
          servedModel: step.response.modelId,
        },
        input: {
          sdkCacheRead: step.usage.inputTokenDetails.cacheReadTokens,
          sdkCacheWrite: step.usage.inputTokenDetails.cacheWriteTokens,
          sdkNoCache: step.usage.inputTokenDetails.noCacheTokens,
          sdkTotal: step.usage.inputTokens,
          rawCached: rawPromptDetails.cached_tokens,
          rawCacheWrite: rawPromptDetails.cache_write_tokens,
          noCacheIfDerivedFromTotalMinusCacheRead:
            subtractNumbers(step.usage.inputTokens, step.usage.inputTokenDetails.cacheReadTokens) ??
            undefined,
          noCacheIfDerivedFromTotalMinusReadAndWrite:
            subtractNumbers(
              step.usage.inputTokens,
              step.usage.inputTokenDetails.cacheReadTokens,
              step.usage.inputTokenDetails.cacheWriteTokens,
            ) ?? undefined,
        },
        output: {
          rawReasoning: rawCompletionDetails.reasoning_tokens,
          sdkReasoning: step.usage.outputTokenDetails.reasoningTokens,
          sdkText: step.usage.outputTokenDetails.textTokens,
          sdkTotal: step.usage.outputTokens,
          textIfDerivedFromTotalMinusReasoning:
            subtractNumbers(
              step.usage.outputTokens,
              step.usage.outputTokenDetails.reasoningTokens,
            ) ?? undefined,
        },
        stepNumber: step.stepNumber,
      }
    }),
    notes: [
      'result.usage is a last-step alias; result.totalUsage is the SDK token aggregate.',
      'usage.raw is the closest live surface to the OpenRouter response usage object.',
      'providerMetadata.openrouter.usage is useful but is a renamed/subset copy of raw usage.',
      'OpenRouter generation metadata is not present here; join later by step.response.id if needed.',
    ],
    summedUsage,
    totalUsage,
    totalUsageComparable: comparableTotalUsage,
  }
}

function summarizeStep(step: {
  content: unknown[]
  finishReason: unknown
  model: unknown
  providerMetadata: unknown
  rawFinishReason: unknown
  request: { body?: unknown }
  response: {
    headers?: unknown
    id?: unknown
    messages?: unknown[]
    modelId?: unknown
    timestamp?: unknown
  }
  stepNumber: number
  usage: unknown
  warnings: unknown
}) {
  const rawUsage = toRecord(toRecord(step.usage).raw)
  const providerUsage = getOpenRouterProviderUsage(step.providerMetadata)

  return {
    content: step.content.map(summarizeContentPart),
    finishReason: step.finishReason,
    model: step.model,
    providerMetadata: {
      openrouter: {
        provider: getOpenRouterProvider(step.providerMetadata),
        reasoningDetailsLength: getReasoningDetailsLength(step.providerMetadata),
        usage: providerUsage,
      },
    },
    rawFinishReason: step.rawFinishReason,
    request: summarizeRequestBody(step.request.body),
    response: {
      headers: step.response.headers,
      id: step.response.id,
      messageCount: step.response.messages?.length ?? 0,
      messageSummaries: step.response.messages?.map(summarizeResponseMessage) ?? [],
      modelId: step.response.modelId,
      timestamp: step.response.timestamp,
    },
    stepNumber: step.stepNumber,
    usage: {
      normalized: step.usage,
      rawKeys: Object.keys(rawUsage),
      rawUsage,
    },
    warnings: step.warnings,
  }
}

function summarizeFinishEvent(event: {
  finishReason: unknown
  providerMetadata?: unknown
  rawFinishReason?: unknown
  steps?: unknown[]
  totalUsage?: unknown
  usage?: unknown
  warnings?: unknown
}) {
  return {
    finishReason: event.finishReason,
    providerMetadata: summarizeProviderMetadata(event.providerMetadata),
    rawFinishReason: event.rawFinishReason,
    stepCount: event.steps?.length ?? 0,
    totalUsage: event.totalUsage,
    usage: event.usage,
    warnings: event.warnings,
  }
}

function summarizeEventSeries(events: unknown[]) {
  const summaries = events.map(toRecord)
  const countsByType: Record<string, number> = {}

  for (const event of summaries) {
    const type = readString(event.type, 'unknown')
    countsByType[type] = (countsByType[type] ?? 0) + 1
  }

  return {
    count: events.length,
    countsByType,
    deltaSamples: summaries.filter((event) => isDeltaEvent(event)).slice(0, 12),
    nonDeltaEvents: summaries.filter((event) => !isDeltaEvent(event)),
    typeSequence: summaries.map((event) => readString(event.type, 'unknown')),
  }
}

function isDeltaEvent(event: JsonRecord) {
  const type = readString(event.type)
  return type.includes('delta') || type === 'text' || type === 'reasoning'
}

function summarizeStreamChunk(chunk: unknown) {
  const record = toRecord(chunk)
  const type = readString(record.type, 'unknown')

  if (type === 'text-delta' || type === 'reasoning-delta' || type === 'tool-input-delta') {
    const delta = readString(record.delta)
    return {
      deltaLength: delta.length,
      deltaPreview: truncate(delta, 120),
      id: record.id,
      toolName: record.toolName,
      type,
    }
  }

  if (type === 'tool-call' || type === 'tool-result') {
    return {
      input: summarizeUnknown(record.input),
      output: summarizeUnknown(record.output),
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      type,
    }
  }

  return {
    keys: Object.keys(record),
    type,
    value: summarizeUnknown(record),
  }
}

function summarizeUiMessageChunk(chunk: unknown) {
  const record = toRecord(chunk)
  const type = readString(record.type, 'unknown')

  if (type.includes('text') || type.includes('reasoning') || type.includes('tool-input')) {
    const delta = readString(record.delta ?? record.text)
    return {
      deltaLength: delta.length,
      deltaPreview: truncate(delta, 120),
      id: record.id,
      type,
    }
  }

  return {
    keys: Object.keys(record),
    type,
    value: summarizeUnknown(record),
  }
}

function summarizeContentPart(part: unknown) {
  const record = toRecord(part)
  const type = readString(record.type, 'unknown')

  return {
    input: summarizeUnknown(record.input),
    output: summarizeUnknown(record.output),
    providerMetadata: summarizeProviderMetadata(record.providerMetadata),
    textLength: typeof record.text === 'string' ? record.text.length : undefined,
    textPreview: typeof record.text === 'string' ? truncate(record.text, 160) : undefined,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    type,
  }
}

function summarizeProviderMetadata(providerMetadata: unknown): JsonRecord | undefined {
  const openrouter = toRecord(toRecord(providerMetadata).openrouter)
  if (Object.keys(openrouter).length === 0) {
    return undefined
  }

  return {
    openrouter: {
      provider: openrouter.provider,
      reasoningDetailsLength: Array.isArray(openrouter.reasoning_details)
        ? openrouter.reasoning_details.length
        : undefined,
      usage: openrouter.usage,
    },
  }
}

function summarizeRequestBody(body: unknown) {
  const record = toRecord(body)
  const messages = Array.isArray(record.messages) ? record.messages : []
  const tools = Array.isArray(record.tools) ? record.tools : []

  return {
    keys: Object.keys(record),
    maxTokens: record.max_tokens,
    messageCount: messages.length,
    messageSummaries: messages.map(summarizeRequestMessage),
    model: record.model,
    reasoning: record.reasoning,
    stream: record.stream,
    streamOptions: record.stream_options,
    toolChoice: record.tool_choice,
    toolNames: tools.map((item) => toRecord(toRecord(item).function).name),
    usage: record.usage,
  }
}

function summarizeRequestMessage(message: unknown) {
  const record = toRecord(message)
  const { content } = record

  return {
    contentLength: typeof content === 'string' ? content.length : undefined,
    contentPreview: typeof content === 'string' ? truncate(content, 160) : undefined,
    contentTypes: Array.isArray(content) ? content.map((part) => toRecord(part).type) : undefined,
    role: record.role,
    toolCallCount: Array.isArray(record.tool_calls) ? record.tool_calls.length : undefined,
    toolCallNames: Array.isArray(record.tool_calls)
      ? record.tool_calls.map((toolCall) => toRecord(toRecord(toolCall).function).name)
      : undefined,
  }
}

function summarizeResponseMessage(message: unknown) {
  const record = toRecord(message)
  const { content } = record

  return {
    contentLength: typeof content === 'string' ? content.length : undefined,
    contentPreview: typeof content === 'string' ? truncate(content, 160) : undefined,
    contentTypes: Array.isArray(content) ? content.map((part) => toRecord(part).type) : undefined,
    role: record.role,
    toolResultCount: Array.isArray(content)
      ? content.filter((part) => toRecord(part).type === 'tool-result').length
      : undefined,
  }
}

function sumStepUsage(steps: UsageStep[]) {
  return {
    inputTokenDetails: {
      cacheReadTokens: sumDefined(steps, (step) => step.usage.inputTokenDetails.cacheReadTokens),
      cacheWriteTokens: sumDefined(steps, (step) => step.usage.inputTokenDetails.cacheWriteTokens),
      noCacheTokens: sumDefined(steps, (step) => step.usage.inputTokenDetails.noCacheTokens),
    },
    inputTokens: sumDefined(steps, (step) => step.usage.inputTokens),
    outputTokenDetails: {
      reasoningTokens: sumDefined(steps, (step) => step.usage.outputTokenDetails.reasoningTokens),
      textTokens: sumDefined(steps, (step) => step.usage.outputTokenDetails.textTokens),
    },
    outputTokens: sumDefined(steps, (step) => step.usage.outputTokens),
    totalTokens: sumDefined(steps, (step) => step.usage.totalTokens),
  }
}

function toComparableUsage(usage: unknown) {
  const record = toRecord(usage)
  const inputTokenDetails = toRecord(record.inputTokenDetails)
  const outputTokenDetails = toRecord(record.outputTokenDetails)

  return {
    inputTokenDetails: {
      cacheReadTokens: inputTokenDetails.cacheReadTokens,
      cacheWriteTokens: inputTokenDetails.cacheWriteTokens,
      noCacheTokens: inputTokenDetails.noCacheTokens,
    },
    inputTokens: record.inputTokens,
    outputTokenDetails: {
      reasoningTokens: outputTokenDetails.reasoningTokens,
      textTokens: outputTokenDetails.textTokens,
    },
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
  }
}

function sumDefined<T>(items: T[], read: (item: T) => number | undefined): number | undefined {
  let sawValue = false
  let total = 0

  for (const item of items) {
    const value = read(item)
    if (value === undefined) {
      continue
    }

    sawValue = true
    total += value
  }

  return sawValue ? total : undefined
}

function subtractNumbers(...values: (number | undefined)[]): number | undefined {
  const [first, ...rest] = values
  if (first === undefined) {
    return undefined
  }

  let total = first
  for (const value of rest) {
    total -= value ?? 0
  }

  return total
}

function getOpenRouterProvider(providerMetadata: unknown) {
  return toRecord(toRecord(providerMetadata).openrouter).provider
}

function getOpenRouterProviderUsage(providerMetadata: unknown) {
  return toRecord(toRecord(toRecord(providerMetadata).openrouter).usage)
}

function getReasoningDetailsLength(providerMetadata: unknown): number | undefined {
  const reasoningDetails = toRecord(toRecord(providerMetadata).openrouter).reasoning_details
  return Array.isArray(reasoningDetails) ? reasoningDetails.length : undefined
}

function hasInterestingRawProviderData(rawValue: JsonRecord) {
  if ('usage' in rawValue || 'error' in rawValue) {
    return true
  }

  const { choices } = rawValue
  if (!Array.isArray(choices)) {
    return false
  }

  return choices.some((choice) => {
    const finishReason = toRecord(choice).finish_reason
    return finishReason !== undefined && finishReason !== null
  })
}

function summarizeUnknown(value: unknown): JsonRecord | undefined {
  if (value === undefined) {
    return undefined
  }

  const jsonValue = toJsonValue(value)
  const jsonString = JSON.stringify(jsonValue)

  return {
    bytes: Buffer.byteLength(jsonString),
    preview: truncate(jsonString, 220),
  }
}

function serializeError(error: unknown): unknown {
  if (error === undefined) {
    return undefined
  }

  if (error instanceof Error) {
    return {
      cause: serializeError(error.cause),
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }

  return toJsonValue(error)
}

function toRecord(value: unknown): JsonRecord {
  if (!isJsonRecord(value)) {
    return {}
  }

  return value
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toJsonValue(value: unknown): unknown {
  const jsonString = JSON.stringify(value)
  if (jsonString === undefined) {
    return undefined
  }

  const parsed: unknown = JSON.parse(jsonString)
  return parsed
}

function toolInputHash(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + (value.codePointAt(index) ?? 0)) % 10_000
  }

  return hash
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}...`
}

function writeJson(name: string, value: unknown) {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`)
}
