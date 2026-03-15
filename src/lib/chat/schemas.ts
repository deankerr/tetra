import type { TablesSchema, ValuesSchema } from 'tinybase'

export const CONFIG_STORE_ID = 'config'
export const RUNTIME_STORE_ID = 'runtime'
export const RUNTIME_INDEXES_ID = 'runtimeIndexes'

export const DEFAULT_AGENT_ID = 'agent-default'
export const DEFAULT_AGENT_NAME = 'Prototype Agent'
export const DEFAULT_MODEL_ID = 'openai/gpt-4o-mini'

export const configTablesSchema = {
  agents: {
    maxTokens: { default: 800, type: 'number' },
    model: { default: DEFAULT_MODEL_ID, type: 'string' },
    name: { default: DEFAULT_AGENT_NAME, type: 'string' },
    provider: { default: 'openrouter', type: 'string' },
    systemPrompt: { default: '', type: 'string' },
    temperature: { default: 0.7, type: 'number' },
  },
} as const satisfies TablesSchema

export const configValuesSchema = {} as const satisfies ValuesSchema

export const runtimeTablesSchema = {
  commands: {
    claimedAt: { default: 0, type: 'number' },
    claimedBy: { default: '', type: 'string' },
    completedAt: { default: 0, type: 'number' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    payload: { default: {}, type: 'object' },
    sessionId: { default: '', type: 'string' },
    status: { default: 'pending', type: 'string' },
    type: { default: 'send', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  messages: {
    createdAt: { default: 0, type: 'number' },
    message: { default: {}, type: 'object' },
    role: { default: 'user', type: 'string' },
    seq: { default: 0, type: 'number' },
    sessionId: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
  sessions: {
    activeCommandId: { default: '', type: 'string' },
    agentId: { default: DEFAULT_AGENT_ID, type: 'string' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    lastSeq: { default: 0, type: 'number' },
    status: { default: 'idle', type: 'string' },
    title: { default: 'New session', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const runtimeValuesSchema = {
  activeSessionId: { default: '', type: 'string' },
} as const satisfies ValuesSchema

export type ConfigSchemas = [typeof configTablesSchema, typeof configValuesSchema]
export type RuntimeSchemas = [typeof runtimeTablesSchema, typeof runtimeValuesSchema]
