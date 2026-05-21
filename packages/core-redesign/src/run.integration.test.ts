import { expect, test } from 'bun:test'

import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

import { createCoreModules, Runs } from './index.ts'
import type { CredentialReader, LanguageModelResolver } from './index.ts'

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
