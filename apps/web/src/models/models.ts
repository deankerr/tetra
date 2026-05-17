import type { TetraSchemas } from '@tetra/core'
import { useCallback, useState } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { useTetra } from '@/tetra-provider'

// --- Types ---

export interface Model {
  contextLength: number
  createdAt: number
  id: string
  inputModalities: string[]
  name: string
  outputModalities: string[]
  provider: string
  providerName: string
  supportedParameters: string[]
}

export interface ModelGroup {
  displayName: string
  models: Model[]
  provider: string
}

// --- Schema-aware TinyBase hooks ---

// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<TetraSchemas>

// --- Group derivation ---

function deriveGroups(table: ReturnType<typeof store.useTable<'models'>>): ModelGroup[] {
  const all: Model[] = []

  for (const [id, row] of Object.entries(table)) {
    // Only include models that output text
    // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
    const outputModalities = row.outputModalities as string[]
    if (!outputModalities.includes('text')) {
      continue
    }

    all.push({
      contextLength: row.contextLength,
      createdAt: row.createdAt,
      id,
      // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
      inputModalities: row.inputModalities as string[],
      name: row.name,
      outputModalities,
      provider: row.provider,
      providerName: row.providerName || row.provider,
      // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
      supportedParameters: row.supportedParameters as string[],
    })
  }

  // Group by provider name
  const byProvider = new Map<string, Model[]>()
  for (const model of all) {
    const key = model.providerName
    const group = byProvider.get(key) ?? []
    group.push(model)
    byProvider.set(key, group)
  }

  // Sort models within each group by recency (newest first)
  for (const models of byProvider.values()) {
    models.sort((a, b) => b.createdAt - a.createdAt)
  }

  // Sort groups alphabetically by display name
  return [...byProvider.entries()]
    .map(([providerName, models]) => ({
      displayName: providerName,
      models,
      provider: models[0]?.provider ?? '',
    }))
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
}

// --- Hook ---

export function useModels() {
  const { models } = useTetra()
  const modelsTable = store.useTable('models')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await models.refresh({ force: true })
    } finally {
      setLoading(false)
    }
  }, [models])

  return { groups: deriveGroups(modelsTable), loading, refresh }
}
