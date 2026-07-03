import { expect, test } from 'bun:test'

import { catalogSchema } from '@tetra/schemas/catalog'
import { createDb } from '@tetra/tinydb/runtime'

import { ModelCatalog } from './catalog.ts'

const OPENROUTER_MODEL = {
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
  },
  context_length: 128_000,
  created: 1_700_000_000,
  id: 'openai/gpt-4o',
  name: 'OpenAI: GPT-4o',
  supported_parameters: ['tools'],
}

function createCatalogHarness() {
  // Tests use the same catalog db boundary as the web runtime and CLI.
  const catalog = createDb(catalogSchema)
  const modelCatalog = new ModelCatalog({ catalog })

  return { catalog, modelCatalog }
}

async function withDateNow<T>(now: number, fn: () => Promise<T>): Promise<T> {
  const originalDateNow = Date.now

  try {
    // Pinning time makes stale checks and row timestamps deterministic.
    Date.now = () => now
    return await fn()
  } finally {
    Date.now = originalDateNow
  }
}

async function withFetch<T>(fetch: typeof globalThis.fetch, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch

  try {
    // ModelCatalog reads the browser/global fetch boundary directly.
    globalThis.fetch = fetch
    return await fn()
  } finally {
    globalThis.fetch = originalFetch
  }
}

function createModelsResponse(models = [OPENROUTER_MODEL]): Response {
  return Response.json({ data: models })
}

function createMockFetch(
  handler: (...args: Parameters<typeof globalThis.fetch>) => Response,
): typeof globalThis.fetch {
  // Bun's fetch has a static preconnect helper; preserve that shape while replacing network I/O.
  // oxlint-disable-next-line require-await -- Mock fetch must match Bun's async fetch shape.
  return Object.assign(async (...args: Parameters<typeof globalThis.fetch>) => handler(...args), {
    preconnect: globalThis.fetch.preconnect,
  })
}

test('refresh fetches and stores models when the catalog has never refreshed', async () => {
  const { catalog, modelCatalog } = createCatalogHarness()

  await withFetch(
    createMockFetch(() => createModelsResponse()),
    async () => {
      await withDateNow(1000, async () => {
        await modelCatalog.refresh()
      })
    },
  )

  expect(catalog.values.lastRefreshed.get()).toBe(1000)
  expect(catalog.languageModels.require('openai/gpt-4o')).toEqual({
    contextLength: 128_000,
    createdAt: 1000,
    id: 'openai/gpt-4o',
    inputModalities: ['text'],
    name: 'GPT-4o',
    outputModalities: ['text'],
    provider: 'openai',
    providerName: 'OpenAI',
    supportedParameters: ['tools'],
    updatedAt: 1000,
    upstreamCreatedAt: 1_700_000_000,
  })
})

test('refresh skips the network when the cache is fresh and not forced', async () => {
  const { catalog, modelCatalog } = createCatalogHarness()
  catalog.values.lastRefreshed.set(1000)

  await withFetch(
    createMockFetch(() => {
      throw new Error('fetch should not be called')
    }),
    async () => {
      await withDateNow(1001, async () => {
        await modelCatalog.refresh()
      })
    },
  )

  expect(catalog.languageModels.ids()).toEqual([])
  expect(catalog.values.lastRefreshed.get()).toBe(1000)
})

test('force refresh bypasses the freshness check', async () => {
  const { catalog, modelCatalog } = createCatalogHarness()
  catalog.values.lastRefreshed.set(1000)

  await withFetch(
    createMockFetch(() => createModelsResponse()),
    async () => {
      await withDateNow(1001, async () => {
        await modelCatalog.refresh({ force: true })
      })
    },
  )

  expect(catalog.languageModels.ids()).toEqual(['openai/gpt-4o'])
  expect(catalog.values.lastRefreshed.get()).toBe(1001)
})
