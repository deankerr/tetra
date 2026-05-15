import type { TetraStore } from '@tetra/store'
import type { UIMessage } from 'ai'

// Reads the ordered message slice for a session, excluding the in-progress assistant placeholder.
export function gatherMessages(
  ctx: { indexes: TetraStore['indexes']; store: TetraStore['store'] },
  args: { assistantMessageId: string; maxMessages?: number; sessionId: string },
): UIMessage[] {
  const { indexes, store } = ctx
  const { assistantMessageId, maxMessages, sessionId } = args

  let messageIds = indexes.getSliceRowIds('messagesBySession', sessionId)
  messageIds = messageIds.filter((id) => id !== assistantMessageId)
  if (maxMessages !== undefined) {
    messageIds = messageIds.slice(-maxMessages)
  }

  return messageIds
    .filter((id) => store.hasRow('messages', id))
    .map((id) => {
      const row = store.getRow('messages', id)
      return {
        createdAt: row.createdAt,
        id,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TinyBase stores AI SDK parts in an array cell.
        parts: row.parts as UIMessage['parts'],
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Runtime writers constrain message roles.
        role: row.role as UIMessage['role'],
        sessionId: row.sessionId,
        updatedAt: row.updatedAt,
      }
    })
}
