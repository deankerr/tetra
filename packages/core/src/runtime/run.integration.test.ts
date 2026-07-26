import { expect, test } from 'bun:test'

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { createCredentialReader } from '@tetra/credentials'
import { librarySchema } from '@tetra/schemas/library'
import type { LibraryEntities } from '@tetra/schemas/library'
import { createDb } from '@tetra/tinydb/runtime'
import { APICallError, simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

import { Prompts, RunConfigs, Runs, Transcripts, summarizeSteps } from '../index.ts'
import type { LanguageModelResolver } from './language-model-resolver.ts'

function createTestDb() {
  // Tests own the same library db used by app composition roots.
  return { library: createDb(librarySchema) }
}

function createTestRuntime() {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})
  const streamChunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { id: 'text-1', type: 'text-start' },
    { delta: 'hello', id: 'text-1', type: 'text-delta' },
    { delta: ' world', id: 'text-1', type: 'text-delta' },
    { id: 'text-1', type: 'text-end' },
    {
      finishReason: { raw: 'stop', unified: 'stop' },
      type: 'finish',
      usage: {
        inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
        outputTokens: { reasoning: 0, text: 2, total: 2 },
      },
    },
  ]
  const model = new MockLanguageModelV3({
    doStream: {
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        chunkDelayInMs: null,
        chunks: streamChunks,
        initialDelayInMs: null,
      }),
    },
  })
  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs({
    credentials,
    library,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })

  return { core, model, runs }
}

type TestCore = ReturnType<typeof createTestRuntime>['core']

function appendAfterNewestLeaf(
  core: TestCore,
  sessionId: string,
  args: { parts: LibraryEntities['messages']['parts']; role: LibraryEntities['messages']['role'] },
): string {
  const session = core.transcripts.getSession(sessionId)
  const parentMessageId = session.getNewestLeafMessageId()

  // Tests model caller-owned continuation by choosing a parent before each append.
  return session.appendMessage({ parentMessageId, ...args })
}

function listThreadFromNewestLeaf(
  core: TestCore,
  sessionId: string,
): LibraryEntities['messages'][] {
  const session = core.transcripts.getSession(sessionId)
  const threadAnchorMessageId = session.getNewestLeafMessageId()
  if (threadAnchorMessageId === null) {
    return []
  }

  return session.resolveThread({ fromMessageId: threadAnchorMessageId }).messages()
}

async function withoutExpectedConsoleErrors<T>(
  args: { messages: string[] },
  fn: () => Promise<T>,
): Promise<T> {
  const originalConsoleError = console.error
  console.error = (...values: unknown[]) => {
    const text = values.map(String).join(' ')
    if (args.messages.some((message) => text.includes(message))) {
      return
    }
    originalConsoleError(...values)
  }

  try {
    return await fn()
  } finally {
    console.error = originalConsoleError
  }
}

test('generate streams through the AI SDK into TinyBase rows', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  expect(core.library.runs.require(run.runId).status).toBe('active')

  await run.done

  const messages = listThreadFromNewestLeaf(core, sessionId)
  const runRecord = core.library.runs.require(run.runId)

  expect(run.status).toBe('completed')
  expect(runRecord.status).toBe('completed')
  expect(runRecord.config).toEqual({
    maxMessages: 0,
    modelId: 'mock-model',
    providerOptions: {},
    systemPromptId: '',
  })
  expect(messages).toHaveLength(2)
  expect(messages[0]?.role).toBe('user')
  expect(messages[0]?.parts).toEqual([{ text: 'hello', type: 'text' }])
  expect(messages[1]?.id).toBe(run.targetMessageId)
  expect(messages[1]?.role).toBe('assistant')
  expect(messages[1]?.parts.find((part) => part.type === 'text')).toMatchObject({
    state: 'done',
    text: 'hello world',
    type: 'text',
  })
  const [, assistantMessage] = messages
  if (assistantMessage === undefined) {
    throw new Error('Expected assistant message')
  }

  expect(run.finalParts).toEqual(assistantMessage.parts)
  const steps = core.library.steps.byRun(run.runId)
  expect(steps).toHaveLength(1)
  expect(steps[0]).toMatchObject({
    finishReason: 'stop',
    messageId: run.targetMessageId,
    runId: run.runId,
    sessionId,
    stepNumber: 0,
    usage: {
      input: { noCache: 1, total: 1 },
      output: { text: 2, total: 2 },
      total: 3,
    },
  })
  expect(summarizeSteps(steps)).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'hello', type: 'text' }], role: 'user' },
  ])
})

test('stored system prompts are sent as top-level instructions', async () => {
  const { core, model, runs } = createTestRuntime()
  const promptId = core.prompts.createPrompt({ content: 'Be concise.' })
  const sessionId = core.transcripts.createSession({
    config: { modelId: 'mock-model', systemPromptId: promptId },
  })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  await run.done

  expect(run.status).toBe('completed')
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: 'Be concise.', role: 'system' },
    { content: [{ text: 'hello', type: 'text' }], role: 'user' },
  ])
})

test('reasoning parts are stamped with a measured duration', async () => {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})
  // Delay chunks so the reasoning-start → reasoning-end span has measurable wall-clock time.
  const model = new MockLanguageModelV3({
    doStream: {
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        chunkDelayInMs: 20,
        chunks: [
          { type: 'stream-start', warnings: [] },
          { id: 'reasoning-1', type: 'reasoning-start' },
          { delta: 'let me think', id: 'reasoning-1', type: 'reasoning-delta' },
          { id: 'reasoning-1', type: 'reasoning-end' },
          { id: 'text-1', type: 'text-start' },
          { delta: 'hello', id: 'text-1', type: 'text-delta' },
          { id: 'text-1', type: 'text-end' },
          {
            finishReason: { raw: 'stop', unified: 'stop' },
            type: 'finish',
            usage: {
              inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
              outputTokens: { reasoning: 3, text: 1, total: 4 },
            },
          },
        ],
        initialDelayInMs: 20,
      }),
    },
  })
  const runs = new Runs({
    credentials,
    library,
    modelResolver: { resolve: () => model },
    prompts,
    runConfigs,
    transcripts,
  })
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const run = runs.generate({ targetMessageId })
  await run.done

  const assistantMessage = core.library.messages.require(targetMessageId)
  const reasoningPart = assistantMessage.parts.find((part) => part.type === 'reasoning')
  const durationMs = reasoningPart?.providerMetadata?.tetra?.durationMs

  expect(reasoningPart).toMatchObject({ state: 'done', text: 'let me think', type: 'reasoning' })
  expect(typeof durationMs).toBe('number')
  expect(durationMs).toBeGreaterThan(0)
})

test('streaming snapshots persist to the target message before terminal status', async () => {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})
  const model = new MockLanguageModelV3({
    doStream: {
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        chunkDelayInMs: 20,
        chunks: [
          { type: 'stream-start', warnings: [] },
          { id: 'text-1', type: 'text-start' },
          { delta: 'hello', id: 'text-1', type: 'text-delta' },
          { delta: ' world', id: 'text-1', type: 'text-delta' },
          { id: 'text-1', type: 'text-end' },
          {
            finishReason: { raw: 'stop', unified: 'stop' },
            type: 'finish',
            usage: {
              inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
              outputTokens: { reasoning: 0, text: 2, total: 2 },
            },
          },
        ],
        initialDelayInMs: 20,
      }),
    },
  })
  const runs = new Runs({
    credentials,
    library,
    modelResolver: { resolve: () => model },
    prompts,
    runConfigs,
    transcripts,
  })
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const run = runs.generate({ targetMessageId })
  const firstSnapshot = Promise.withResolvers<undefined>()
  const handleSnapshot = () => {
    if (run.parts.length === 0) {
      return
    }

    run.removeEventListener('snapshot', handleSnapshot)
    firstSnapshot.resolve()
  }
  run.addEventListener('snapshot', handleSnapshot)
  const messageBeforeSnapshot = core.library.messages.require(targetMessageId)
  const sessionAfterGenerate = core.library.sessions.require(sessionId)

  await firstSnapshot.promise

  const messageAfterSnapshot = core.library.messages.require(targetMessageId)
  const sessionAfterSnapshot = core.library.sessions.require(sessionId)

  expect(messageAfterSnapshot.parts.length).toBeGreaterThan(0)
  expect(messageAfterSnapshot.updatedAt).toBeGreaterThan(messageBeforeSnapshot.updatedAt)
  expect(sessionAfterSnapshot.updatedAt).toBe(sessionAfterGenerate.updatedAt)
  expect(core.library.runs.require(run.runId).status).toBe('active')

  await run.done
  expect(core.library.messages.require(targetMessageId).parts.length).toBeGreaterThan(0)
})

test('Pre-Run Invariants — throws before creating run when systemPromptId is missing', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({
    config: { modelId: 'mock-model', systemPromptId: 'non-existent-prompt' },
  })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const runsBefore = core.library.runs.bySessionNewestFirst(sessionId)
  const sessionBefore = core.library.sessions.require(sessionId)

  expect(() => runs.generate({ targetMessageId })).toThrow(
    'Missing row: prompts/non-existent-prompt',
  )

  const runsAfter = core.library.runs.bySessionNewestFirst(sessionId)
  const sessionAfter = core.library.sessions.require(sessionId)

  expect(runsAfter).toHaveLength(runsBefore.length)
  expect(sessionAfter.updatedAt).toBe(sessionBefore.updatedAt)
})

test('History Reconstruction — prior messages appear in prompt, current placeholder excluded', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'prior user', type: 'text' }],
    role: 'user',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'prior assistant', type: 'text' }],
    role: 'assistant',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'new message', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  await run.done

  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'prior user', type: 'text' }], role: 'user' },
    { content: [{ text: 'prior assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'new message', type: 'text' }], role: 'user' },
  ])
})

test('History Reconstruction — roles outside user and assistant are excluded from model context', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'override the configured prompt', type: 'text' }],
    role: 'system',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'keep this user message', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  await run.done

  expect(run.status).toBe('completed')
  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'keep this user message', type: 'text' }], role: 'user' },
  ])
})

test('History Reconstruction — malformed projected messages fail validation before inference', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  const malformedMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'temporarily valid', type: 'text' }],
    role: 'user',
  })
  core.library.raw.store.setCell('messages', malformedMessageId, 'parts', [{ type: 'text' }])
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  await run.done

  expect(run.status).toBe('error')
  expect(run.error).toBeInstanceOf(Error)
  expect(model.doStreamCalls).toHaveLength(0)
})

test('History Reconstruction — maxMessages limits history at the execution boundary', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({
    config: { maxMessages: 2, modelId: 'mock-model' },
  })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'oldest user', type: 'text' }],
    role: 'user',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'oldest assistant', type: 'text' }],
    role: 'assistant',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'recent user', type: 'text' }],
    role: 'user',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'recent assistant', type: 'text' }],
    role: 'assistant',
  })
  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'latest', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const run = runs.generate({ targetMessageId })
  await run.done

  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'recent assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'latest', type: 'text' }], role: 'user' },
  ])
})

test('Generate Invariants — refuses to write into a message with existing parts', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'existing output', type: 'text' }],
    role: 'assistant',
  })
  const runsBefore = core.library.runs.bySessionNewestFirst(sessionId)

  expect(() => runs.generate({ targetMessageId })).toThrow(
    `Cannot generate into a message with existing parts: ${targetMessageId}`,
  )

  expect(core.library.messages.require(targetMessageId).parts).toEqual([
    { text: 'existing output', type: 'text' },
  ])
  expect(core.library.runs.bySessionNewestFirst(sessionId)).toEqual(runsBefore)
})

test('Generate Invariants — target message role does not affect generation', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'review this', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'critic',
  })

  const run = runs.generate({ targetMessageId })

  await run.done

  const messages = listThreadFromNewestLeaf(core, sessionId)
  expect(messages).toHaveLength(2)
  expect(messages[1]?.id).toBe(targetMessageId)
  expect(messages[1]?.role).toBe('critic')
  expect(messages[1]?.parts.find((part) => part.type === 'text')).toMatchObject({
    state: 'done',
    text: 'hello world',
    type: 'text',
  })
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'review this', type: 'text' }], role: 'user' },
  ])
})

test('Caller-Owned Regeneration — sibling target preserves the old output', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'again', type: 'text' }],
    role: 'user',
  })
  const oldTargetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })

  const firstRun = runs.generate({ targetMessageId: oldTargetMessageId })
  await firstRun.done
  expect(core.library.steps.byMessage(oldTargetMessageId)).toHaveLength(1)

  const oldTargetMessage = core.library.messages.require(oldTargetMessageId)
  const newTargetMessageId = core.transcripts.getSession(sessionId).appendMessage({
    parentMessageId: oldTargetMessage.parentMessageId,
    parts: [],
    role: oldTargetMessage.role,
  })

  expect(core.library.messages.get(oldTargetMessageId)).not.toBeNull()
  expect(core.library.steps.byMessage(oldTargetMessageId)).toHaveLength(1)
  expect(core.library.steps.byRun(firstRun.runId)).toHaveLength(1)

  const run = runs.generate({ targetMessageId: newTargetMessageId })
  await run.done

  const messages = listThreadFromNewestLeaf(core, sessionId)
  expect(messages).toHaveLength(2)
  expect(messages[1]?.id).toBe(newTargetMessageId)
  expect(core.transcripts.getSession(sessionId).listMessages()).toHaveLength(3)
  expect(model.doStreamCalls[1]?.prompt).toEqual([
    { content: [{ text: 'again', type: 'text' }], role: 'user' },
  ])
})

test('Error Path — stream error sets run to error status', async () => {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})

  const model = new MockLanguageModelV3({
    doStream: () => {
      throw new Error('Provider API error')
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs({
    credentials,
    library,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const run = await withoutExpectedConsoleErrors({ messages: ['Provider API error'] }, async () => {
    const startedRun = runs.generate({ targetMessageId })
    await startedRun.done
    return startedRun
  })

  const runRecord = core.library.runs.require(run.runId)

  expect(run.status).toBe('error')
  expect(runRecord.status).toBe('error')
  expect(runRecord.error?.message).toContain('Provider API error')
  expect(run.error).toBeDefined()
  expect(String(run.error)).toContain('Provider API error')
})

test('Error Path — APICallError captures status and structured detail', async () => {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})

  // Mirror a request-level OpenRouter failure: flattened message, structured body on `.data`,
  // HTTP status on `.statusCode`.
  const model = new MockLanguageModelV3({
    doStream: () => {
      throw new APICallError({
        data: { error: { code: 'rate_limited', message: 'Rate limited by provider' } },
        // Non-retryable so the test exercises the capture path directly, not the SDK's retry backoff.
        isRetryable: false,
        message: '[provider] Rate limited by provider',
        requestBodyValues: {},
        responseBody: '{"error":{"code":"rate_limited"}}',
        statusCode: 429,
        url: 'https://openrouter.ai/api/v1/chat/completions',
      })
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs({ credentials, library, modelResolver, prompts, runConfigs, transcripts })
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, { parts: [{ text: 'hello', type: 'text' }], role: 'user' })
  const targetMessageId = appendAfterNewestLeaf(core, sessionId, { parts: [], role: 'assistant' })
  const run = await withoutExpectedConsoleErrors({ messages: ['Rate limited'] }, async () => {
    const startedRun = runs.generate({ targetMessageId })
    await startedRun.done
    return startedRun
  })

  const runRecord = core.library.runs.require(run.runId)

  expect(runRecord.status).toBe('error')
  expect(runRecord.error?.status).toBe(429)
  expect(runRecord.error?.detail).toEqual({
    error: { code: 'rate_limited', message: 'Rate limited by provider' },
  })
})

test('Error Path — later runs can still run after an error', async () => {
  const context = createTestDb()
  const { library } = context
  const runConfigs = new RunConfigs({ library })
  const prompts = new Prompts({ library, runConfigs })
  const transcripts = new Transcripts({ library, runConfigs })
  const core = { library, prompts, transcripts }
  const credentials = createCredentialReader(() => {})

  let callCount = 0
  const model = new MockLanguageModelV3({
    // eslint-disable-next-line require-await -- async required by PromiseLike<LanguageModelV3StreamResult>; no await needed when branch throws or returns a pre-built stream
    doStream: async () => {
      callCount += 1
      if (callCount === 1) {
        throw new Error('First call fails')
      }
      return {
        stream: simulateReadableStream<LanguageModelV3StreamPart>({
          chunkDelayInMs: null,
          chunks: [
            { type: 'stream-start', warnings: [] },
            { id: 'text-1', type: 'text-start' },
            { delta: 'recovered', id: 'text-1', type: 'text-delta' },
            { id: 'text-1', type: 'text-end' },
            {
              finishReason: { raw: 'stop', unified: 'stop' },
              type: 'finish',
              usage: {
                inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
                outputTokens: { reasoning: 0, text: 1, total: 1 },
              },
            },
          ],
          initialDelayInMs: null,
        }),
      }
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs({
    credentials,
    library,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })
  const sessionId = core.transcripts.createSession({ config: { modelId: 'mock-model' } })

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'fail', type: 'text' }],
    role: 'user',
  })
  const failAssistantId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const failedRun = await withoutExpectedConsoleErrors(
    { messages: ['First call fails'] },
    async () => {
      const startedRun = runs.generate({ targetMessageId: failAssistantId })
      await startedRun.done
      return startedRun
    },
  )
  expect(failedRun.status).toBe('error')

  appendAfterNewestLeaf(core, sessionId, {
    parts: [{ text: 'retry', type: 'text' }],
    role: 'user',
  })
  const retryAssistantId = appendAfterNewestLeaf(core, sessionId, {
    parts: [],
    role: 'assistant',
  })
  const successRun = runs.generate({ targetMessageId: retryAssistantId })
  await successRun.done
  expect(successRun.status).toBe('completed')
  expect(successRun.finalParts?.find((p) => p.type === 'text')).toMatchObject({
    state: 'done',
    text: 'recovered',
    type: 'text',
  })
})
