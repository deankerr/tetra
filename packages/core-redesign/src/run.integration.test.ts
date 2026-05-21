import { expect, test } from 'bun:test'

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { simulateReadableStream, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

import { createCoreModules, Runs } from './index.ts'
import type { CredentialReader, LanguageModelResolver } from './index.ts'
import { toolsRegistryMap } from './tools/tools.ts'

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
  const runs = new Runs(core.accessors, credentials, modelResolver)

  return { core, model, runs }
}

test('sendMessage streams through the AI SDK into TinyBase rows', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.sessions.create({ config: { modelId: 'mock-model' } })

  const run = runs.sendMessage(sessionId, { content: 'hello' })
  expect(core.accessors.requests.get(run.requestId).status).toBe('preparing')

  await run.done

  const messages = core.accessors.messages.listForSession(sessionId)
  const request = core.accessors.requests.get(run.requestId)

  expect(run.status).toBe('completed')
  expect(request.status).toBe('completed')
  expect(request.config).toEqual({ modelId: 'mock-model' })
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
  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'hello', type: 'text' }], role: 'user' },
  ])
})

test('Pre-Run Invariants — throws before creating rows when systemPromptId is missing', () => {
  const { core, runs } = createTestRuntime()
  const sessionId = core.sessions.create({
    config: { modelId: 'mock-model', systemPromptId: 'non-existent-prompt' },
  })

  const messagesBefore = core.accessors.messages.listForSession(sessionId)
  const requestsBefore = core.accessors.requests.idsForSession(sessionId)
  const sessionBefore = core.accessors.sessions.get(sessionId)

  expect(() => runs.sendMessage(sessionId, { content: 'hello' })).toThrow(
    'Prompt not found: non-existent-prompt',
  )

  const messagesAfter = core.accessors.messages.listForSession(sessionId)
  const requestsAfter = core.accessors.requests.idsForSession(sessionId)
  const sessionAfter = core.accessors.sessions.get(sessionId)

  expect(messagesAfter).toHaveLength(messagesBefore.length)
  expect(requestsAfter).toHaveLength(requestsBefore.length)
  expect(sessionAfter.updatedAt).toBe(sessionBefore.updatedAt)
})

test('History Reconstruction — prior messages appear in prompt, current placeholder excluded', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.sessions.create({ config: { modelId: 'mock-model' } })

  // Create prior conversation history
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'prior user', type: 'text' }],
    role: 'user',
  })
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'prior assistant', type: 'text' }],
    role: 'assistant',
  })

  const run = runs.sendMessage(sessionId, { content: 'new message' })
  await run.done

  // Prompt includes prior messages but excludes the current assistant placeholder
  expect(model.doStreamCalls).toHaveLength(1)
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'prior user', type: 'text' }], role: 'user' },
    { content: [{ text: 'prior assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'new message', type: 'text' }], role: 'user' },
  ])
})

test('History Reconstruction — maxMessages limits history at the execution boundary', async () => {
  const { core, model, runs } = createTestRuntime()
  const sessionId = core.sessions.create({
    config: { maxMessages: 2, modelId: 'mock-model' },
  })

  // Create 4 prior messages (2 user + 2 assistant)
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'oldest user', type: 'text' }],
    role: 'user',
  })
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'oldest assistant', type: 'text' }],
    role: 'assistant',
  })
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'recent user', type: 'text' }],
    role: 'user',
  })
  core.accessors.messages.create(sessionId, {
    parts: [{ text: 'recent assistant', type: 'text' }],
    role: 'assistant',
  })

  const run = runs.sendMessage(sessionId, { content: 'latest' })
  await run.done

  // maxMessages=2 means only the last 2 prior messages are included
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { content: [{ text: 'recent assistant', type: 'text' }], role: 'assistant' },
    { content: [{ text: 'latest', type: 'text' }], role: 'user' },
  ])
})

test('Tool Loop — tool call executes and result appears in final parts', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }

  // Step 1: model emits a tool call
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

  // Step 2: model emits final text after tool result
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

  // MockLanguageModelV3 indexes doStream arrays with length-after-push (off-by-one),
  // so use a function to control which stream each call gets.
  let streamCallCount = 0
  const model = new MockLanguageModelV3({
    // eslint-disable-next-line require-await -- async required to satisfy PromiseLike<LanguageModelV3StreamResult> return type; no await needed when returning a pre-built stream
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
  const runs = new Runs(core.accessors, credentials, modelResolver)
  const sessionId = core.sessions.create({
    config: { modelId: 'mock-model', toolIds: ['getWeather'] },
  })

  // Register test tool in the registry
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
    const run = runs.sendMessage(sessionId, { content: 'what is the weather?' })
    await run.done

    expect(model.doStreamCalls).toHaveLength(2)
    expect(run.status).toBe('completed')

    // The second call should include the tool result in the prompt
    const secondCallPrompt = model.doStreamCalls[1]?.prompt
    expect(secondCallPrompt).toBeDefined()

    // Final parts should include text
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
  const runs = new Runs(core.accessors, credentials, modelResolver)
  const sessionId = core.sessions.create({ config: { modelId: 'mock-model' } })

  const run = runs.sendMessage(sessionId, { content: 'hello' })
  await run.done

  const request = core.accessors.requests.get(run.requestId)

  expect(run.status).toBe('error')
  expect(request.status).toBe('error')
  expect(request.errorMessage).toContain('Provider API error')
  expect(run.error).toBeDefined()
  expect(String(run.error)).toContain('Provider API error')
})

test('Error Path — later requests can still run after an error', async () => {
  const core = createCoreModules()
  const credentials: CredentialReader = { get: () => '' }

  let callCount = 0
  const model = new MockLanguageModelV3({
    // eslint-disable-next-line require-await -- async required to satisfy PromiseLike<LanguageModelV3StreamResult> return type; no await needed when branch either throws or returns a pre-built stream
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
  const runs = new Runs(core.accessors, credentials, modelResolver)
  const sessionId = core.sessions.create({ config: { modelId: 'mock-model' } })

  // First request fails
  const failedRun = runs.sendMessage(sessionId, { content: 'fail' })
  await failedRun.done
  expect(failedRun.status).toBe('error')

  // Second request succeeds
  const successRun = runs.sendMessage(sessionId, { content: 'retry' })
  await successRun.done
  expect(successRun.status).toBe('completed')
  expect(successRun.finalParts?.find((p) => p.type === 'text')).toMatchObject({
    state: 'done',
    text: 'recovered',
    type: 'text',
  })
})
