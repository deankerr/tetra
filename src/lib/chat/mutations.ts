import type {
  CommandStatus,
  CommandType,
  ConfigRowRecord,
  RuntimeRowRecord,
  SessionStatus,
  StoredMessage,
} from '@/lib/chat/repository'
import { DEFAULT_AGENT_ID, DEFAULT_AGENT_NAME, DEFAULT_MODEL_ID } from '@/lib/chat/schemas'
import type { ConfigStore, RuntimeStore } from '@/lib/chat/store'

const now = () => Date.now()

export const createDefaultAgentRow = (): ConfigRowRecord<'agents'> => ({
  maxTokens: 800,
  model: DEFAULT_MODEL_ID,
  name: DEFAULT_AGENT_NAME,
  provider: 'openrouter',
  systemPrompt:
    'You are a concise assistant helping evaluate a local-first TinyBase chat runtime prototype. Answer directly and prefer short, concrete responses.',
  temperature: 0.7,
})

export const createSessionRow = (
  agentId: string,
  timestamp = now(),
): RuntimeRowRecord<'sessions'> => ({
  activeCommandId: '',
  agentId,
  createdAt: timestamp,
  errorMessage: '',
  lastSeq: 0,
  status: 'idle',
  title: 'New session',
  updatedAt: timestamp,
})

export const createMessageRow = (
  sessionId: string,
  seq: number,
  message: StoredMessage,
  createdAt = now(),
  updatedAt = createdAt,
): RuntimeRowRecord<'messages'> => ({
  createdAt,
  message,
  role: message.role,
  seq,
  sessionId,
  updatedAt,
})

export const createCommandRow = (
  sessionId: string,
  type: CommandType,
  payload: Record<string, unknown>,
  timestamp = now(),
): RuntimeRowRecord<'commands'> => ({
  claimedAt: 0,
  claimedBy: '',
  completedAt: 0,
  createdAt: timestamp,
  errorMessage: '',
  payload,
  sessionId,
  status: 'pending',
  type,
  updatedAt: timestamp,
})

export const insertDefaultAgent = (configStore: ConfigStore, agentId = DEFAULT_AGENT_ID) => {
  configStore.setRow('agents', agentId, createDefaultAgentRow())
}

export const updateAgent = (
  configStore: ConfigStore,
  agentId: string,
  patch: Partial<ConfigRowRecord<'agents'>>,
) => {
  configStore.setPartialRow('agents', agentId, patch)
}

export const setActiveSessionId = (runtimeStore: RuntimeStore, sessionId: string) => {
  runtimeStore.setValue('activeSessionId', sessionId)
}

export const insertSession = (
  runtimeStore: RuntimeStore,
  sessionId: string,
  agentId: string,
  timestamp = now(),
) => {
  runtimeStore.setRow('sessions', sessionId, createSessionRow(agentId, timestamp))
}

export const insertMessage = (
  runtimeStore: RuntimeStore,
  messageId: string,
  sessionId: string,
  seq: number,
  message: StoredMessage,
  timestamp = now(),
) => {
  runtimeStore.setRow(
    'messages',
    messageId,
    createMessageRow(sessionId, seq, message, timestamp, timestamp),
  )
}

export const restoreMessage = (
  runtimeStore: RuntimeStore,
  messageId: string,
  row: RuntimeRowRecord<'messages'>,
) => {
  runtimeStore.setRow('messages', messageId, row)
}

export const deleteMessage = (runtimeStore: RuntimeStore, messageId: string) => {
  runtimeStore.delRow('messages', messageId)
}

export const insertCommand = (
  runtimeStore: RuntimeStore,
  commandId: string,
  sessionId: string,
  type: CommandType,
  payload: Record<string, unknown>,
  timestamp = now(),
) => {
  runtimeStore.setRow('commands', commandId, createCommandRow(sessionId, type, payload, timestamp))
}

export const updateSession = (
  runtimeStore: RuntimeStore,
  sessionId: string,
  patch: Partial<RuntimeRowRecord<'sessions'>>,
  timestamp = now(),
) => {
  runtimeStore.setPartialRow('sessions', sessionId, {
    ...patch,
    updatedAt: timestamp,
  })
}

export const updateMessage = (
  runtimeStore: RuntimeStore,
  messageId: string,
  patch: Partial<RuntimeRowRecord<'messages'>>,
  timestamp = now(),
) => {
  runtimeStore.setPartialRow('messages', messageId, {
    ...patch,
    updatedAt: timestamp,
  })
}

export const updateCommand = (
  runtimeStore: RuntimeStore,
  commandId: string,
  patch: Partial<RuntimeRowRecord<'commands'>>,
  timestamp = now(),
) => {
  runtimeStore.setPartialRow('commands', commandId, {
    ...patch,
    updatedAt: timestamp,
  })
}

export const setSessionStatus = (
  runtimeStore: RuntimeStore,
  sessionId: string,
  status: SessionStatus,
  patch: Partial<RuntimeRowRecord<'sessions'>> = {},
  timestamp = now(),
) => {
  updateSession(
    runtimeStore,
    sessionId,
    {
      ...patch,
      status,
    },
    timestamp,
  )
}

export const finishCommand = (
  runtimeStore: RuntimeStore,
  commandId: string,
  status: CommandStatus,
  errorMessage = '',
  timestamp = now(),
) => {
  updateCommand(
    runtimeStore,
    commandId,
    {
      completedAt: timestamp,
      errorMessage,
      status,
    },
    timestamp,
  )
}

export const claimCommand = (
  runtimeStore: RuntimeStore,
  commandId: string,
  runtimeId: string,
  timestamp = now(),
) => {
  updateCommand(
    runtimeStore,
    commandId,
    {
      claimedAt: timestamp,
      claimedBy: runtimeId,
      status: 'processing',
    },
    timestamp,
  )
}
