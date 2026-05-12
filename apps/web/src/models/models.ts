import { useEffect, useState } from 'react'
import * as R from 'remeda'
import { z } from 'zod'

// --- Types ---

export interface Model {
  id: string
  name: string
  provider: string
}

export interface ModelGroup {
  displayName: string
  models: Model[]
  provider: string
}

// --- Module cache ---

let cache: ModelGroup[] | null = null
let pending: Promise<ModelGroup[]> | null = null

// --- Schema ---

const modelSchema = z.object({ id: z.string(), name: z.string() })
const modelsResponseSchema = z.object({ data: z.array(modelSchema) })

// --- Parsing ---

function parseModel(raw: z.infer<typeof modelSchema>): Model {
  const [provider = 'unknown'] = raw.id.split('/')

  // OpenRouter names are "Provider: Model Name" — strip the prefix
  const name = raw.name.includes(':') ? raw.name.split(':').slice(1).join(':').trim() : raw.name

  return { id: raw.id, name, provider }
}

function groupByProvider(models: Model[]): ModelGroup[] {
  return R.pipe(
    models,
    R.groupBy((m) => m.provider),
    R.entries(),
    R.map(([provider, group]) => ({
      displayName: provider.charAt(0).toUpperCase() + provider.slice(1),
      models: group,
      provider,
    })),
    R.sortBy((g) => g.displayName),
  )
}

// --- Fetch ---

async function fetchModels(): Promise<ModelGroup[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models')
  const json = modelsResponseSchema.parse(await res.json())
  const models = json.data.map(parseModel)
  return groupByProvider(models)
}

// oxlint-disable-next-line promise-function-async -- Promise cache accessor should return the stored promise directly.
function getModels(): Promise<ModelGroup[]> {
  if (cache) {
    return Promise.resolve(cache)
  }

  pending ??= (async () => {
    const groups = await fetchModels()
    cache = groups
    pending = null
    return groups
  })()

  return pending
}

// --- Hook ---

export function useModels() {
  const [models, setModels] = useState<ModelGroup[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) {
      setModels(cache)
      setLoading(false)
      return
    }
    const load = async () => {
      const groups = await getModels()
      setModels(groups)
      setLoading(false)
    }
    void load()
  }, [])

  return { loading, models }
}
