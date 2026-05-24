import { expect, test } from 'bun:test'

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { simulateReadableStream, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

import { createCoreModules, Runs } from '../index.ts'
import { toolsRegistryMap } from '../tools/tools.ts'
import { createMessageGeneration, writeMessageGenerationSnapshot } from './message-generations.ts'
import type { CredentialReader, LanguageModelResolver } from './run.ts'

function createTestRuntime() {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }
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
  const runs = new Runs(core.helpers, credentials, modelResolver)

  return { core, model, runs }
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

test('start streams through the AI SDK into TinyBase rows', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })

  const run = runs.start({ assistantMessageId })
  expect(core.db.tables.requests.requireEntity(run.requestId).status).toBe('preparing')

  await run.done

  const messages = core.db.indexes
    .getSliceRowIds('messagesBySession', sessionId)
    .map((id) => core.db.tables.messages.requireEntity(id))
  const request = core.db.tables.requests.requireEntity(run.requestId)

  expect(run.status).toBe('completed')
  expect(request.status).toBe('completed')
  expect(request.config).toEqual({
    maxMessages: 0,
    modelId: 'mock-model',
    providerOptions: {},
    systemPromptId: '',
    toolIds: [],
  })
  expect(messages).toHaveLength(2)
  expect(messages[0]?.role).toBe('user')
  expect(messages[0]?.parts).toEqual([{ text: 'hello', type: 'text' }])
  expect(messages[1]?.id).toBe(run.assistantMessageId)
  expect(messages[1]?.role).toBe('assistant')
  expect(messages[1]?.parts.find((part) => part.type === 'text')).toMatchObject({
    state: 'done',
    text: 'hello world',
    type: 'text',
  })
  expect(run.finalParts).toEqual(messages[1]?.parts)
  expect(messages[1]?.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  expect(core.db.tables.messageGenerations.getEntity(assistantMessageId)).toBeNull()
  expect(core.db.tables.sessionSummaries.requireEntity(sessionId).usage).toEqual({
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
  })
  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'hello', type: 'text' }], role: 'user' },
  ])
})

test('streaming snapshots persist to messageGenerations before message commit', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }
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
  const runs = new Runs(core.helpers, credentials, { resolve: () => model })
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  const run = runs.start({ assistantMessageId })
  const firstSnapshot = Promise.withResolvers<undefined>()
  run.addEventListener(
    'snapshot',
    () => {
      firstSnapshot.resolve()
    },
    { once: true },
  )

  await firstSnapshot.promise

  const generation = core.db.tables.messageGenerations.requireEntity(assistantMessageId)
  expect(core.db.tables.messages.requireEntity(assistantMessageId).parts).toEqual([])
  expect(generation.parts.length).toBeGreaterThan(0)

  await run.done
  expect(core.db.tables.messageGenerations.getEntity(assistantMessageId)).toBeNull()
  expect(core.db.tables.messages.requireEntity(assistantMessageId).parts.length).toBeGreaterThan(0)
})

test('Pre-Run Invariants — throws before creating request when systemPromptId is missing', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({
    config: { modelId: 'mock-model', systemPromptId: 'non-existent-prompt' },
  })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  const requestsBefore = core.db.indexes.getSliceRowIds('requestsBySessionNewestFirst', sessionId)
  const sessionBefore = core.db.tables.sessions.requireEntity(sessionId)

  expect(() => runs.start({ assistantMessageId })).toThrow(
    'Missing row: prompts/non-existent-prompt',
  )

  const requestsAfter = core.db.indexes.getSliceRowIds('requestsBySessionNewestFirst', sessionId)
  const sessionAfter = core.db.tables.sessions.requireEntity(sessionId)

  expect(requestsAfter).toHaveLength(requestsBefore.length)
  expect(sessionAfter.updatedAt).toBe(sessionBefore.updatedAt)
})

test('History Reconstruction — prior messages appear in prompt, current placeholder excluded', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'prior user', type: 'text' }],
    role: 'user',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'prior assistant', type: 'text' }],
    role: 'assistant',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'new message', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })

  const run = runs.start({ assistantMessageId })
  await run.done

  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'prior user', type: 'text' }], role: 'user' },
    { content: [{ text: 'prior assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'new message', type: 'text' }], role: 'user' },
  ])
})

test('History Reconstruction — maxMessages limits history at the execution boundary', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({
    config: { maxMessages: 2, modelId: 'mock-model' },
  })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'oldest user', type: 'text' }],
    role: 'user',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'oldest assistant', type: 'text' }],
    role: 'assistant',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'recent user', type: 'text' }],
    role: 'user',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'recent assistant', type: 'text' }],
    role: 'assistant',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'latest', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })

  const run = runs.start({ assistantMessageId })
  await run.done

  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'recent assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'latest', type: 'text' }], role: 'user' },
  ])
})

test('Regenerate — assistant tail is cleared and reused', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'again', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'stale answer', type: 'text' }],
    role: 'assistant',
  })

  const run = runs.regenerate({ messageId: assistantMessageId })
  expect(run.assistantMessageId).toBe(assistantMessageId)
  expect(core.db.tables.messages.requireEntity(assistantMessageId).parts).toEqual([])
  expect(core.db.tables.messages.requireEntity(assistantMessageId).steps).toEqual([])
  expect(core.db.tables.messages.requireEntity(assistantMessageId).usage).toEqual({})

  await run.done

  const messages = core.db.indexes
    .getSliceRowIds('messagesBySession', sessionId)
    .map((id) => core.db.tables.messages.requireEntity(id))
  expect(messages).toHaveLength(2)
  expect(messages[1]?.id).toBe(assistantMessageId)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'again', type: 'text' }], role: 'user' },
  ])
})

test('Regenerate — user tail appends an assistant message and starts it', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  const userMessageId = core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'continue', type: 'text' }],
    role: 'user',
  })

  const run = runs.regenerate({ messageId: userMessageId })
  await run.done

  const messages = core.db.indexes
    .getSliceRowIds('messagesBySession', sessionId)
    .map((id) => core.db.tables.messages.requireEntity(id))
  expect(messages).toHaveLength(2)
  expect(messages[0]?.id).toBe(userMessageId)
  expect(messages[1]?.id).toBe(run.assistantMessageId)
  expect(messages[1]?.role).toBe('assistant')
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'continue', type: 'text' }], role: 'user' },
  ])
})

test('Regenerate — only the last message can be regenerated', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  const userMessageId = core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'old', type: 'text' }],
    role: 'user',
  })
  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'answer', type: 'text' }],
    role: 'assistant',
  })

  expect(() => runs.regenerate({ messageId: userMessageId })).toThrow(
    'Only the last message in a conversation can be regenerated',
  )
})

test('Tool Loop — tool call executes and result appears in final parts', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }

  const toolCallChunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { id: 'tool-1', toolName: 'getWeather', type: 'tool-input-start' },
    { delta: '{"city":"Paris"}', id: 'tool-1', type: 'tool-input-delta' },
    { id: 'tool-1', type: 'tool-input-end' },
    {
      input: '{"city":"Paris"}',
      toolCallId: 'call-1',
      toolName: 'getWeather',
      type: 'tool-call',
    },
    {
      finishReason: { raw: 'tool-calls', unified: 'tool-calls' },
      type: 'finish',
      usage: {
        inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
        outputTokens: { reasoning: 0, text: 0, total: 0 },
      },
    },
  ]

  const textChunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { id: 'text-1', type: 'text-start' },
    { delta: 'Paris is sunny', id: 'text-1', type: 'text-delta' },
    { id: 'text-1', type: 'text-end' },
    {
      finishReason: { raw: 'stop', unified: 'stop' },
      type: 'finish',
      usage: {
        inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 2 },
        outputTokens: { reasoning: 0, text: 2, total: 2 },
      },
    },
  ]

  let streamCallCount = 0
  const model = new MockLanguageModelV3({
    // eslint-disable-next-line require-await -- async required by PromiseLike<LanguageModelV3StreamResult>; no await needed when returning a pre-built stream
    doStream: async () => {
      const call = streamCallCount
      streamCallCount += 1
      return {
        stream: simulateReadableStream<LanguageModelV3StreamPart>({
          chunkDelayInMs: null,
          chunks: call === 0 ? toolCallChunks : textChunks,
          initialDelayInMs: null,
        }),
      }
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs(core.helpers, credentials, modelResolver)
  const sessionId = core.helpers.createSession({
    config: { modelId: 'mock-model', toolIds: ['getWeather'] },
  })

  const getWeatherTool = tool({
    description: 'Get weather for a city',
    execute: ({ city }) => ({ city, weather: 'sunny' }),
    inputSchema: z.object({ city: z.string() }),
  })

  toolsRegistryMap.set('getWeather', {
    category: 'test',
    createTool: () => getWeatherTool,
    credentialIds: [],
    description: 'Get weather for a city',
    label: 'Get Weather',
  })

  try {
    core.helpers.appendMessage(sessionId, {
      parts: [{ text: 'what is the weather?', type: 'text' }],
      role: 'user',
    })
    const assistantMessageId = core.helpers.appendMessage(sessionId, {
      parts: [],
      role: 'assistant',
    })
    const run = runs.start({ assistantMessageId })
    await run.done

    expect(model.doStreamCalls).toHaveLength(2)
    expect(run.status).toBe('completed')
    expect(model.doStreamCalls[1]?.prompt).toBeDefined()
    expect(run.finalParts?.find((p) => p.type === 'text')).toMatchObject({
      state: 'done',
      text: 'Paris is sunny',
      type: 'text',
    })
  } finally {
    toolsRegistryMap.delete('getWeather')
  }
})

test('Error Path — stream error sets request to error status', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }

  const model = new MockLanguageModelV3({
    doStream: () => {
      throw new Error('Provider API error')
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs(core.helpers, credentials, modelResolver)
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  const run = await withoutExpectedConsoleErrors({ messages: ['Provider API error'] }, async () => {
    const startedRun = runs.start({ assistantMessageId })
    await startedRun.done
    return startedRun
  })

  const request = core.db.tables.requests.requireEntity(run.requestId)

  expect(run.status).toBe('error')
  expect(request.status).toBe('error')
  expect(request.errorMessage).toContain('Provider API error')
  expect(core.db.tables.messageGenerations.getEntity(assistantMessageId)).toBeNull()
  expect(run.error).toBeDefined()
  expect(String(run.error)).toContain('Provider API error')
})

test('Recovery — interrupted requests commit partial generations and clean hot rows', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'hello', type: 'text' }],
    role: 'user',
  })
  const assistantMessageId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  let requestId = ''
  const now = Date.now()
  core.db.transaction(() => {
    requestId = core.db.tables.requests.setRow('req_test', {
      assistantMessageId,
      config: {
        maxMessages: 0,
        modelId: 'mock-model',
        providerOptions: {},
        systemPromptId: '',
        toolIds: [],
      },
      createdAt: now,
      errorMessage: '',
      sessionId,
      status: 'streaming',
      terminalAt: 0,
      updatedAt: now,
    }).id
    createMessageGeneration(core.helpers, {
      messageId: assistantMessageId,
      requestId,
      sessionId,
      status: 'streaming',
    })
  })

  writeMessageGenerationSnapshot(core.helpers, assistantMessageId, [
    { text: 'partial', type: 'text' },
  ])
  runs.recover()

  expect(core.db.tables.requests.requireEntity(requestId).status).toBe('error')
  expect(core.db.tables.messageGenerations.getEntity(assistantMessageId)).toBeNull()
  expect(core.db.tables.messages.requireEntity(assistantMessageId).parts).toEqual([
    { text: 'partial', type: 'text' },
  ])
})

test('Error Path — later requests can still run after an error', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }

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
  const runs = new Runs(core.helpers, credentials, modelResolver)
  const sessionId = core.helpers.createSession({ config: { modelId: 'mock-model' } })

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'fail', type: 'text' }],
    role: 'user',
  })
  const failAssistantId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  const failedRun = await withoutExpectedConsoleErrors(
    { messages: ['First call fails'] },
    async () => {
      const startedRun = runs.start({ assistantMessageId: failAssistantId })
      await startedRun.done
      return startedRun
    },
  )
  expect(failedRun.status).toBe('error')

  core.helpers.appendMessage(sessionId, {
    parts: [{ text: 'retry', type: 'text' }],
    role: 'user',
  })
  const retryAssistantId = core.helpers.appendMessage(sessionId, { parts: [], role: 'assistant' })
  const successRun = runs.start({ assistantMessageId: retryAssistantId })
  await successRun.done
  expect(successRun.status).toBe('completed')
  expect(successRun.finalParts?.find((p) => p.type === 'text')).toMatchObject({
    state: 'done',
    text: 'recovered',
    type: 'text',
  })
})
