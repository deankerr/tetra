import { expect, test } from 'bun:test'

import type { Tool, ToolExecutionOptions } from 'ai'

import { exaGetContents } from './tools/get-contents.ts'
import { exaSearch } from './tools/search.ts'

interface RecordedRequest {
  body: unknown
  headers: Record<string, string>
  method: string
  url: string
}

function createJsonFetch(responseBody: unknown) {
  const requests: RecordedRequest[] = []

  // The fake fetch records the exact HTTP boundary ExaClient sends through up-fetch.
  const fetchImpl = Object.assign(
    async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const text = await request.clone().text()
      requests.push({
        body: text.trim() === '' ? undefined : JSON.parse(text),
        headers: Object.fromEntries(request.headers.entries()),
        method: request.method,
        url: request.url,
      })

      return Response.json(responseBody)
    },
    { preconnect: fetch.preconnect },
  ) satisfies typeof fetch

  return { fetchImpl, requests }
}

async function runTool(tool: Tool, input: unknown): Promise<unknown> {
  if (tool.execute === undefined) {
    throw new Error('Tool has no execute function')
  }

  // Exa tools do not inspect model messages, but the AI SDK execution contract supplies them.
  const options = {
    messages: [],
    toolCallId: 'call_test',
  } satisfies ToolExecutionOptions

  return await tool.execute(input, options)
}

test('exaSearch applies default request policy at the tool boundary', async () => {
  const { fetchImpl, requests } = createJsonFetch({
    results: [{ id: 'result_1', title: 'Example', url: 'https://example.com' }],
  })
  const searchTool = exaSearch({
    apiKey: 'exa_secret',
    baseUrl: 'https://exa.test',
    fetchImpl,
    timeout: 1000,
  })

  const result = await runTool(searchTool, {
    query: 'tetra testing',
    startPublishedDate: '2026-01-01',
    userLocation: 'US',
  })

  expect(result).toEqual({
    results: [{ id: 'result_1', title: 'Example', url: 'https://example.com' }],
  })
  expect(requests).toEqual([
    {
      body: {
        contents: { highlights: true },
        numResults: 5,
        query: 'tetra testing',
        startPublishedDate: '2026-01-01',
        userLocation: 'US',
      },
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'exa_secret',
      },
      method: 'POST',
      url: 'https://exa.test/search',
    },
  ])
})

test('exaGetContents focuses the default summary with model input query', async () => {
  const { fetchImpl, requests } = createJsonFetch({
    results: [{ id: 'doc_1', title: 'Docs', url: 'https://example.com/docs' }],
  })
  const contentsTool = exaGetContents({
    apiKey: 'exa_secret',
    baseUrl: 'https://exa.test',
    fetchImpl,
    timeout: 1000,
  })

  await runTool(contentsTool, {
    query: 'testing strategy',
    urls: ['https://example.com/docs'],
  })

  expect(requests[0]?.body).toEqual({
    summary: { query: 'testing strategy' },
    urls: ['https://example.com/docs'],
  })
  expect(requests[0]?.url).toBe('https://exa.test/contents')
})

test('exaGetContents treats caller-provided contents as policy', async () => {
  const { fetchImpl, requests } = createJsonFetch({
    results: [{ id: 'doc_1', title: 'Docs', url: 'https://example.com/docs' }],
  })
  const contentsTool = exaGetContents({
    apiKey: 'exa_secret',
    baseUrl: 'https://exa.test',
    contents: {
      extras: { links: 2 },
      summary: { query: 'caller-owned focus' },
    },
    fetchImpl,
    timeout: 1000,
  })

  await runTool(contentsTool, {
    query: 'model should not override policy',
    urls: ['https://example.com/docs'],
  })

  expect(requests[0]?.body).toEqual({
    extras: { links: 2 },
    summary: { query: 'caller-owned focus' },
    urls: ['https://example.com/docs'],
  })
})
