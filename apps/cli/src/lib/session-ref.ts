import type { Store } from '@tetra/core'

export interface ResolveSessionArgs {
  forceNew?: boolean
  sessionId?: string
  setActive?: boolean
  title: string
}

export interface ResolveSessionContext {
  store: Store
  workspace: {
    clearActiveSessionId(): void
    getActiveSessionId(): string | undefined
    setActiveSessionId(sessionId: string): void
  }
}

export function resolveSession(
  { store, workspace }: ResolveSessionContext,
  { forceNew = false, sessionId, setActive = true, title }: ResolveSessionArgs,
): string {
  // Explicit session IDs always win, and also become active by default.
  if (sessionId !== undefined) {
    if (!store.sessionExists(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    if (setActive) {
      workspace.setActiveSessionId(sessionId)
    }
    return sessionId
  }

  // Forced-new requests intentionally bypass the currently active session.
  if (forceNew) {
    const nextSessionId = store.createSession({ title })
    if (setActive) {
      workspace.setActiveSessionId(nextSessionId)
    }
    return nextSessionId
  }

  // Reuse the active session when it still points at a real session.
  const activeSessionId = workspace.getActiveSessionId()
  if (activeSessionId !== undefined && store.sessionExists(activeSessionId)) {
    return activeSessionId
  }

  // Stale active IDs are cleared before creating a fresh default session.
  if (activeSessionId !== undefined) {
    workspace.clearActiveSessionId()
  }
  const nextSessionId = store.createSession({ title })
  if (setActive) {
    workspace.setActiveSessionId(nextSessionId)
  }
  return nextSessionId
}
