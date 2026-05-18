import { z } from 'zod'

import type { TetraStore } from '#store'

// --- OpenRouter API schema ---

const orModelSchema = z.object({
  architecture: z.object({
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  }),
  context_length: z.number(),
  created: z.number(),
  id: z.string(),
  name: z.string(),
  supported_parameters: z.array(z.string()),
})

const orResponseSchema = z.object({ data: z.array(orModelSchema) })

// --- Parsing ---

function parseProviderName(rawName: string): string {
  // OpenRouter names are "Provider: Model Name" — extract the provider part
  const colonIdx = rawName.indexOf(':')
  return colonIdx > 0 ? rawName.slice(0, colonIdx).trim() : ''
}

function parseModelName(rawName: string): string {
  const colonIdx = rawName.indexOf(':')
  return colonIdx > 0 ? rawName.slice(colonIdx + 1).trim() : rawName
}

// --- Staleness threshold ---

const STALE_MS = 60 * 60 * 1000

// --- Factory ---

export interface Catalog {
  refresh(opts?: { force?: boolean }): Promise<void>
}

export function createCatalog(store: TetraStore): Catalog {
  const isStale = () => {
    const last = store.store.getValue('catalogLastRefreshed')
    return !last || Date.now() - last > STALE_MS
  }

  const refresh = async (opts?: { force?: boolean }) => {
    if (opts?.force !== true && !isStale()) {
      return
    }

    const res = await fetch('https://openrouter.ai/api/v1/models')
    if (!res.ok) {
      throw new Error(`OpenRouter models fetch failed: ${res.status} ${res.statusText}`)
    }
    const json = orResponseSchema.parse(await res.json())

    // Build new rows keyed by model id
    const incoming: Record<string, Record<string, unknown>> = {}
    for (const raw of json.data) {
      const providerName = parseProviderName(raw.name)
      const provider = raw.id.split('/')[0] ?? ''
      incoming[raw.id] = {
        contextLength: raw.context_length,
        createdAt: raw.created,
        inputModalities: raw.architecture.input_modalities.join(','),
        name: parseModelName(raw.name),
        outputModalities: raw.architecture.output_modalities.join(','),
        provider,
        providerName: providerName || provider,
        supportedParameters: raw.supported_parameters.join(','),
      }
    }

    // Purge rows no longer returned by the API
    const existingIds = store.store.getRowIds('languageModels')
    const incomingIds = new Set(Object.keys(incoming))
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        store.store.delRow('languageModels', id)
      }
    }

    // Write all new/updated rows
    for (const [id, row] of Object.entries(incoming)) {
      store.store.setRow('languageModels', id, row)
    }

    store.store.setValue('catalogLastRefreshed', Date.now())
    console.log('openrouter model catalog refreshed')
  }

  return { refresh }
}
