import { expect, test } from 'bun:test'

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { CredentialsStore } from '@tetra/credentials'
import { libraryStoreDefinition } from '@tetra/stores/library'
import type { LibraryRows } from '@tetra/stores/library'
import { createStoreInstance } from '@tetra/tinybase-schema/runtime'
import { simulateReadableStream, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

import { Prompts, RunConfigs, Runs, Transcripts, summarizeSteps } from '../index.ts'
import { toolsRegistryMap } from '../tools/tools.ts'
import type { LanguageModelResolver } from './language-model-resolver.ts'

function createTestDb() {
  // Tests own the same library store instance shape used by app composition roots.
  const libraryStore = createStoreInstance(libraryStoreDefinition)
  const { rawIndexes, rawStore, typedIndexes, typedStore } = libraryStore
  return {
    libraryStore,
    rawIndexes,
    rawStore,
    typedIndexes,
    typedStore,
  }
}

function createTestRuntime() {
  const context = createTestDb()
  const { libraryStore, typedIndexes, typedStore } = context
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const core = { prompts, transcripts, typedIndexes, typedStore }
  const credentials = new CredentialsStore([])
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
    libraryStore,
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
  args: { parts: LibraryRows['messages']['parts']; role: LibraryRows['messages']['role'] },
): string {
  const session = core.transcripts.getSession(sessionId)
  const parentMessageId = session.getNewestLeafMessageId()

  // Tests model caller-owned continuation by choosing a parent before each append.
  return session.appendMessage({ parentMessageId, ...args })
}

function listThreadFromNewestLeaf(core: TestCore, sessionId: string): LibraryRows['messages'][] {
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
  expect(core.typedStore.tables.runs.requireEntity(run.runId).status).toBe('active')

  await run.done

  const messages = listThreadFromNewestLeaf(core, sessionId)
  const runRecord = core.typedStore.tables.runs.requireEntity(run.runId)

  expect(run.status).toBe('completed')
  expect(runRecord.status).toBe('completed')
  expect(runRecord.config).toEqual({
    maxMessages: 0,
    modelId: 'mock-model',
    providerOptions: {},
    systemPromptId: '',
    toolIds: [],
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
  expect(run.finalParts).toEqual(messages[1]?.parts)
  const steps = core.typedIndexes
    .getSliceRowIds('stepsByRun', run.runId)
    .map((id) => core.typedStore.tables.steps.requireEntity(id))
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

test('streaming snapshots persist to the target message before terminal status', async () => {
  const context = createTestDb()
  const { libraryStore, typedIndexes, typedStore } = context
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const core = { prompts, transcripts, typedIndexes, typedStore }
  const credentials = new CredentialsStore([])
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
    libraryStore,
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
  const messageBeforeSnapshot = core.typedStore.tables.messages.requireEntity(targetMessageId)
  const sessionAfterGenerate = core.typedStore.tables.sessions.requireEntity(sessionId)

  await firstSnapshot.promise

  const messageAfterSnapshot = core.typedStore.tables.messages.requireEntity(targetMessageId)
  const sessionAfterSnapshot = core.typedStore.tables.sessions.requireEntity(sessionId)

  expect(messageAfterSnapshot.parts.length).toBeGreaterThan(0)
  expect(messageAfterSnapshot.updatedAt).toBeGreaterThan(messageBeforeSnapshot.updatedAt)
  expect(sessionAfterSnapshot.updatedAt).toBe(sessionAfterGenerate.updatedAt)
  expect(core.typedStore.tables.runs.requireEntity(run.runId).status).toBe('active')

  await run.done
  expect(
    core.typedStore.tables.messages.requireEntity(targetMessageId).parts.length,
  ).toBeGreaterThan(0)
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
  const runsBefore = core.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)
  const sessionBefore = core.typedStore.tables.sessions.requireEntity(sessionId)

  expect(() => runs.generate({ targetMessageId })).toThrow(
    'Missing row: prompts/non-existent-prompt',
  )

  const runsAfter = core.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)
  const sessionAfter = core.typedStore.tables.sessions.requireEntity(sessionId)

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
  const runsBefore = core.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)

  expect(() => runs.generate({ targetMessageId })).toThrow(
    `Cannot generate into a message with existing parts: ${targetMessageId}`,
  )

  expect(core.typedStore.tables.messages.requireEntity(targetMessageId).parts).toEqual([
    { text: 'existing output', type: 'text' },
  ])
  expect(core.typedIndexes.getSliceRowIds('runsBySessionNewestFirst', sessionId)).toEqual(
    runsBefore,
  )
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
  expect(core.typedIndexes.getSliceRowIds('stepsByMessage', oldTargetMessageId)).toHaveLength(1)

  const oldTargetMessage = core.typedStore.tables.messages.requireEntity(oldTargetMessageId)
  const newTargetMessageId = core.transcripts.getSession(sessionId).appendMessage({
    parentMessageId: oldTargetMessage.parentMessageId,
    parts: [],
    role: oldTargetMessage.role,
  })

  expect(core.typedStore.tables.messages.getEntity(oldTargetMessageId)).not.toBeNull()
  expect(core.typedIndexes.getSliceRowIds('stepsByMessage', oldTargetMessageId)).toHaveLength(1)
  expect(core.typedIndexes.getSliceRowIds('stepsByRun', firstRun.runId)).toHaveLength(1)

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

test('Tool Loop — tool call executes and result appears in final parts', async () => {
  const context = createTestDb()
  const { libraryStore, typedIndexes, typedStore } = context
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const core = { prompts, transcripts, typedIndexes, typedStore }
  const credentials = new CredentialsStore([])

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
  const runs = new Runs({
    credentials,
    libraryStore,
    modelResolver,
    prompts,
    runConfigs,
    transcripts,
  })
  const sessionId = core.transcripts.createSession({
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
    appendAfterNewestLeaf(core, sessionId, {
      parts: [{ text: 'what is the weather?', type: 'text' }],
      role: 'user',
    })
    const targetMessageId = appendAfterNewestLeaf(core, sessionId, {
      parts: [],
      role: 'assistant',
    })
    const run = runs.generate({ targetMessageId })
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

test('Error Path — stream error sets run to error status', async () => {
  const context = createTestDb()
  const { libraryStore, typedIndexes, typedStore } = context
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const core = { prompts, transcripts, typedIndexes, typedStore }
  const credentials = new CredentialsStore([])

  const model = new MockLanguageModelV3({
    doStream: () => {
      throw new Error('Provider API error')
    },
  })

  const modelResolver: LanguageModelResolver = { resolve: () => model }
  const runs = new Runs({
    credentials,
    libraryStore,
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

  const runRecord = core.typedStore.tables.runs.requireEntity(run.runId)

  expect(run.status).toBe('error')
  expect(runRecord.status).toBe('error')
  expect(runRecord.errorMessage).toContain('Provider API error')
  expect(run.error).toBeDefined()
  expect(String(run.error)).toContain('Provider API error')
})

test('Error Path — later runs can still run after an error', async () => {
  const context = createTestDb()
  const { libraryStore, typedIndexes, typedStore } = context
  const runConfigs = new RunConfigs({ libraryStore })
  const prompts = new Prompts({ libraryStore, runConfigs })
  const transcripts = new Transcripts({ libraryStore, runConfigs })
  const core = { prompts, transcripts, typedIndexes, typedStore }
  const credentials = new CredentialsStore([])

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
    libraryStore,
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
