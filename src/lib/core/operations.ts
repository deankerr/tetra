import type { UIMessage } from 'ai'

import type { DataLayer } from '@/lib/core/data'
import { DEFAULT_AGENT_ID } from '@/lib/core/data/agents'
import type { AgentPatch } from '@/lib/core/data/agents'
import { id } from '@/lib/core/id'

// --- Text Helpers ---

const isTextPart = (part: UIMessage['parts'][number]): part is { text: string; type: 'text' } =>
  part.type === 'text'

export const getMessageText = (message: UIMessage) =>
  message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')

const generateTitle = (text: string, maxLength = 48) => {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  if (normalized === '') {
    return 'New session'
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}

// --- Bound Operations ---

export type Operations = ReturnType<typeof bindOperations>

export const bindOperations = (data: DataLayer) => ({
  createSession(agentId: string) {
    const agent = data.agents.getOrThrow(agentId)
    const sessionId = id.session()

    data.transaction(() => {
      data.sessions.insert(sessionId, agent.id)
      data.store.setValue('activeSessionId', sessionId)
    })

    console.log('[operations:createSession]', 'created', { agentId, sessionId })
    return sessionId
  },

  selectSession(sessionId: string) {
    data.sessions.getOrThrow(sessionId)
    data.store.setValue('activeSessionId', sessionId)

    console.log('[operations:selectSession]', 'selected', { sessionId })
  },

  sendMessage(sessionId: string, text: string) {
    const session = data.sessions.getOrThrow(sessionId)

    // Concurrency guard — one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:sendMessage]', 'skipped — active request exists', { sessionId })
      return null
    }

    const messageId = id.message()
    const assistantMessageId = id.message()
    const requestId = id.request()
    const userSeq = session.lastSeq + 1
    const assistantSeq = session.lastSeq + 2

    const userMessage: UIMessage = {
      id: messageId,
      parts: [{ text, type: 'text' }],
      role: 'user',
    }

    const assistantPlaceholder: UIMessage = {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    }

    // Auto-title: use first user message text
    const isFirstMessage = session.lastSeq === 0
    const title = isFirstMessage ? generateTitle(text) : session.title

    // Atomic: user msg + assistant placeholder + request, all linked
    data.transaction(() => {
      data.messages.insert(messageId, sessionId, userSeq, userMessage)
      data.messages.insert(assistantMessageId, sessionId, assistantSeq, assistantPlaceholder)
      data.sessions.update(sessionId, { lastSeq: assistantSeq, title })
      data.requests.insert(requestId, sessionId, messageId, assistantMessageId)
    })

    console.log('[operations:sendMessage]', 'sent', {
      assistantMessageId,
      messageId,
      requestId,
      sessionId,
      userSeq,
    })
    return { assistantMessageId, messageId, requestId, seq: assistantSeq }
  },

  regenerate(sessionId: string) {
    // Guard: one active request per session
    const active = data.requests.getActiveForSession(sessionId)
    if (active !== null) {
      console.log('[operations:regenerate]', 'skipped — active request exists', { sessionId })
      return null
    }

    // Find last assistant message and the user message before it
    const messages = data.messages.listBySession(sessionId)
    const lastAssistant = messages.findLast((m) => m.message.role === 'assistant')
    if (lastAssistant === undefined) {
      return null
    }
    const lastAssistantIdx = messages.indexOf(lastAssistant)
    const userMessage = messages
      .slice(0, lastAssistantIdx)
      .findLast((m) => m.message.role === 'user')
    if (userMessage === undefined) {
      return null
    }

    const assistantMessageId = id.message()
    const requestId = id.request()

    const assistantPlaceholder: UIMessage = {
      id: assistantMessageId,
      parts: [],
      role: 'assistant',
    }

    // Atomic: delete old assistant, insert new placeholder + request
    data.transaction(() => {
      data.messages.delete(lastAssistant.id)
      data.messages.insert(assistantMessageId, sessionId, lastAssistant.seq, assistantPlaceholder)
      data.requests.insert(requestId, sessionId, userMessage.id, assistantMessageId)
    })

    console.log('[operations:regenerate]', 'regenerating', {
      assistantMessageId,
      requestId,
      sessionId,
    })
    return { assistantMessageId, requestId }
  },

  cancelRequest(sessionId: string) {
    const active = data.requests.getActiveForSession(sessionId)
    if (active === null) {
      return
    }

    data.requests.update(active.id, { status: 'cancelled' })
    console.log('[operations:cancelRequest]', 'cancelled', { requestId: active.id, sessionId })
  },

  updateAgentConfig(agentId: string, patch: AgentPatch) {
    data.agents.update(agentId, patch)
    console.log('[operations:updateAgentConfig]', 'updated', { agentId })
  },
})

// --- Boot-only ---

/** Seed defaults. Called once during boot, not exposed on Core. */
export const ensureDefaults = (data: DataLayer, createSession: (agentId: string) => string) => {
  // Seed default agent if missing
  if (data.agents.get(DEFAULT_AGENT_ID) === null) {
    data.agents.insertDefault()
  }

  // Validate or fix activeSessionId
  const activeSessionId = data.store.getValue('activeSessionId') ?? ''
  if (activeSessionId !== '' && data.sessions.get(activeSessionId) !== null) {
    return
  }

  // Try to pick an existing session
  const existingIds = data.sessions.listIdsByRecency()
  if (existingIds.length > 0 && existingIds[0] !== undefined) {
    data.store.setValue('activeSessionId', existingIds[0])
    return
  }

  // Create a fresh session
  createSession(DEFAULT_AGENT_ID)
}
