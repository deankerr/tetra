import type { UIMessage } from 'ai'
import type { TablesSchema, ValuesSchema } from 'tinybase'

export const CONFIG_STORE_ID = 'config'
export const RUNTIME_STORE_ID = 'runtime'
export const RUNTIME_INDEXES_ID = 'runtimeIndexes'

export const DEFAULT_AGENT_ID = 'agent-default'
export const DEFAULT_AGENT_NAME = 'Prototype Agent'
export const DEFAULT_MODEL_ID = 'openai/gpt-4o-mini'

export type AgentProvider = 'openrouter'
export type SessionStatus = 'idle' | 'streaming' | 'error'
export type CommandType = 'send' | 'cancel' | 'retry'
export type CommandStatus = 'pending' | 'processing' | 'complete' | 'error' | 'canceled'

export type StoredMessage = UIMessage & Record<string, unknown>

export interface AgentRow extends Record<string, unknown> {
  name: string
  provider: AgentProvider
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
}

export interface SessionRow extends Record<string, unknown> {
  agentId: string
  title: string
  status: SessionStatus
  errorMessage: string
  activeCommandId: string
  createdAt: number
  updatedAt: number
  lastSeq: number
}

export interface MessageRow extends Record<string, unknown> {
  sessionId: string
  seq: number
  role: StoredMessage['role']
  createdAt: number
  updatedAt: number
  message: StoredMessage
}

export interface CommandRow extends Record<string, unknown> {
  sessionId: string
  type: CommandType
  status: CommandStatus
  payload: Record<string, unknown>
  createdAt: number
  updatedAt: number
  claimedBy: string
  claimedAt: number
  completedAt: number
  errorMessage: string
}

export const configTablesSchema = {
  agents: {
    maxTokens: { default: 800, type: 'number' },
    model: { default: DEFAULT_MODEL_ID, type: 'string' },
    name: { default: DEFAULT_AGENT_NAME, type: 'string' },
    provider: { default: 'openrouter', type: 'string' },
    systemPrompt: { default: '', type: 'string' },
    temperature: { default: 0.7, type: 'number' },
  },
} satisfies TablesSchema

export const configValuesSchema = {} satisfies ValuesSchema

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
} satisfies TablesSchema

export const runtimeValuesSchema = {
  activeSessionId: { default: '', type: 'string' },
} satisfies ValuesSchema

export type SendPayload = {
  assistantMessageId: string
  sourceMessageId: string
}

export type RetryPayload = {
  assistantMessageId: string
  replacedMessageId: string
}

export type CancelPayload = {
  targetCommandId: string
}
