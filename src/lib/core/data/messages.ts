import type { UIMessage } from 'ai'
import * as R from 'remeda'
import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import type { Schemas } from '@/lib/core/data/schemas'
import type { AppIndexes, AppStore } from '@/lib/core/data/stores'
import { uiStore } from '@/lib/core/data/stores'

// --- Codec ---

type MessageRow = Row<Schemas[0], 'messages'>

// Zod schema for validating persisted message objects on read.
// Validates structural integrity; the canonical type is AI SDK's UIMessage.
const providerMetadata = z.record(z.string(), z.record(z.string(), z.unknown())).optional()

const textPart = z.object({
  providerMetadata,
  state: z.enum(['streaming', 'done']).optional(),
  text: z.string(),
  type: z.literal('text'),
})

const reasoningPart = z.object({
  providerMetadata,
  state: z.enum(['streaming', 'done']).optional(),
  text: z.string(),
  type: z.literal('reasoning'),
})

const sourceUrlPart = z.object({
  providerMetadata,
  sourceId: z.string(),
  title: z.string().optional(),
  type: z.literal('source-url'),
  url: z.string(),
})

const filePart = z.object({
  filename: z.string().optional(),
  mediaType: z.string(),
  providerMetadata,
  type: z.literal('file'),
  url: z.string(),
})

const stepStartPart = z.object({
  type: z.literal('step-start'),
})

// Catchall for tool parts, dynamic tool parts, data parts, and future types.
// We validate structure at the part level when we need to render them.
const unknownPart = z.looseObject({ type: z.string() })

const uiMessagePartSchema = z.union([
  textPart,
  reasoningPart,
  sourceUrlPart,
  filePart,
  stepStartPart,
  unknownPart,
])

// Validates the minimum shape we need. The result is treated as UIMessage.
const storedMessageSchema = z.object({
  id: z.string(),
  parts: z.array(uiMessagePartSchema),
  role: z.enum(['user', 'assistant', 'system']),
})

// Validate a raw object cell as UIMessage. Zod schema is intentionally looser
// than UIMessage (unknown catchalls, permissive providerMetadata) so it accepts
// anything AI SDK might produce. After validation passes, we trust the data.
const validateMessage = (raw: unknown): UIMessage | null => {
  const result = storedMessageSchema.safeParse(raw)
  // oxlint-disable-next-line no-unsafe-type-assertion -- Zod validates structure; UIMessage is the canonical type
  return result.success ? (result.data as unknown as UIMessage) : null
}

const decode = (id: string, row: MessageRow) => {
  const message = validateMessage(row.message)
  if (message === null) {
    return null
  }

  return {
    createdAt: row.createdAt,
    id,
    message,
    role: message.role,
    seq: row.seq,
    sessionId: row.sessionId,
    updatedAt: row.updatedAt,
  }
}

// UIMessage is an interface (no implicit index signature), but TinyBase's
// object cells expect AnyObject ({ [key: string]: unknown }). Spreading
// into a plain object satisfies the constraint at the DAO boundary.
const toObjectCell = (message: UIMessage) => ({ ...message })

// --- Types ---

export type Message = NonNullable<ReturnType<typeof decode>>

export type MessagePatch = {
  message?: UIMessage
  role?: UIMessage['role']
}

// --- DAO ---

export type MessageDAO = {
  get: (id: string) => Message | null
  getOrThrow: (id: string) => Message
  listIdsBySession: (sessionId: string) => string[]
  listBySession: (sessionId: string) => Message[]
  latestAssistant: (sessionId: string) => Message | null
  insert: (id: string, sessionId: string, seq: number, message: UIMessage) => void
  update: (id: string, patch: MessagePatch) => void
  delete: (id: string) => void
}

export const createMessageDAO = (store: AppStore, indexes: AppIndexes): MessageDAO => ({
  get(id) {
    if (!store.hasRow('messages', id)) {
      return null
    }
    return decode(id, store.getRow('messages', id))
  },

  getOrThrow(id) {
    const message = this.get(id)
    if (message === null) {
      throw new Error(`Message not found: ${id}`)
    }
    return message
  },

  listIdsBySession(sessionId) {
    return indexes.getSliceRowIds('messagesBySession', sessionId)
  },

  listBySession(sessionId) {
    return this.listIdsBySession(sessionId)
      .map((id) => this.get(id))
      .filter((m): m is Message => m !== null)
  },

  latestAssistant(sessionId) {
    const ids = indexes.getSliceRowIds('messagesBySession', sessionId)
    const match = R.findLast(ids, (mid) => store.getCell('messages', mid, 'role') === 'assistant')
    return match === undefined ? null : this.get(match)
  },

  insert(id, sessionId, seq, message) {
    const timestamp = Date.now()
    store.setRow('messages', id, {
      createdAt: timestamp,
      message: toObjectCell(message),
      role: message.role,
      seq,
      sessionId,
      updatedAt: timestamp,
    })
  },

  update(id, patch) {
    if (!store.hasRow('messages', id)) {
      return
    }
    const partial: Record<string, unknown> = { updatedAt: Date.now() }
    if (patch.role !== undefined) {
      partial.role = patch.role
    }
    if (patch.message !== undefined) {
      partial.message = toObjectCell(patch.message)
    }
    store.setPartialRow('messages', id, partial)
  },

  delete(id) {
    store.delRow('messages', id)
  },
})

// --- Hooks ---

export const useSessionMessageIds = (sessionId: string) =>
  uiStore.useSliceRowIds('messagesBySession', sessionId)

// Per-cell subscriptions to avoid useRow instability with object cells.
// useCell returns CellOrUndefined; hasRow guards at runtime but can't
// narrow across separate hook calls. We assert after the guard.
export const useMessage = (id: string): Message | null => {
  const hasRow = uiStore.useHasRow('messages', id)
  const createdAt = uiStore.useCell('messages', id, 'createdAt')
  const message = uiStore.useCell('messages', id, 'message')
  const role = uiStore.useCell('messages', id, 'role')
  const seq = uiStore.useCell('messages', id, 'seq')
  const sessionId = uiStore.useCell('messages', id, 'sessionId')
  const updatedAt = uiStore.useCell('messages', id, 'updatedAt')

  if (
    !hasRow ||
    createdAt === undefined ||
    message === undefined ||
    role === undefined ||
    seq === undefined ||
    sessionId === undefined ||
    updatedAt === undefined
  ) {
    return null
  }

  return decode(id, { createdAt, message, role, seq, sessionId, updatedAt })
}
