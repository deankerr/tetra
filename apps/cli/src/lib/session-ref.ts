import type { Helpers } from '@tetra/core'

export interface ResolveSessionArgs {
  forceNew?: boolean
  sessionId?: string
  setActive?: boolean
  title: string
}

export interface ResolveSessionContext {
  helpers: Helpers
  workspace: {
    clearActiveSessionId(): void
    getActiveSessionId(): string | undefined
    setActiveSessionId(sessionId: string): void
  }
}

export function resolveSession(
  { helpers, workspace }: ResolveSessionContext,
  { forceNew = false, sessionId, setActive = true, title }: ResolveSessionArgs,
): string {
  // Explicit session IDs always win, and also become active by default.
  if (sessionId !== undefined) {
    if (!helpers.typedStore.tables.sessions.hasRow(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    if (setActive) {
      workspace.setActiveSessionId(sessionId)
    }
    return sessionId
  }

  // Forced-new requests intentionally bypass the currently active session.
  if (forceNew) {
    const nextSessionId = helpers.createSession({ title })
    if (setActive) {
      workspace.setActiveSessionId(nextSessionId)
    }
    return nextSessionId
  }

  // Reuse the active session when it still points at a real session.
  const activeSessionId = workspace.getActiveSessionId()
  if (activeSessionId !== undefined && helpers.typedStore.tables.sessions.hasRow(activeSessionId)) {
    return activeSessionId
  }

  // Stale active IDs are cleared before creating a fresh default session.
  if (activeSessionId !== undefined) {
    workspace.clearActiveSessionId()
  }
  const nextSessionId = helpers.createSession({ title })
  if (setActive) {
    workspace.setActiveSessionId(nextSessionId)
  }
  return nextSessionId
}
