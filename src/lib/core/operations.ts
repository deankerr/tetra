import type { UIMessage } from 'ai'
import { nanoid } from 'nanoid'

import type { DataLayer } from '@/lib/core/data'
import { DEFAULT_AGENT_ID } from '@/lib/core/data/agents'

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

// --- Domain Operations ---

/**
 * Create a new session for the given agent and make it active.
 * Returns the new session ID.
 */
export const createSession = (data: DataLayer, agentId: string) => {
  const agent = data.agents.getOrThrow(agentId)
  const sessionId = `session-${nanoid(10)}`

  data.transaction(() => {
    data.sessions.insert(sessionId, agent.id)
    data.store.setValue('activeSessionId', sessionId)
  })

  console.log('[operations:createSession]', 'created', { agentId, sessionId })
  return sessionId
}

/**
 * Switch the active session. Validates the session exists.
 */
export const selectSession = (data: DataLayer, sessionId: string) => {
  data.sessions.getOrThrow(sessionId)
  data.store.setValue('activeSessionId', sessionId)

  console.log('[operations:selectSession]', 'selected', { sessionId })
}

/**
 * Insert a user message into a session, bump seq, auto-title on first message.
 * Returns { messageId, seq } for the caller to use when triggering a stream.
 */
export const sendMessage = (data: DataLayer, sessionId: string, text: string) => {
  const session = data.sessions.getOrThrow(sessionId)
  const messageId = `msg-${nanoid(10)}`
  const seq = session.lastSeq + 1

  const message: UIMessage = {
    id: messageId,
    parts: [{ text, type: 'text' }],
    role: 'user',
  }

  // Auto-title: use first user message text
  const isFirstMessage = session.lastSeq === 0
  const title = isFirstMessage ? generateTitle(text) : session.title

  data.transaction(() => {
    data.messages.insert(messageId, sessionId, seq, message)
    data.sessions.update(sessionId, { lastSeq: seq, title })
  })

  console.log('[operations:sendMessage]', 'sent', { messageId, seq, sessionId })
  return { messageId, seq }
}

/**
 * Update agent configuration. Validates the agent exists.
 */
export const updateAgentConfig = (
  data: DataLayer,
  agentId: string,
  patch: { maxOutputTokens?: number; model?: string; systemPrompt?: string; temperature?: number },
) => {
  data.agents.update(agentId, patch)
  console.log('[operations:updateAgentConfig]', 'updated', { agentId })
}

/**
 * Ensure a default agent and session exist after first load.
 * Idempotent — safe to call on every startup.
 */
export const ensureDefaults = (data: DataLayer) => {
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
  createSession(data, DEFAULT_AGENT_ID)
}
