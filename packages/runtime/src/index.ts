// Runtime — primary entry point
export { createRuntime } from './create-runtime.ts'
export type { Runtime, RuntimeConfig } from './create-runtime.ts'

// Config
export { sessionConfigSchema } from './config.ts'
export type { SessionConfig } from './config.ts'

// Domain types + decoders (used by React hooks and components)
export type { Schemas } from './data/schemas.ts'
export type { Message } from './data/messages.ts'
export { decodeMessage } from './data/messages.ts'
export type { Request } from './data/requests.ts'
export { decodeRequest, decodeRequestConfig } from './data/requests.ts'
export type { Session } from './data/sessions.ts'
export { decodeSession } from './data/sessions.ts'
