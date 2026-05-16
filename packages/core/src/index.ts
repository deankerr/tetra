import { getCredential } from '@tetra/credentials/store'

import { createRunner } from '#runner'
import { createSessions } from '#sessions'
import { createStore } from '#store'

export { createRunner } from '#runner'
export type { Runner } from '#runner'
export { createSessions } from '#sessions'
export type { Sessions } from '#sessions'
export { createStore } from '#store'
export type { TetraStore } from '#store'

export { DEFAULT_MODEL_CONFIG, ModelConfig } from '#model'
export type { Message, MessageRole, Request, RequestStatus, Session, Step } from '#model'

// Convenience factory — creates and wires all three subsystems.
// Pass a custom getApiKey for environments where localStorage is unavailable (e.g. CLI).
export function createCore(getApiKey?: () => string) {
  const tetraStore = createStore()
  const sessions = createSessions(tetraStore)
  const apiKey = getApiKey ?? (() => getCredential('openRouterApiKey'))
  const runner = createRunner(tetraStore, sessions, apiKey)
  return { ...tetraStore, runner, sessions }
}
