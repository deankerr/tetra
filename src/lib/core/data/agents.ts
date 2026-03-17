import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { uiStore } from '@/lib/core/data/stores'

// --- Codec ---

type AgentRow = Row<Schemas[0], 'agents'>

const decode = (id: string, row: AgentRow) => ({
  createdAt: row.createdAt,
  id,
  maxOutputTokens: row.maxOutputTokens,
  model: row.model,
  name: row.name,
  provider: row.provider,
  systemPrompt: row.systemPrompt,
  temperature: row.temperature,
})

// --- Types ---

export const DEFAULT_AGENT_ID = 'agent-default'

export type Agent = ReturnType<typeof decode>
export type AgentPatch = Partial<Omit<Agent, 'createdAt' | 'id'>>

// --- DAO ---

const defaults: Omit<AgentRow, 'createdAt'> = {
  maxOutputTokens: 800,
  model: 'openai/gpt-4o-mini',
  name: 'Default Agent',
  provider: 'openrouter',
  systemPrompt:
    'You are a concise assistant. Answer directly and prefer short, concrete responses.',
  temperature: 0.7,
}

export type AgentDAO = {
  get: (id: string) => Agent | null
  getOrThrow: (id: string) => Agent
  listIds: () => string[]
  listIdsByCreation: () => string[]
  insert: (id: string, row: AgentPatch) => void
  insertDefault: () => void
  update: (id: string, patch: AgentPatch) => void
  delete: (id: string) => void
}

export const createAgentDAO = (store: AppStore, indexes: AppIndexes): AgentDAO => ({
  get(id) {
    if (!store.hasRow('agents', id)) {
      return null
    }
    return decode(id, store.getRow('agents', id))
  },

  getOrThrow(id) {
    const agent = this.get(id)
    if (agent === null) {
      throw new Error(`Agent not found: ${id}`)
    }
    return agent
  },

  listIds() {
    return store.getRowIds('agents')
  },

  listIdsByCreation() {
    return indexes.getSliceRowIds('agentsByCreation', 'all')
  },

  insert(id, row) {
    store.setRow('agents', id, { ...defaults, ...row, createdAt: Date.now() })
  },

  insertDefault() {
    // Preserve existing createdAt if re-seeding, otherwise stamp now
    const existing = store.hasRow('agents', DEFAULT_AGENT_ID)
      ? store.getCell('agents', DEFAULT_AGENT_ID, 'createdAt')
      : 0
    store.setRow('agents', DEFAULT_AGENT_ID, {
      ...defaults,
      createdAt: existing || Date.now(),
    })
  },

  update(id, patch) {
    if (!store.hasRow('agents', id)) {
      throw new Error(`Agent not found: ${id}`)
    }
    store.setPartialRow('agents', id, patch)
  },

  delete(id) {
    store.delRow('agents', id)
  },
})

// --- Hooks ---

export const useAgent = (id: string): Agent | null => {
  const hasRow = uiStore.useHasRow('agents', id)
  const row = uiStore.useRow('agents', id)
  return hasRow ? decode(id, row) : null
}

export const useAgentIds = () => uiStore.useSliceRowIds('agentsByCreation', 'all')
