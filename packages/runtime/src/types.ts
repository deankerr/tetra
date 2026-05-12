import type { RequestConfig, TetraStore } from '@tetra/store'

export interface RuntimeContext {
  controllers: Map<string, AbortController>
  indexes: TetraStore['indexes']
  store: TetraStore['store']
  transaction: (fn: () => void) => void
}

export interface CreateSessionArgs {
  title?: string
}

export interface DeleteSessionArgs {
  sessionId: string
}

export interface UpdateSessionArgs {
  sessionId: string
  title: string
}

export interface UpdateSessionConfigArgs {
  patch: Partial<RequestConfig>
  sessionId: string
}

export interface SendMessageArgs {
  sessionId: string
  text: string
}
