import type { SessionConfig, TetraStore } from '@tetra/store'

export type RuntimeContext = {
  controllers: Map<string, AbortController>
  indexes: TetraStore['indexes']
  store: TetraStore['store']
  transaction: (fn: () => void) => void
}

export type CreateSessionArgs = {
  title?: string
}

export type DeleteSessionArgs = {
  sessionId: string
}

export type UpdateSessionArgs = {
  sessionId: string
  title: string
}

export type UpdateSessionConfigArgs = {
  patch: Partial<SessionConfig>
  sessionId: string
}

export type SendMessageArgs = {
  sessionId: string
  text: string
}
