import { DefaultChatTransport, readUIMessageStream } from 'ai'
import type { UIMessage } from 'ai'
import { nanoid } from 'nanoid'

import {
  claimCommand as claimCommandRow,
  createMessageRow,
  deleteMessage,
  finishCommand as finishCommandRow,
  insertDefaultAgent,
  insertMessage,
  insertSession,
  restoreMessage,
  setActiveSessionId,
  setSessionStatus,
  updateMessage,
  updateSession,
} from '@/lib/chat/mutations'
import {
  getActiveSessionId,
  getAgent,
  getAgentOrThrow,
  getCommand,
  getLatestAssistantMessage,
  getMessage,
  getPendingCommands,
  getProcessingCommandIds,
  getSession,
  getSessionIds,
  getSessionOrThrow,
  getSessionMessages,
  getStreamingSessionIds,
  isCancelPayload,
  isRetryPayload,
  isSendPayload,
} from '@/lib/chat/repository'
import type {
  CommandRecord,
  MessageRecord,
  RetryPayload,
  StoredMessage,
} from '@/lib/chat/repository'
import { DEFAULT_AGENT_ID } from '@/lib/chat/schemas'
import type { ConfigStore, RuntimeIndexes, RuntimeStore } from '@/lib/chat/store'
import {
  createConfigPersister,
  createConfigStore,
  createRuntimeIndexes,
  createRuntimePersister,
  createRuntimeStore,
} from '@/lib/chat/store'

const transport = new DefaultChatTransport<UIMessage>({ api: '/api/chat' })

export interface ChatApp {
  configStore: ConfigStore
  runtimeStore: RuntimeStore
  runtimeIndexes: RuntimeIndexes
  initialize: () => Promise<void>
  startRuntime: () => void
}

type PendingRetry = {
  assistantMessageId: string
  history: StoredMessage[]
  replacedMessage: MessageRecord
}

let chatApp: ChatApp | undefined

const now = () => Date.now()

const isTextPart = (value: unknown): value is { text: string; type: 'text' } =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === 'text' &&
  'text' in value &&
  typeof value.text === 'string'

const toStoredMessage = (message: UIMessage): StoredMessage => ({
  ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
  id: message.id,
  parts: message.parts.map((part) => ({ ...part })),
  role: message.role,
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
class PrototypeRuntime {
  private readonly configStore: ConfigStore
  private readonly runtimeStore: RuntimeStore
  private readonly runtimeIndexes: RuntimeIndexes
  private readonly runtimeId = `runtime-${nanoid(8)}`
  private activeCommands = new Set<string>()
  private activeSessions = new Set<string>()
  private abortControllers = new Map<string, AbortController>()
  private listenerId: string | number | undefined
  private sweepScheduled = false

  constructor(
    configStore: ConfigStore,
    runtimeStore: RuntimeStore,
    runtimeIndexes: RuntimeIndexes,
  ) {
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
    const processingCommandIds = getProcessingCommandIds(this.runtimeStore)

    if (processingCommandIds.length === 0) {
      return
    }

    this.runtimeStore.transaction(() => {
      for (const commandId of processingCommandIds) {
        finishCommandRow(
          this.runtimeStore,
          commandId,
          'error',
          'Interrupted by runtime restart',
          timestamp,
        )
      }

      for (const sessionId of getStreamingSessionIds(this.runtimeStore)) {
        setSessionStatus(
          this.runtimeStore,
          sessionId,
          'error',
          {
            activeCommandId: '',
            errorMessage: 'Interrupted by runtime restart',
          },
          timestamp,
        )
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
    const pendingCommands = getPendingCommands(this.runtimeStore, this.runtimeIndexes)

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
    if (getCommand(this.runtimeStore, commandId)?.status !== 'pending') {
      return false
    }

    this.activeCommands.add(commandId)
    claimCommandRow(this.runtimeStore, commandId, this.runtimeId)
    return true
  }

  private async runCommand(commandId: string, command: CommandRecord) {
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
      finishCommandRow(this.runtimeStore, commandId, 'error', message)
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

  private async handleSend(commandId: string, command: CommandRecord) {
    if (!isSendPayload(command.payload)) {
      throw new Error('Invalid send payload')
    }

    const { assistantMessageId, sourceMessageId } = command.payload

    const session = getSessionOrThrow(this.runtimeStore, command.sessionId)
    const agent = getAgentOrThrow(this.configStore, session.agentId)

    const messages = getSessionMessages(this.runtimeStore, this.runtimeIndexes, command.sessionId)
    const sourceMessage = messages.find((message) => message.message.id === sourceMessageId)
    if (sourceMessage === undefined) {
      throw new Error('Missing source message for send command')
    }

    const placeholderSeq = session.lastSeq + 1
    const assistantMessage = createAssistantMessage(assistantMessageId)

    this.runtimeStore.transaction(() => {
      insertMessage(
        this.runtimeStore,
        assistantMessageId,
        command.sessionId,
        placeholderSeq,
        assistantMessage,
      )
      updateSession(this.runtimeStore, command.sessionId, {
        activeCommandId: commandId,
        errorMessage: '',
        lastSeq: placeholderSeq,
        status: 'streaming',
        title:
          session.title === 'New session'
            ? truncateText(getMessageText(sourceMessage.message))
            : session.title,
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
        updateMessage(this.runtimeStore, assistantMessageId, {
          message: toStoredMessage(nextMessage),
          role: nextMessage.role,
        })
      }

      if (abortController.signal.aborted) {
        this.handleAbortedSend(commandId, command.sessionId, assistantMessageId)
        return
      }

      finishCommandRow(this.runtimeStore, commandId, 'complete')
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

  private async handleRetry(commandId: string, command: CommandRecord) {
    if (!isRetryPayload(command.payload)) {
      throw new Error('Invalid retry payload')
    }

    const retry = this.prepareRetry(command.sessionId, command.payload)
    const session = getSessionOrThrow(this.runtimeStore, command.sessionId)
    const agent = getAgentOrThrow(this.configStore, session.agentId)

    this.runtimeStore.transaction(() => {
      deleteMessage(this.runtimeStore, retry.replacedMessage.message.id)
      insertMessage(
        this.runtimeStore,
        retry.assistantMessageId,
        command.sessionId,
        retry.replacedMessage.seq,
        createAssistantMessage(retry.assistantMessageId),
      )
      updateSession(this.runtimeStore, command.sessionId, {
        activeCommandId: commandId,
        errorMessage: '',
        status: 'streaming',
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
        updateMessage(this.runtimeStore, retry.assistantMessageId, {
          message: toStoredMessage(nextMessage),
          role: nextMessage.role,
        })
      }

      if (abortController.signal.aborted) {
        this.restoreRetryMessage(retry)
        finishCommandRow(this.runtimeStore, commandId, 'canceled', 'Canceled by user')
        setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
          activeCommandId: '',
          errorMessage: '',
        })
        return
      }

      finishCommandRow(this.runtimeStore, commandId, 'complete')
      setSessionStatus(this.runtimeStore, command.sessionId, 'idle', {
        activeCommandId: '',
        errorMessage: '',
      })
    } catch (error) {
      if (abortController.signal.aborted) {
        this.restoreRetryMessage(retry)
        finishCommandRow(this.runtimeStore, commandId, 'canceled', 'Canceled by user')
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
    const lastAssistantMessage = getLatestAssistantMessage(
      this.runtimeStore,
      this.runtimeIndexes,
      sessionId,
    )

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
    const placeholder = getMessage(this.runtimeStore, assistantMessageId)
    if (placeholder !== null && placeholder.message.parts.length === 0) {
      deleteMessage(this.runtimeStore, assistantMessageId)
    }

    finishCommandRow(this.runtimeStore, commandId, 'canceled', 'Canceled by user')
    setSessionStatus(this.runtimeStore, sessionId, 'idle', {
      activeCommandId: '',
      errorMessage: '',
    })
  }

  private restoreRetryMessage(retry: PendingRetry) {
    const replacement = getMessage(this.runtimeStore, retry.assistantMessageId)
    if (replacement !== null) {
      deleteMessage(this.runtimeStore, retry.assistantMessageId)
    }

    restoreMessage(
      this.runtimeStore,
      retry.replacedMessage.message.id,
      createMessageRow(
        retry.replacedMessage.sessionId,
        retry.replacedMessage.seq,
        retry.replacedMessage.message,
        retry.replacedMessage.createdAt,
        now(),
      ),
    )
  }

  private handleCancel(commandId: string, command: CommandRecord) {
    if (!isCancelPayload(command.payload)) {
      throw new Error('Invalid cancel payload')
    }

    const abortController = this.abortControllers.get(command.payload.targetCommandId)
    if (abortController === undefined) {
      finishCommandRow(this.runtimeStore, commandId, 'error', 'No active command to cancel')
      return
    }

    abortController.abort()
    finishCommandRow(this.runtimeStore, commandId, 'complete')
  }
}

const ensureDefaultData = (configStore: ConfigStore, runtimeStore: RuntimeStore) => {
  if (getAgent(configStore, DEFAULT_AGENT_ID) === null) {
    insertDefaultAgent(configStore)
  }

  const activeSessionId = getActiveSessionId(runtimeStore)
  if (activeSessionId !== '' && getSession(runtimeStore, activeSessionId) !== null) {
    return
  }

  const existingSessionIds = getSessionIds(runtimeStore)
  if (existingSessionIds.length > 0) {
    setActiveSessionId(runtimeStore, existingSessionIds[0] ?? '')
    return
  }

  const sessionId = `session-${nanoid(10)}`
  runtimeStore.transaction(() => {
    insertSession(runtimeStore, sessionId, DEFAULT_AGENT_ID)
    setActiveSessionId(runtimeStore, sessionId)
  })
}

const createChatApp = (): ChatApp => {
  const configStore = createConfigStore()
  const runtimeStore = createRuntimeStore()
  const runtimeIndexes = createRuntimeIndexes(runtimeStore)
  const configPersister = createConfigPersister(configStore)
  const runtimePersister = createRuntimePersister(runtimeStore)
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
