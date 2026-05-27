import type { GenerationStatus } from '@tetra/store-schema'
import type { UIMessage } from 'ai'

import type { Helpers } from '#helpers'

export interface MessageGenerationPatch {
  parts?: UIMessage['parts']
  status?: GenerationStatus
}

export function clearMessageContent(helpers: Helpers, messageId: string): void {
  helpers.typedStore.tables.messages.requireEntity(messageId)
  setMessageGenerationResult(helpers, messageId, { parts: [] })
  helpers.typedStore.tables.messageGenerations.deleteRow(messageId)
}

export function commitMessageGeneration(helpers: Helpers, messageId: string): void {
  const generation = helpers.typedStore.tables.messageGenerations.requireEntity(messageId)
  setMessageGenerationResult(helpers, messageId, { parts: generation.parts })
  helpers.typedStore.tables.messageGenerations.deleteRow(messageId)
}

export function createMessageGeneration(
  helpers: Helpers,
  args: {
    messageId: string
    requestId: string
    sessionId: string
    status?: GenerationStatus
  },
): void {
  const now = Date.now()
  helpers.typedStore.tables.messageGenerations.setRow(args.messageId, {
    createdAt: now,
    parts: [],
    requestId: args.requestId,
    sessionId: args.sessionId,
    status: args.status ?? 'preparing',
    updatedAt: now,
  })
}

export function updateMessageGeneration(
  helpers: Helpers,
  messageId: string,
  patch: MessageGenerationPatch,
): void {
  helpers.typedStore.tables.messageGenerations.updateRow(messageId, {
    ...('parts' in patch && { parts: patch.parts ?? [] }),
    ...('status' in patch && { status: patch.status }),
    updatedAt: Date.now(),
  })
}

export function writeMessageGenerationSnapshot(
  helpers: Helpers,
  messageId: string,
  parts: UIMessage['parts'],
): void {
  updateMessageGeneration(helpers, messageId, { parts })
}

function setMessageGenerationResult(
  helpers: Helpers,
  messageId: string,
  args: { parts: UIMessage['parts'] },
): void {
  helpers.typedStore.tables.messages.updateRow(messageId, {
    parts: args.parts,
    updatedAt: Date.now(),
  })
}
