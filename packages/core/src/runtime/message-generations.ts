import type { UIMessage } from 'ai'

import { deriveUsageSummary } from '#db'
import type { GenerationStatus, StepRecord, UsageSummary } from '#db'
import type { Store } from '#store'

export interface MessageGenerationPatch {
  parts?: UIMessage['parts']
  status?: GenerationStatus
  steps?: StepRecord[]
  usage?: UsageSummary
}

export function appendMessageGenerationStep(
  store: Store,
  messageId: string,
  step: StepRecord,
): void {
  const generation = store.db.tables.messageGenerations.requireEntity(messageId)
  const steps = [...generation.steps, step]
  updateMessageGeneration(store, messageId, { steps, usage: deriveUsageSummary(steps) })
  store.rebuildSessionUsage(generation.sessionId)
}

export function clearMessageContent(store: Store, messageId: string): void {
  const message = store.db.tables.messages.requireEntity(messageId)
  setMessageGenerationResult(store, messageId, { parts: [], steps: [] })
  store.db.tables.messageGenerations.deleteRow(messageId)
  store.rebuildSessionUsage(message.sessionId)
}

export function commitMessageGeneration(store: Store, messageId: string): void {
  const generation = store.db.tables.messageGenerations.requireEntity(messageId)
  setMessageGenerationResult(store, messageId, {
    parts: generation.parts,
    steps: generation.steps,
  })
  store.db.tables.messageGenerations.deleteRow(messageId)
  store.rebuildSessionUsage(generation.sessionId)
}

export function createMessageGeneration(
  store: Store,
  args: {
    messageId: string
    requestId: string
    sessionId: string
    status?: GenerationStatus
  },
): void {
  const now = Date.now()
  store.db.tables.messageGenerations.setRow(args.messageId, {
    createdAt: now,
    parts: [],
    requestId: args.requestId,
    sessionId: args.sessionId,
    status: args.status ?? 'preparing',
    steps: [],
    updatedAt: now,
    usage: {},
  })
  store.rebuildSessionUsage(args.sessionId)
}

export function updateMessageGeneration(
  store: Store,
  messageId: string,
  patch: MessageGenerationPatch,
): void {
  store.db.tables.messageGenerations.updateRow(messageId, {
    ...('parts' in patch && { parts: patch.parts ?? [] }),
    ...('status' in patch && { status: patch.status }),
    ...('steps' in patch && { steps: patch.steps ?? [] }),
    updatedAt: Date.now(),
    ...('usage' in patch && { usage: patch.usage ?? {} }),
  })
}

export function writeMessageGenerationSnapshot(
  store: Store,
  messageId: string,
  parts: UIMessage['parts'],
): void {
  updateMessageGeneration(store, messageId, { parts })
}

function setMessageGenerationResult(
  store: Store,
  messageId: string,
  args: { parts: UIMessage['parts']; steps: StepRecord[] },
): void {
  store.db.tables.messages.updateRow(messageId, {
    parts: args.parts,
    steps: args.steps,
    updatedAt: Date.now(),
    usage: deriveUsageSummary(args.steps),
  })
}
