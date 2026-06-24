import type { Transcripts } from '@tetra/core'
import type { LibraryStoreInstance } from '@tetra/stores/library'

export interface ResolveSessionArgs {
  forceNew?: boolean
  sessionId?: string
  setActive?: boolean
  title: string
}

export interface ResolveSessionContext {
  stores: {
    library: LibraryStoreInstance
  }
  transcripts: Transcripts
  workspace: {
    clearActiveSessionId(): void
    getActiveSessionId(): string | undefined
    setActiveSessionId(sessionId: string): void
  }
}

export function resolveSession(
  { stores, transcripts, workspace }: ResolveSessionContext,
  { forceNew = false, sessionId, setActive = true, title }: ResolveSessionArgs,
): string {
  const libraryStore = stores.library.typedStore

  // Explicit session IDs always win, and also become active by default.
  if (sessionId !== undefined) {
    if (!libraryStore.tables.sessions.hasRow(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    if (setActive) {
      workspace.setActiveSessionId(sessionId)
    }
    return sessionId
  }

  // Forced-new sessions intentionally bypass the currently active session.
  if (forceNew) {
    const nextSessionId = transcripts.createSession({ title })
    if (setActive) {
      workspace.setActiveSessionId(nextSessionId)
    }
    return nextSessionId
  }

  // Reuse the active session when it still points at a real session.
  const activeSessionId = workspace.getActiveSessionId()
  if (activeSessionId !== undefined && libraryStore.tables.sessions.hasRow(activeSessionId)) {
    return activeSessionId
  }

  // Stale active IDs are cleared before creating a fresh default session.
  if (activeSessionId !== undefined) {
    workspace.clearActiveSessionId()
  }
  const nextSessionId = transcripts.createSession({ title })
  if (setActive) {
    workspace.setActiveSessionId(nextSessionId)
  }
  return nextSessionId
}
