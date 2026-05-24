import type { UIMessage } from 'ai'

import type { GenerationStatus, StepRecord, UsageSummary } from '#db'
import type { Helpers } from '#helpers'
import { deriveUsageSummary } from '#usage'

export interface MessageGenerationPatch {
  parts?: UIMessage['parts']
  status?: GenerationStatus
  steps?: StepRecord[]
  usage?: UsageSummary
}

export function appendMessageGenerationStep(
  helpers: Helpers,
  messageId: string,
  step: StepRecord,
): void {
  const generation = helpers.db.tables.messageGenerations.requireEntity(messageId)
  const steps = [...generation.steps, step]
  updateMessageGeneration(helpers, messageId, { steps, usage: deriveUsageSummary(steps) })
  helpers.rebuildSessionUsage(generation.sessionId)
}

export function clearMessageContent(helpers: Helpers, messageId: string): void {
  const message = helpers.db.tables.messages.requireEntity(messageId)
  setMessageGenerationResult(helpers, messageId, { parts: [], steps: [] })
  helpers.db.tables.messageGenerations.deleteRow(messageId)
  helpers.rebuildSessionUsage(message.sessionId)
}

export function commitMessageGeneration(helpers: Helpers, messageId: string): void {
  const generation = helpers.db.tables.messageGenerations.requireEntity(messageId)
  setMessageGenerationResult(helpers, messageId, {
    parts: generation.parts,
    steps: generation.steps,
  })
  helpers.db.tables.messageGenerations.deleteRow(messageId)
  helpers.rebuildSessionUsage(generation.sessionId)
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
  helpers.db.tables.messageGenerations.setRow(args.messageId, {
    createdAt: now,
    parts: [],
    requestId: args.requestId,
    sessionId: args.sessionId,
    status: args.status ?? 'preparing',
    steps: [],
    updatedAt: now,
    usage: {},
  })
  helpers.rebuildSessionUsage(args.sessionId)
}

export function updateMessageGeneration(
  helpers: Helpers,
  messageId: string,
  patch: MessageGenerationPatch,
): void {
  helpers.db.tables.messageGenerations.updateRow(messageId, {
    ...('parts' in patch && { parts: patch.parts ?? [] }),
    ...('status' in patch && { status: patch.status }),
    ...('steps' in patch && { steps: patch.steps ?? [] }),
    updatedAt: Date.now(),
    ...('usage' in patch && { usage: patch.usage ?? {} }),
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
  args: { parts: UIMessage['parts']; steps: StepRecord[] },
): void {
  helpers.db.tables.messages.updateRow(messageId, {
    parts: args.parts,
    steps: args.steps,
    updatedAt: Date.now(),
    usage: deriveUsageSummary(args.steps),
  })
}
