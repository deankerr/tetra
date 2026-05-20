import type { UIMessage } from 'ai'

import { MessageRole } from '#db'
import type { MessageRole as MessageRoleType, Rows, TetraDb } from '#db'

import { createIdGenerator } from './ids'

export class MessageAccessors {
  private readonly db: TetraDb
  private readonly nextId = createIdGenerator('mesg')

  constructor(db: TetraDb) {
    this.db = db
  }

  create(sessionId: string, args: { parts: UIMessage['parts']; role: MessageRoleType }): string {
    const messageId = this.nextId()
    const now = Date.now()

    this.db.store.setRow('messages', messageId, {
      createdAt: now,
      parts: args.parts,
      role: args.role,
      sessionId,
      updatedAt: now,
    })

    return messageId
  }

  delete(messageId: string): void {
    this.db.store.delRow('messages', messageId)
  }

  get(messageId: string): Rows.Message {
    if (!this.exists(messageId)) {
      throw new Error(`Message not found: ${messageId}`)
    }

    const row = this.db.store.getRow('messages', messageId)
    return {
      createdAt: row.createdAt,
      id: messageId,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- UIMessage parts are stored verbatim in TinyBase's array cell.
      parts: row.parts as UIMessage['parts'],
      role: MessageRole.parse(row.role),
      sessionId: row.sessionId,
      updatedAt: row.updatedAt,
    }
  }

  idsForSession(sessionId: string): string[] {
    return this.db.indexes.getSliceRowIds('messagesBySession', sessionId)
  }

  listForSession(sessionId: string): Rows.Message[] {
    return this.idsForSession(sessionId).map((messageId) => this.get(messageId))
  }

  update(messageId: string, patch: { parts?: UIMessage['parts']; role?: MessageRoleType }): void {
    this.get(messageId)

    this.db.store.setPartialRow('messages', messageId, {
      ...('parts' in patch && { parts: patch.parts ?? [] }),
      ...('role' in patch && { role: MessageRole.parse(patch.role) }),
      updatedAt: Date.now(),
    })
  }

  private exists(messageId: string): boolean {
    return this.db.store.hasRow('messages', messageId)
  }
}
