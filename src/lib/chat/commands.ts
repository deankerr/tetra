'use client'

import { nanoid } from 'nanoid'

import { getChatApp } from '@/lib/chat/app'
import {
  insertCommand,
  insertMessage,
  insertSession,
  setActiveSessionId,
  updateAgent as patchAgent,
  updateSession,
} from '@/lib/chat/mutations'
import {
  createCancelPayload,
  createRetryPayload,
  createSendPayload,
  getAgent,
  getLatestAssistantMessage,
  getSession,
} from '@/lib/chat/repository'
import type { AgentRecord, StoredMessage } from '@/lib/chat/repository'
import { DEFAULT_AGENT_ID } from '@/lib/chat/schemas'

const now = () => Date.now()

type AgentPatch = Partial<Pick<AgentRecord, 'maxTokens' | 'model' | 'systemPrompt' | 'temperature'>>

const createUserMessage = (id: string, text: string): StoredMessage => ({
  id,
  parts: [{ state: 'done', text, type: 'text' }],
  role: 'user',
})

export const createSession = (agentId = DEFAULT_AGENT_ID) => {
  const { runtimeStore } = getChatApp()
  const sessionId = `session-${nanoid(10)}`

  runtimeStore.transaction(() => {
    insertSession(runtimeStore, sessionId, agentId)
    setActiveSessionId(runtimeStore, sessionId)
  })

  return sessionId
}

export const selectSession = (sessionId: string) => {
  const { runtimeStore } = getChatApp()
  if (getSession(runtimeStore, sessionId) === null) {
    return false
  }

  setActiveSessionId(runtimeStore, sessionId)
  return true
}

export const sendMessage = (sessionId: string, text: string) => {
  const { runtimeStore } = getChatApp()
  const session = getSession(runtimeStore, sessionId)
  const trimmed = text.trim()

  if (session === null || session.status === 'streaming' || trimmed === '') {
    return null
  }

  const timestamp = now()
  const userMessageId = `message-${nanoid(10)}`
  const commandId = `command-${nanoid(10)}`
  const assistantMessageId = `message-${nanoid(10)}`

  runtimeStore.transaction(() => {
    insertMessage(
      runtimeStore,
      userMessageId,
      sessionId,
      session.lastSeq + 1,
      createUserMessage(userMessageId, trimmed),
      timestamp,
    )
    insertCommand(
      runtimeStore,
      commandId,
      sessionId,
      'send',
      createSendPayload(assistantMessageId, userMessageId),
      timestamp,
    )
    updateSession(
      runtimeStore,
      sessionId,
      {
        errorMessage: '',
        lastSeq: session.lastSeq + 1,
      },
      timestamp,
    )
  })

  return commandId
}

export const retryLastAssistantMessage = (sessionId: string) => {
  const { runtimeIndexes, runtimeStore } = getChatApp()
  const session = getSession(runtimeStore, sessionId)

  if (session === null || session.status === 'streaming') {
    return null
  }

  const lastAssistantMessage = getLatestAssistantMessage(runtimeStore, runtimeIndexes, sessionId)
  if (lastAssistantMessage === undefined) {
    return null
  }

  const commandId = `command-${nanoid(10)}`
  insertCommand(
    runtimeStore,
    commandId,
    sessionId,
    'retry',
    createRetryPayload(`message-${nanoid(10)}`, lastAssistantMessage.message.id),
  )

  return commandId
}

export const cancelActiveCommand = (sessionId: string) => {
  const { runtimeStore } = getChatApp()
  const session = getSession(runtimeStore, sessionId)

  if (session === null || session.activeCommandId === '') {
    return null
  }

  const commandId = `command-${nanoid(10)}`
  insertCommand(
    runtimeStore,
    commandId,
    sessionId,
    'cancel',
    createCancelPayload(session.activeCommandId),
  )

  return commandId
}

export const updateAgent = (agentId: string, patch: AgentPatch) => {
  const { configStore } = getChatApp()
  if (getAgent(configStore, agentId) === null) {
    return false
  }

  patchAgent(configStore, agentId, patch)
  return true
}
