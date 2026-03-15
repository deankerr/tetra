'use client'

import { DefaultChatTransport, readUIMessageStream } from 'ai'
import type { UIMessage } from 'ai'
import { nanoid } from 'nanoid'
import { createIndexes, createStore } from 'tinybase'
import type { Indexes, Store } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import {
  DEFAULT_AGENT_ID,
  DEFAULT_AGENT_NAME,
  DEFAULT_MODEL_ID,
  configTablesSchema,
  configValuesSchema,
  runtimeTablesSchema,
  runtimeValuesSchema,
} from '@/lib/chat/types'
import type {
  AgentRow,
  CancelPayload,
  CommandRow,
  CommandStatus,
  CommandType,
  MessageRow,
  RetryPayload,
  SendPayload,
  SessionRow,
  SessionStatus,
  StoredMessage,
} from '@/lib/chat/types'

const CONFIG_DB_NAME = 'tinybasechat-config'
const RUNTIME_DB_NAME = 'tinybasechat-runtime'

const DEFAULT_SYSTEM_PROMPT =
  'You are a concise assistant helping evaluate a local-first TinyBase chat runtime prototype. Answer directly and prefer short, concrete responses.'

const transport = new DefaultChatTransport<UIMessage>({ api: '/api/chat' })

export interface ChatApp {
  configStore: Store
  runtimeStore: Store
  runtimeIndexes: Indexes
  initialize: () => Promise<void>
  startRuntime: () => void
}

type PendingRetry = {
  assistantMessageId: string
  history: StoredMessage[]
  replacedMessage: MessageRow
}

let chatApp: ChatApp | undefined

const now = () => Date.now()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isTextPart = (value: unknown): value is { text: string; type: 'text' } =>
  isRecord(value) && value.type === 'text' && typeof value.text === 'string'

const isStoredMessage = (value: unknown): value is StoredMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.role === 'assistant' || value.role === 'system' || value.role === 'user') &&
  Array.isArray(value.parts)

const isSendPayload = (value: unknown): value is SendPayload =>
  isRecord(value) &&
  typeof value.assistantMessageId === 'string' &&
  typeof value.sourceMessageId === 'string'

const isRetryPayload = (value: unknown): value is RetryPayload =>
  isRecord(value) &&
  typeof value.assistantMessageId === 'string' &&
  typeof value.replacedMessageId === 'string'

const isCancelPayload = (value: unknown): value is CancelPayload =>
  isRecord(value) && typeof value.targetCommandId === 'string'

const getStringCell = (store: Store, tableId: string, rowId: string, cellId: string) => {
  const value = store.getCell(tableId, rowId, cellId)
  return typeof value === 'string' ? value : ''
}

const getNumberCell = (store: Store, tableId: string, rowId: string, cellId: string) => {
  const value = store.getCell(tableId, rowId, cellId)
  return typeof value === 'number' ? value : 0
}

const getObjectCell = <TValue>(
  store: Store,
  tableId: string,
  rowId: string,
  cellId: string,
  predicate: (value: unknown) => value is TValue,
) => {
  const value = store.getCell(tableId, rowId, cellId)
  return predicate(value) ? value : undefined
}

const normalizeCommandType = (value: string): CommandType => {
  if (value === 'cancel' || value === 'retry') {
    return value
  }
  return 'send'
}

const normalizeCommandStatus = (value: string): CommandStatus => {
  if (value === 'processing' || value === 'complete' || value === 'error' || value === 'canceled') {
    return value
  }
  return 'pending'
}

const normalizeSessionStatus = (value: string): SessionStatus => {
  if (value === 'streaming' || value === 'error') {
    return value
  }
  return 'idle'
}

const toStoredMessage = (message: UIMessage): StoredMessage => ({
  ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
  id: message.id,
  parts: message.parts.map((part) => ({ ...part })),
  role: message.role,
})

const createUserMessage = (id: string, text: string) =>
  toStoredMessage({
    id,
    parts: [{ state: 'done', text, type: 'text' }],
    role: 'user',
  })

const createAssistantMessage = (id: string) =>
  toStoredMessage({
    id,
    parts: [],
    role: 'assistant',
  })

const getMessageText = (message: StoredMessage) =>
  message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')

const truncateText = (value: string, maxLength = 48) => {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  if (normalized === '') {
    return 'New session'
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}…`
}

const createSessionRow = (agentId: string): SessionRow => {
  const timestamp = now()
  return {
    activeCommandId: '',
    agentId,
    createdAt: timestamp,
    errorMessage: '',
    lastSeq: 0,
    status: 'idle',
    title: 'New session',
    updatedAt: timestamp,
  }
}

const createDefaultAgent = (): AgentRow => ({
  maxTokens: 800,
  model: DEFAULT_MODEL_ID,
  name: DEFAULT_AGENT_NAME,
  provider: 'openrouter',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
})

const getAgent = (configStore: Store, agentId: string): AgentRow | null => {
  if (!configStore.hasRow('agents', agentId)) {
    return null
  }

  return {
    maxTokens: getNumberCell(configStore, 'agents', agentId, 'maxTokens'),
    model: getStringCell(configStore, 'agents', agentId, 'model'),
    name: getStringCell(configStore, 'agents', agentId, 'name'),
    provider: 'openrouter',
    systemPrompt: getStringCell(configStore, 'agents', agentId, 'systemPrompt'),
    temperature: getNumberCell(configStore, 'agents', agentId, 'temperature'),
  }
}

const getSession = (runtimeStore: Store, sessionId: string): SessionRow | null => {
  if (!runtimeStore.hasRow('sessions', sessionId)) {
    return null
  }

  return {
    activeCommandId: getStringCell(runtimeStore, 'sessions', sessionId, 'activeCommandId'),
    agentId: getStringCell(runtimeStore, 'sessions', sessionId, 'agentId'),
    createdAt: getNumberCell(runtimeStore, 'sessions', sessionId, 'createdAt'),
    errorMessage: getStringCell(runtimeStore, 'sessions', sessionId, 'errorMessage'),
    lastSeq: getNumberCell(runtimeStore, 'sessions', sessionId, 'lastSeq'),
    status: normalizeSessionStatus(getStringCell(runtimeStore, 'sessions', sessionId, 'status')),
    title: getStringCell(runtimeStore, 'sessions', sessionId, 'title'),
    updatedAt: getNumberCell(runtimeStore, 'sessions', sessionId, 'updatedAt'),
  }
}

const getMessageRow = (runtimeStore: Store, messageId: string): MessageRow | null => {
  if (!runtimeStore.hasRow('messages', messageId)) {
    return null
  }

  const message = getObjectCell(runtimeStore, 'messages', messageId, 'message', isStoredMessage)
  if (message === undefined) {
    return null
  }

  return {
    createdAt: getNumberCell(runtimeStore, 'messages', messageId, 'createdAt'),
    message,
    role: message.role,
    seq: getNumberCell(runtimeStore, 'messages', messageId, 'seq'),
    sessionId: getStringCell(runtimeStore, 'messages', messageId, 'sessionId'),
    updatedAt: getNumberCell(runtimeStore, 'messages', messageId, 'updatedAt'),
  }
}

const getCommand = (runtimeStore: Store, commandId: string): CommandRow | null => {
  if (!runtimeStore.hasRow('commands', commandId)) {
    return null
  }

  return {
    claimedAt: getNumberCell(runtimeStore, 'commands', commandId, 'claimedAt'),
    claimedBy: getStringCell(runtimeStore, 'commands', commandId, 'claimedBy'),
    completedAt: getNumberCell(runtimeStore, 'commands', commandId, 'completedAt'),
    createdAt: getNumberCell(runtimeStore, 'commands', commandId, 'createdAt'),
    errorMessage: getStringCell(runtimeStore, 'commands', commandId, 'errorMessage'),
    payload: getObjectCell(runtimeStore, 'commands', commandId, 'payload', isRecord) ?? {},
    sessionId: getStringCell(runtimeStore, 'commands', commandId, 'sessionId'),
    status: normalizeCommandStatus(getStringCell(runtimeStore, 'commands', commandId, 'status')),
    type: normalizeCommandType(getStringCell(runtimeStore, 'commands', commandId, 'type')),
    updatedAt: getNumberCell(runtimeStore, 'commands', commandId, 'updatedAt'),
  }
}

const getActiveSessionId = (runtimeStore: Store) => {
  const value = runtimeStore.getValue('activeSessionId')
  return typeof value === 'string' ? value : ''
}

const setSessionStatus = (
  runtimeStore: Store,
  sessionId: string,
  status: SessionStatus,
  extra: Partial<SessionRow> = {},
) => {
  runtimeStore.setPartialRow('sessions', sessionId, {
    status,
    updatedAt: now(),
    ...extra,
  })
}

const getSessionMessages = (
  runtimeStore: Store,
  runtimeIndexes: Indexes,
  sessionId: string,
): MessageRow[] =>
  runtimeIndexes
    .getSliceRowIds('messagesBySession', sessionId)
    .map((messageId) => getMessageRow(runtimeStore, messageId))
    .filter((message): message is MessageRow => message !== null)

const createRuntimeIndexes = (runtimeStore: Store) =>
  createIndexes(runtimeStore)
    .setIndexDefinition(
      'sessionsByRecency',
      'sessions',
      () => 'all',
      (_, rowId) => getNumberCell(runtimeStore, 'sessions', rowId, 'updatedAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition(
      'messagesBySession',
      'messages',
      'sessionId',
      'seq',
      undefined,
      (left, right) => Number(left) - Number(right),
    )
    .setIndexDefinition(
      'commandsByCreatedAt',
      'commands',
      () => 'all',
      (_, rowId) => getNumberCell(runtimeStore, 'commands', rowId, 'createdAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )

class PrototypeRuntime {
  private readonly configStore: Store
  private readonly runtimeStore: Store
  private readonly runtimeIndexes: Indexes
  private readonly runtimeId = `runtime-${nanoid(8)}`
  private activeCommands = new Set<string>()
  private activeSessions = new Set<string>()
  private abortControllers = new Map<string, AbortController>()
  private listenerId: string | number | undefined
  private sweepScheduled = false

  constructor(configStore: Store, runtimeStore: Store, runtimeIndexes: Indexes) {
    this.configStore = configStore
    this.runtimeStore = runtimeStore
    this.runtimeIndexes = runtimeIndexes
  }

  start() {
    if (this.listenerId !== undefined) {
      return
    }

    this.recoverInterruptedWork()
    this.listenerId = this.runtimeStore.addTableListener('commands', () => {
      this.scheduleSweep()
    })
    this.scheduleSweep()
  }

  private recoverInterruptedWork() {
    const timestamp = now()
    const processingCommandIds = this.runtimeStore
      .getRowIds('commands')
      .filter(
        (commandId) =>
          getStringCell(this.runtimeStore, 'commands', commandId, 'status') === 'processing',
      )

    if (processingCommandIds.length === 0) {
      return
    }

    this.runtimeStore.transaction(() => {
      for (const commandId of processingCommandIds) {
        this.runtimeStore.setPartialRow('commands', commandId, {
          completedAt: timestamp,
          errorMessage: 'Interrupted by runtime restart',
          status: 'error',
          updatedAt: timestamp,
        })
      }

      for (const sessionId of this.runtimeStore.getRowIds('sessions')) {
        const session = getSession(this.runtimeStore, sessionId)
        if (session === null || session.status !== 'streaming') {
          continue
        }

        this.runtimeStore.setPartialRow('sessions', sessionId, {
          activeCommandId: '',
          errorMessage: 'Interrupted by runtime restart',
          status: 'error',
          updatedAt: timestamp,
        })
      }
    })
  }

  private scheduleSweep() {
    if (this.sweepScheduled) {
      return
    }

    this.sweepScheduled = true
    queueMicrotask(() => {
      this.sweepScheduled = false
      this.processPendingCommands()
    })
  }

  private processPendingCommands() {
    const pendingCommands = this.runtimeIndexes
      .getSliceRowIds('commandsByCreatedAt', 'all')
      .map((commandId) => ({
        command: getCommand(this.runtimeStore, commandId),
        commandId,
      }))
      .filter(
        (entry): entry is { command: CommandRow; commandId: string } =>
          entry.command !== null && entry.command.status === 'pending',
      )

    for (const { command, commandId } of pendingCommands) {
      if (this.activeCommands.has(commandId)) {
        continue
      }

      if (command.type !== 'cancel' && this.activeSessions.has(command.sessionId)) {
        continue
      }

      if (!this.claimCommand(commandId)) {
        continue
      }

      void this.runCommand(commandId, command)
    }
  }

  private claimCommand(commandId: string) {
    const command = getCommand(this.runtimeStore, commandId)
    if (command === null || command.status !== 'pending') {
      return false
    }

    this.activeCommands.add(commandId)
    this.runtimeStore.setPartialRow('commands', commandId, {
      claimedAt: now(),
      claimedBy: this.runtimeId,
      status: 'processing',
      updatedAt: now(),
    })
    return true
  }

  private async runCommand(commandId: string, command: CommandRow) {
    if (command.type !== 'cancel') {
      this.activeSessions.add(command.sessionId)
    }

    try {
      if (command.type === 'send') {
        await this.handleSend(commandId, command)
      } else if (command.type === 'retry') {
        await this.handleRetry(commandId, command)
      } else {
        this.handleCancel(commandId, command)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime error'
      this.finishCommand(commandId, 'error', message)
      setSessionStatus(this.runtimeStore, command.sessionId, 'error', {
        activeCommandId: '',
        errorMessage: message,
      })
    } finally {
      this.activeCommands.delete(commandId)
      this.activeSessions.delete(command.sessionId)
      this.abortControllers.delete(commandId)
      this.scheduleSweep()
    }
  }

  private finishCommand(commandId: string, status: CommandStatus, errorMessage = '') {
    this.runtimeStore.setPartialRow('commands', commandId, {
      completedAt: now(),
      errorMessage,
      status,
      updatedAt: now(),
    })
  }

  private async handleSend(commandId: string, command: CommandRow) {
    if (!isSendPayload(command.payload)) {
      throw new Error('Invalid send payload')
    }

    const { assistantMessageId, sourceMessageId } = command.payload

    const session = getSession(this.runtimeStore, command.sessionId)
    if (session === null) {
      throw new Error('Missing session for send command')
    }

    const agent = getAgent(this.configStore, session.agentId)
    if (agent === null) {
      throw new Error('Missing agent configuration')
    }

    const messages = getSessionMessages(this.runtimeStore, this.runtimeIndexes, command.sessionId)
    const sourceMessage = messages.find((message) => message.message.id === sourceMessageId)
    if (sourceMessage === undefined) {
      throw new Error('Missing source message for send command')
    }

    const placeholderSeq = session.lastSeq + 1
    const assistantMessage = createAssistantMessage(assistantMessageId)

    this.runtimeStore.transaction(() => {
      this.runtimeStore.setRow('messages', assistantMessageId, {
        createdAt: now(),
        message: assistantMessage,
        role: 'assistant',
        seq: placeholderSeq,
        sessionId: command.sessionId,
        updatedAt: now(),
      })
      this.runtimeStore.setPartialRow('sessions', command.sessionId, {
        activeCommandId: commandId,
        errorMessage: '',
        lastSeq: placeholderSeq,
        status: 'streaming',
        title:
          session.title === 'New session'
            ? truncateText(getMessageText(sourceMessage.message))
            : session.title,
        updatedAt: now(),
      })
    })

    const abortController = new AbortController()
    this.abortControllers.set(commandId, abortController)

    try {
      const stream = await transport.sendMessages({
        abortSignal: abortController.signal,
        body: {
          assistantMessageId,
          maxTokens: agent.maxTokens,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          temperature: agent.temperature,
        },
        chatId: command.sessionId,
        headers: undefined,
        messageId: sourceMessageId,
        messages: messages.map((message) => message.message),
        metadata: undefined,
        trigger: 'submit-message',
      })

      for await (const nextMessage of readUIMessageStream<UIMessage>({
        message: assistantMessage,
        stream,
      })) {
        this.runtimeStore.setPartialRow('messages', assistantMessageId, {
          message: toStoredMessage(nextMessage),
          role: nextMessage.role,
          updatedAt: now(),
        })
      }

      if (abortController.signal.aborted) {
        this.handleAbortedSend(commandId, command.sessionId, assistantMessageId)
        return
      }

      this.finishCommand(commandId, 'complete')
      setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
        activeCommandId: '',
        errorMessage: '',
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        this.handleAbortedSend(commandId, command.sessionId, assistantMessageId)
        return
      }

      throw error
    }
  }

  private async handleRetry(commandId: string, command: CommandRow) {
    if (!isRetryPayload(command.payload)) {
      throw new Error('Invalid retry payload')
    }

    const retry = this.prepareRetry(command.sessionId, command.payload)
    const session = getSession(this.runtimeStore, command.sessionId)
    if (session === null) {
      throw new Error('Missing session for retry command')
    }

    const agent = getAgent(this.configStore, session.agentId)
    if (agent === null) {
      throw new Error('Missing agent configuration')
    }

    this.runtimeStore.transaction(() => {
      this.runtimeStore.delRow('messages', retry.replacedMessage.message.id)
      this.runtimeStore.setRow('messages', retry.assistantMessageId, {
        createdAt: now(),
        message: createAssistantMessage(retry.assistantMessageId),
        role: 'assistant',
        seq: retry.replacedMessage.seq,
        sessionId: command.sessionId,
        updatedAt: now(),
      })
      this.runtimeStore.setPartialRow('sessions', command.sessionId, {
        activeCommandId: commandId,
        errorMessage: '',
        status: 'streaming',
        updatedAt: now(),
      })
    })

    const abortController = new AbortController()
    this.abortControllers.set(commandId, abortController)

    try {
      const stream = await transport.sendMessages({
        abortSignal: abortController.signal,
        body: {
          assistantMessageId: retry.assistantMessageId,
          maxTokens: agent.maxTokens,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          temperature: agent.temperature,
        },
        chatId: command.sessionId,
        headers: undefined,
        messageId: retry.replacedMessage.message.id,
        messages: retry.history,
        metadata: undefined,
        trigger: 'regenerate-message',
      })

      for await (const nextMessage of readUIMessageStream<UIMessage>({
        message: createAssistantMessage(retry.assistantMessageId),
        stream,
      })) {
        this.runtimeStore.setPartialRow('messages', retry.assistantMessageId, {
          message: toStoredMessage(nextMessage),
          role: nextMessage.role,
          updatedAt: now(),
        })
      }

      if (abortController.signal.aborted) {
        this.restoreRetryMessage(retry)
        this.finishCommand(commandId, 'canceled', 'Canceled by user')
        setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
          activeCommandId: '',
          errorMessage: '',
        })
        return
      }

      this.finishCommand(commandId, 'complete')
      setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
        activeCommandId: '',
        errorMessage: '',
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        this.restoreRetryMessage(retry)
        this.finishCommand(commandId, 'canceled', 'Canceled by user')
        setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
          activeCommandId: '',
          errorMessage: '',
        })
        return
      }

      this.restoreRetryMessage(retry)

      throw error
    }
  }

  private prepareRetry(sessionId: string, payload: RetryPayload): PendingRetry {
    const messages = getSessionMessages(this.runtimeStore, this.runtimeIndexes, sessionId)
    const lastAssistantMessage = [...messages]
      .toReversed()
      .find((message) => message.role === 'assistant')

    if (
      lastAssistantMessage === undefined ||
      lastAssistantMessage.message.id !== payload.replacedMessageId
    ) {
      throw new Error('Retry can only target the most recent assistant message')
    }

    return {
      assistantMessageId: payload.assistantMessageId,
      history: messages
        .filter((message) => message.message.id !== payload.replacedMessageId)
        .map((message) => message.message),
      replacedMessage: lastAssistantMessage,
    }
  }

  private handleAbortedSend(commandId: string, sessionId: string, assistantMessageId: string) {
    const placeholder = getMessageRow(this.runtimeStore, assistantMessageId)
    if (placeholder !== null && placeholder.message.parts.length === 0) {
      this.runtimeStore.delRow('messages', assistantMessageId)
    }

    this.finishCommand(commandId, 'canceled', 'Canceled by user')
    setSessionStatus(this.runtimeStore, sessionId, 'idle', {
      activeCommandId: '',
      errorMessage: '',
    })
  }

  private restoreRetryMessage(retry: PendingRetry) {
    const replacement = getMessageRow(this.runtimeStore, retry.assistantMessageId)
    if (replacement !== null) {
      this.runtimeStore.delRow('messages', retry.assistantMessageId)
    }

    this.runtimeStore.setRow('messages', retry.replacedMessage.message.id, {
      createdAt: retry.replacedMessage.createdAt,
      message: retry.replacedMessage.message,
      role: retry.replacedMessage.role,
      seq: retry.replacedMessage.seq,
      sessionId: retry.replacedMessage.sessionId,
      updatedAt: now(),
    })
  }

  private handleCancel(commandId: string, command: CommandRow) {
    if (!isCancelPayload(command.payload)) {
      throw new Error('Invalid cancel payload')
    }

    const abortController = this.abortControllers.get(command.payload.targetCommandId)
    if (abortController === undefined) {
      this.finishCommand(commandId, 'error', 'No active command to cancel')
      return
    }

    abortController.abort()
    this.finishCommand(commandId, 'complete')
  }
}

const ensureDefaultData = (configStore: Store, runtimeStore: Store) => {
  if (getAgent(configStore, DEFAULT_AGENT_ID) === null) {
    const defaultAgent = createDefaultAgent()
    configStore.setRow('agents', DEFAULT_AGENT_ID, {
      maxTokens: defaultAgent.maxTokens,
      model: defaultAgent.model,
      name: defaultAgent.name,
      provider: defaultAgent.provider,
      systemPrompt: defaultAgent.systemPrompt,
      temperature: defaultAgent.temperature,
    })
  }

  const activeSessionId = getActiveSessionId(runtimeStore)
  if (activeSessionId !== '' && getSession(runtimeStore, activeSessionId) !== null) {
    return
  }

  const existingSessionIds = runtimeStore.getRowIds('sessions')
  if (existingSessionIds.length > 0) {
    runtimeStore.setValue('activeSessionId', existingSessionIds[0] ?? '')
    return
  }

  const sessionId = `session-${nanoid(10)}`
  runtimeStore.transaction(() => {
    const session = createSessionRow(DEFAULT_AGENT_ID)
    runtimeStore.setRow('sessions', sessionId, {
      activeCommandId: session.activeCommandId,
      agentId: session.agentId,
      createdAt: session.createdAt,
      errorMessage: session.errorMessage,
      lastSeq: session.lastSeq,
      status: session.status,
      title: session.title,
      updatedAt: session.updatedAt,
    })
    runtimeStore.setValue('activeSessionId', sessionId)
  })
}

const createChatApp = (): ChatApp => {
  const configStore = createStore()
    .setTablesSchema(configTablesSchema)
    .setValuesSchema(configValuesSchema)
  const runtimeStore = createStore()
    .setTablesSchema(runtimeTablesSchema)
    .setValuesSchema(runtimeValuesSchema)
  const runtimeIndexes = createRuntimeIndexes(runtimeStore)
  const configPersister = createIndexedDbPersister(configStore, CONFIG_DB_NAME, 1, console.error)
  const runtimePersister = createIndexedDbPersister(runtimeStore, RUNTIME_DB_NAME, 1, console.error)
  const runtime = new PrototypeRuntime(configStore, runtimeStore, runtimeIndexes)

  let initializePromise: Promise<void> | undefined

  return {
    configStore,
    initialize: async () => {
      initializePromise ??= (async () => {
        await configPersister.startAutoPersisting()
        await runtimePersister.startAutoPersisting()
        ensureDefaultData(configStore, runtimeStore)
      })()

      await initializePromise
    },
    runtimeIndexes,
    runtimeStore,
    startRuntime: () => {
      runtime.start()
    },
  }
}

export const getChatApp = () => {
  chatApp ??= createChatApp()
  return chatApp
}

export { getMessageText }

export const createSession = (runtimeStore: Store, agentId = DEFAULT_AGENT_ID) => {
  const sessionId = `session-${nanoid(10)}`
  runtimeStore.transaction(() => {
    const session = createSessionRow(agentId)
    runtimeStore.setRow('sessions', sessionId, {
      activeCommandId: session.activeCommandId,
      agentId: session.agentId,
      createdAt: session.createdAt,
      errorMessage: session.errorMessage,
      lastSeq: session.lastSeq,
      status: session.status,
      title: session.title,
      updatedAt: session.updatedAt,
    })
    runtimeStore.setValue('activeSessionId', sessionId)
  })
  return sessionId
}

export const selectSession = (runtimeStore: Store, sessionId: string) => {
  runtimeStore.setValue('activeSessionId', sessionId)
}

export const sendMessage = (runtimeStore: Store, sessionId: string, text: string) => {
  const session = getSession(runtimeStore, sessionId)
  const trimmed = text.trim()
  if (session === null || trimmed === '') {
    return null
  }

  const timestamp = now()
  const userMessageId = `message-${nanoid(10)}`
  const commandId = `command-${nanoid(10)}`
  const assistantMessageId = `message-${nanoid(10)}`

  runtimeStore.transaction(() => {
    runtimeStore.setRow('messages', userMessageId, {
      createdAt: timestamp,
      message: createUserMessage(userMessageId, trimmed),
      role: 'user',
      seq: session.lastSeq + 1,
      sessionId,
      updatedAt: timestamp,
    })
    runtimeStore.setRow('commands', commandId, {
      claimedAt: 0,
      claimedBy: '',
      completedAt: 0,
      createdAt: timestamp,
      errorMessage: '',
      payload: {
        assistantMessageId,
        sourceMessageId: userMessageId,
      },
      sessionId,
      status: 'pending',
      type: 'send',
      updatedAt: timestamp,
    })
    runtimeStore.setPartialRow('sessions', sessionId, {
      errorMessage: '',
      lastSeq: session.lastSeq + 1,
      updatedAt: timestamp,
    })
  })

  return commandId
}

export const retryLastAssistantMessage = (
  runtimeStore: Store,
  runtimeIndexes: Indexes,
  sessionId: string,
) => {
  const lastAssistantMessage = [...getSessionMessages(runtimeStore, runtimeIndexes, sessionId)]
    .toReversed()
    .find((message) => message.role === 'assistant')

  if (lastAssistantMessage === undefined) {
    return null
  }

  const commandId = `command-${nanoid(10)}`
  runtimeStore.setRow('commands', commandId, {
    claimedAt: 0,
    claimedBy: '',
    completedAt: 0,
    createdAt: now(),
    errorMessage: '',
    payload: {
      assistantMessageId: `message-${nanoid(10)}`,
      replacedMessageId: lastAssistantMessage.message.id,
    },
    sessionId,
    status: 'pending',
    type: 'retry',
    updatedAt: now(),
  })
  return commandId
}

export const cancelActiveCommand = (runtimeStore: Store, sessionId: string) => {
  const session = getSession(runtimeStore, sessionId)
  if (session === null || session.activeCommandId === '') {
    return null
  }

  const commandId = `command-${nanoid(10)}`
  runtimeStore.setRow('commands', commandId, {
    claimedAt: 0,
    claimedBy: '',
    completedAt: 0,
    createdAt: now(),
    errorMessage: '',
    payload: { targetCommandId: session.activeCommandId },
    sessionId,
    status: 'pending',
    type: 'cancel',
    updatedAt: now(),
  })
  return commandId
}

export const updateAgent = (
  configStore: Store,
  agentId: string,
  patch: Partial<Pick<AgentRow, 'maxTokens' | 'model' | 'systemPrompt' | 'temperature'>>,
) => {
  configStore.setPartialRow('agents', agentId, patch)
}
