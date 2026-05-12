import type { UIMessage } from 'ai'
import type { Row } from 'tinybase/with-schemas'
import { z } from 'zod'

import { parseRequestConfig } from './request-config.ts'
import type { Schemas } from './store.ts'

type MessageRow = Row<Schemas[0], 'messages'>
type RequestRow = Row<Schemas[0], 'requests'>
type SessionRow = Row<Schemas[0], 'sessions'>

const REQUEST_STATUSES = ['pending', 'streaming', 'completed', 'error'] as const
const requestStatusSchema = z.enum(REQUEST_STATUSES)

const isStatus = (value: string): value is RequestStatus =>
  REQUEST_STATUSES.some((status) => status === value)

export const decodeMessage = (id: string, row: MessageRow) => ({
  createdAt: row.createdAt,
  id,
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- AI SDK UIMessage parts are stored as TinyBase array cells.
  parts: row.parts as UIMessage['parts'],
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Role is constrained by writers and decoded for domain use.
  role: row.role as UIMessage['role'],
  seq: row.seq,
  sessionId: row.sessionId,
  updatedAt: row.updatedAt,
})

export const decodeRequest = (id: string, row: RequestRow) => ({
  assistantMessageId: row.assistantMessageId,
  config: parseRequestConfig(row.config),
  createdAt: row.createdAt,
  errorMessage: row.errorMessage,
  id,
  messageId: row.messageId,
  sessionId: row.sessionId,
  status: isStatus(row.status) ? row.status : ('pending' as const),
})

export const decodeSession = (id: string, row: SessionRow) => ({
  config: parseRequestConfig(row.config),
  createdAt: row.createdAt,
  id,
  lastSeq: row.lastSeq,
  title: row.title,
  updatedAt: row.updatedAt,
})

export type Message = ReturnType<typeof decodeMessage>
export type RequestStatus = z.infer<typeof requestStatusSchema>
export type Request = ReturnType<typeof decodeRequest>
export type Session = ReturnType<typeof decodeSession>
