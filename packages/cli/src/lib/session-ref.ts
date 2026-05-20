import type { Sessions } from '@tetra/core-redesign'

export interface ResolveSessionArgs {
  forceNew?: boolean
  sessionId?: string
  setActive?: boolean
  title: string
}

export interface ResolveSessionContext {
  sessions: Sessions
  workspace: {
    clearActiveSessionId(): void
    getActiveSessionId(): string | undefined
    setActiveSessionId(sessionId: string): void
  }
}

export function resolveSession(
  { sessions, workspace }: ResolveSessionContext,
  { forceNew = false, sessionId, setActive = true, title }: ResolveSessionArgs,
): string {
  // Explicit session IDs always win, and also become active by default.
  if (sessionId !== undefined) {
    if (!sessions.exists(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    if (setActive) {
      workspace.setActiveSessionId(sessionId)
    }
    return sessionId
  }

  // Forced-new requests intentionally bypass the currently active session.
  if (forceNew) {
    const nextSessionId = sessions.create({ title })
    if (setActive) {
      workspace.setActiveSessionId(nextSessionId)
    }
    return nextSessionId
  }

  // Reuse the active session when it still points at a real session.
  const activeSessionId = workspace.getActiveSessionId()
  if (activeSessionId !== undefined && sessions.exists(activeSessionId)) {
    return activeSessionId
  }

  // Stale active IDs are cleared before creating a fresh default session.
  if (activeSessionId !== undefined) {
    workspace.clearActiveSessionId()
  }
  const nextSessionId = sessions.create({ title })
  if (setActive) {
    workspace.setActiveSessionId(nextSessionId)
  }
  return nextSessionId
}
