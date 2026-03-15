import type { UIMessage } from 'ai'
import type { Row, Table } from 'tinybase/with-schemas'

import type { ConfigSchemas, RuntimeSchemas } from '@/lib/chat/schemas'
import type { ConfigStore, RuntimeIndexes, RuntimeStore } from '@/lib/chat/store'

type ConfigTablesSchema = ConfigSchemas[0]
type RuntimeTablesSchema = RuntimeSchemas[0]

type ConfigTableId = Extract<keyof ConfigTablesSchema, string>
type RuntimeTableId = Extract<keyof RuntimeTablesSchema, string>

export type ConfigTableRecord<TableId extends ConfigTableId> = Table<ConfigTablesSchema, TableId>
export type ConfigRowRecord<TableId extends ConfigTableId> = Row<ConfigTablesSchema, TableId>
export type RuntimeTableRecord<TableId extends RuntimeTableId> = Table<RuntimeTablesSchema, TableId>
export type RuntimeRowRecord<TableId extends RuntimeTableId> = Row<RuntimeTablesSchema, TableId>

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const AGENT_PROVIDERS = ['openrouter'] as const
const COMMAND_TYPES = ['send', 'cancel', 'retry'] as const
const COMMAND_STATUSES = ['pending', 'processing', 'complete', 'error', 'canceled'] as const
const SESSION_STATUSES = ['idle', 'streaming', 'error'] as const

export type AgentProvider = (typeof AGENT_PROVIDERS)[number]
export type CommandType = (typeof COMMAND_TYPES)[number]
export type CommandStatus = (typeof COMMAND_STATUSES)[number]
export type SessionStatus = (typeof SESSION_STATUSES)[number]
export type StoredMessage = UIMessage & Record<string, unknown>

export const createSendPayload = (assistantMessageId: string, sourceMessageId: string) => ({
  assistantMessageId,
  sourceMessageId,
})

export type SendPayload = ReturnType<typeof createSendPayload>

export const createRetryPayload = (assistantMessageId: string, replacedMessageId: string) => ({
  assistantMessageId,
  replacedMessageId,
})

export type RetryPayload = ReturnType<typeof createRetryPayload>

export const createCancelPayload = (targetCommandId: string) => ({
  targetCommandId,
})

export type CancelPayload = ReturnType<typeof createCancelPayload>

export const isStoredMessage = (value: unknown): value is StoredMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.role === 'assistant' || value.role === 'system' || value.role === 'user') &&
  Array.isArray(value.parts)

export const isSendPayload = (value: unknown): value is SendPayload =>
  isRecord(value) &&
  typeof value.assistantMessageId === 'string' &&
  typeof value.sourceMessageId === 'string'

export const isRetryPayload = (value: unknown): value is RetryPayload =>
  isRecord(value) &&
  typeof value.assistantMessageId === 'string' &&
  typeof value.replacedMessageId === 'string'

export const isCancelPayload = (value: unknown): value is CancelPayload =>
  isRecord(value) && typeof value.targetCommandId === 'string'

export const isAgentProvider = (value: unknown): value is AgentProvider =>
  typeof value === 'string' && AGENT_PROVIDERS.some((provider) => provider === value)

export const isCommandType = (value: unknown): value is CommandType =>
  typeof value === 'string' && COMMAND_TYPES.some((type) => type === value)

export const isCommandStatus = (value: unknown): value is CommandStatus =>
  typeof value === 'string' && COMMAND_STATUSES.some((status) => status === value)

export const isSessionStatus = (value: unknown): value is SessionStatus =>
  typeof value === 'string' && SESSION_STATUSES.some((status) => status === value)

export const normalizeAgentProvider = (value: string): AgentProvider => {
  if (isAgentProvider(value)) {
    return value
  }
  return 'openrouter'
}

export const normalizeCommandType = (value: string): CommandType => {
  if (isCommandType(value)) {
    return value
  }
  return 'send'
}

export const normalizeCommandStatus = (value: string): CommandStatus => {
  if (isCommandStatus(value)) {
    return value
  }
  return 'pending'
}

export const normalizeSessionStatus = (value: string): SessionStatus => {
  if (isSessionStatus(value)) {
    return value
  }
  return 'idle'
}

export const toAgentRecord = (row: ConfigRowRecord<'agents'>) => ({
  ...row,
  provider: normalizeAgentProvider(row.provider),
})

export type AgentRecord = ReturnType<typeof toAgentRecord>

export const getAgent = (configStore: ConfigStore, agentId: string) => {
  if (!configStore.hasRow('agents', agentId)) {
    return null
  }

  return toAgentRecord(configStore.getRow('agents', agentId))
}

export const getAgentOrThrow = (configStore: ConfigStore, agentId: string): AgentRecord => {
  const agent = getAgent(configStore, agentId)
  if (agent === null) {
    throw new Error(`Missing agent: ${agentId}`)
  }
  return agent
}

export const toSessionRecord = (row: RuntimeRowRecord<'sessions'>) => ({
  ...row,
  status: normalizeSessionStatus(row.status),
})

export type SessionRecord = ReturnType<typeof toSessionRecord>

export const getSession = (runtimeStore: RuntimeStore, sessionId: string) => {
  if (!runtimeStore.hasRow('sessions', sessionId)) {
    return null
  }

  return toSessionRecord(runtimeStore.getRow('sessions', sessionId))
}

export const getSessionOrThrow = (runtimeStore: RuntimeStore, sessionId: string): SessionRecord => {
  const session = getSession(runtimeStore, sessionId)
  if (session === null) {
    throw new Error(`Missing session: ${sessionId}`)
  }
  return session
}

export const toMessageRecord = (row: RuntimeRowRecord<'messages'>) => {
  const message = isStoredMessage(row.message) ? row.message : undefined
  if (message === undefined) {
    return null
  }

  return {
    ...row,
    message,
    role: message.role,
  }
}

export type MessageRecord = NonNullable<ReturnType<typeof toMessageRecord>>

export const getMessage = (runtimeStore: RuntimeStore, messageId: string) => {
  if (!runtimeStore.hasRow('messages', messageId)) {
    return null
  }

  return toMessageRecord(runtimeStore.getRow('messages', messageId))
}

export const getMessageOrThrow = (runtimeStore: RuntimeStore, messageId: string): MessageRecord => {
  const message = getMessage(runtimeStore, messageId)
  if (message === null) {
    throw new Error(`Missing message: ${messageId}`)
  }
  return message
}

export const toCommandRecord = (row: RuntimeRowRecord<'commands'>) => ({
  ...row,
  payload: isRecord(row.payload) ? row.payload : {},
  status: normalizeCommandStatus(row.status),
  type: normalizeCommandType(row.type),
})

export type CommandRecord = ReturnType<typeof toCommandRecord>

export const getCommand = (runtimeStore: RuntimeStore, commandId: string) => {
  if (!runtimeStore.hasRow('commands', commandId)) {
    return null
  }

  return toCommandRecord(runtimeStore.getRow('commands', commandId))
}

export const getCommandOrThrow = (runtimeStore: RuntimeStore, commandId: string): CommandRecord => {
  const command = getCommand(runtimeStore, commandId)
  if (command === null) {
    throw new Error(`Missing command: ${commandId}`)
  }
  return command
}

export const getSessionMessages = (
  runtimeStore: RuntimeStore,
  runtimeIndexes: RuntimeIndexes,
  sessionId: string,
) =>
  runtimeIndexes
    .getSliceRowIds('messagesBySession', sessionId)
    .map((messageId) => getMessage(runtimeStore, messageId))
    .filter((message): message is MessageRecord => message !== null)

export const getLatestAssistantMessage = (
  runtimeStore: RuntimeStore,
  runtimeIndexes: RuntimeIndexes,
  sessionId: string,
) =>
  getSessionMessages(runtimeStore, runtimeIndexes, sessionId)
    .toReversed()
    .find((message) => message.role === 'assistant')

export const getActiveSessionId = (runtimeStore: RuntimeStore) =>
  runtimeStore.getValue('activeSessionId')

export const getSessionIds = (runtimeStore: RuntimeStore) => runtimeStore.getRowIds('sessions')

export const getPendingCommands = (runtimeStore: RuntimeStore, runtimeIndexes: RuntimeIndexes) =>
  runtimeIndexes
    .getSliceRowIds('commandsByCreatedAt', 'all')
    .map((commandId) => ({
      command: getCommand(runtimeStore, commandId),
      commandId,
    }))
    .filter(
      (entry): entry is { command: CommandRecord; commandId: string } =>
        entry.command !== null && entry.command.status === 'pending',
    )

export const getProcessingCommandIds = (runtimeStore: RuntimeStore) =>
  runtimeStore
    .getRowIds('commands')
    .filter((commandId) => getCommand(runtimeStore, commandId)?.status === 'processing')

export const getStreamingSessionIds = (runtimeStore: RuntimeStore) =>
  runtimeStore
    .getRowIds('sessions')
    .filter((sessionId) => getSession(runtimeStore, sessionId)?.status === 'streaming')
