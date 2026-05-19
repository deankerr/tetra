import type { TetraStore } from '#store'

export interface WorkspaceState {
  clearActiveSessionId(): void
  getActiveSessionId(): string | undefined
  setActiveSessionId(sessionId: string): void
}

export function createWorkspaceState({ store }: TetraStore): WorkspaceState {
  return {
    clearActiveSessionId() {
      // Empty string is TinyBase's default value for "no active session".
      store.setValue('activeSessionId', '')
    },

    getActiveSessionId() {
      // Keep the core state unopinionated; callers decide whether stale IDs are valid.
      const activeSessionId = store.getValue('activeSessionId').trim()
      return activeSessionId === '' ? undefined : activeSessionId
    },

    setActiveSessionId(sessionId) {
      // Store only the shared workspace value, not any CLI command semantics.
      store.setValue('activeSessionId', sessionId)
    },
  }
}
