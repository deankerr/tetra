import type { Row } from 'tinybase/with-schemas'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppStore } from '@/lib/core/data/stores'
import { ui } from '@/lib/core/data/stores'

// --- Codec ---

type AgentRow = Row<Schemas[0], 'agents'>

const decode = (id: string, row: AgentRow) => ({
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
export type AgentPatch = Partial<Omit<Agent, 'id'>>

// --- DAO ---

const defaults: AgentRow = {
  maxOutputTokens: 800,
  model: 'openai/gpt-4o-mini',
  name: 'Prototype Agent',
  provider: 'openrouter',
  systemPrompt:
    'You are a concise assistant helping evaluate a local-first TinyBase chat runtime prototype. Answer directly and prefer short, concrete responses.',
  temperature: 0.7,
}

export type AgentDAO = {
  get: (id: string) => Agent | null
  getOrThrow: (id: string) => Agent
  insert: (id: string, row: AgentPatch) => void
  insertDefault: () => void
  update: (id: string, patch: AgentPatch) => void
  delete: (id: string) => void
}

export const createAgentDAO = (store: AppStore): AgentDAO => ({
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

  insert(id, row) {
    store.setRow('agents', id, { ...defaults, ...row })
  },

  insertDefault() {
    store.setRow('agents', DEFAULT_AGENT_ID, defaults)
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
  const hasRow = ui.useHasRow('agents', id)
  const row = ui.useRow('agents', id)
  return hasRow ? decode(id, row) : null
}
