import type { Inference } from '@tetra/inference'
import type { SessionConfig, TetraStore } from '@tetra/store'

export type RuntimeContext = {
  controllers: Map<string, AbortController>
  indexes: TetraStore['tinybase']['indexes']
  inference: Inference
  store: TetraStore['tinybase']['store']
  transaction: TetraStore['transaction']
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
