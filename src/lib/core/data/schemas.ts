import type { TablesSchema, ValuesSchema } from 'tinybase'

export const tablesSchema = {
  agents: {
    createdAt: { default: 0, type: 'number' },
    maxOutputTokens: { default: 0, type: 'number' },
    model: { default: '', type: 'string' },
    name: { default: '', type: 'string' },
    provider: { default: '', type: 'string' },
    systemPrompt: { default: '', type: 'string' },
    temperature: { default: 0, type: 'number' },
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
  requests: {
    assistantMessageId: { default: '', type: 'string' },
    config: { default: '', type: 'string' },
    createdAt: { default: 0, type: 'number' },
    errorMessage: { default: '', type: 'string' },
    messageId: { default: '', type: 'string' },
    sessionId: { default: '', type: 'string' },
    status: { default: 'pending', type: 'string' },
  },
  sessions: {
    agentId: { default: '', type: 'string' },
    createdAt: { default: 0, type: 'number' },
    lastSeq: { default: 0, type: 'number' },
    title: { default: '', type: 'string' },
    updatedAt: { default: 0, type: 'number' },
  },
} as const satisfies TablesSchema

export const valuesSchema = {
  activeSessionId: { default: '', type: 'string' },
} as const satisfies ValuesSchema

export type Schemas = [typeof tablesSchema, typeof valuesSchema]
