import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'

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
  updatedAt: row.updatedAt,
})

// --- Types ---

export const DEFAULT_AGENT_ID = 'agent-default'

export type Agent = ReturnType<typeof decode>
export type AgentPatch = Partial<Omit<Agent, 'createdAt' | 'id' | 'updatedAt'>>

// --- DAO ---

const defaults: Omit<AgentRow, 'createdAt' | 'updatedAt'> = {
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
  insert: (id: string, row: AgentPatch) => void
  insertDefault: () => void
  update: (id: string, patch: AgentPatch) => void
  delete: (id: string) => void
}

export const createAgentDAO = (store: AppStore, _indexes: AppIndexes): AgentDAO => ({
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

  insert(id, row) {
    const timestamp = Date.now()
    store.setRow('agents', id, { ...defaults, ...row, createdAt: timestamp, updatedAt: timestamp })
  },

  insertDefault() {
    const timestamp = Date.now()
    // Preserve existing timestamps if re-seeding
    const existing = store.hasRow('agents', DEFAULT_AGENT_ID)
    const createdAt = existing
      ? store.getCell('agents', DEFAULT_AGENT_ID, 'createdAt') || timestamp
      : timestamp
    const updatedAt = existing
      ? store.getCell('agents', DEFAULT_AGENT_ID, 'updatedAt') || timestamp
      : timestamp
    store.setRow('agents', DEFAULT_AGENT_ID, {
      ...defaults,
      createdAt,
      updatedAt,
    })
  },

  update(id, patch) {
    if (!store.hasRow('agents', id)) {
      throw new Error(`Agent not found: ${id}`)
    }
    store.setPartialRow('agents', id, { ...patch, updatedAt: Date.now() })
  },

  delete(id) {
    store.delRow('agents', id)
  },
})
