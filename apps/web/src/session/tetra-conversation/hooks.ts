import type { RequestStatus, StepRecord } from '@tetra/core'
import type { UIMessage } from 'ai'
import { useMemo } from 'react'

import { useRequestForMessage } from '@/tetra/hooks/requests'
import { useMessage } from '@/tetra/hooks/transcripts'

type Part = UIMessage['parts'][number]

// Inference metadata for one assistant step.
interface StepInference {
  cost: StepRecord['cost']
  finishReason: string
  generationId: string
  model: string
  provider: string
  tokens: StepRecord['tokens']
}

// A step groups parts that belong to one inference call (assistant) or the full user turn (virtual).
// User messages produce one implicit step with inference: null.
interface TetraStep {
  inference: StepInference | null
  parts: Part[]
  stepIndex: number
}

interface TetraTotals {
  cacheRead: number
  cacheWrite: number
  cost: number | null
  input: number
  output: number
  reasoning: number
  total: number
}

export interface TetraMessage {
  createdAt: number
  id: string
  // Null for user messages and assistant messages with no request record.
  request: {
    errorMessage: string | null
    status: RequestStatus
    totals: TetraTotals | null
  } | null
  role: UIMessage['role']
  steps: TetraStep[]
  updatedAt: number
}

export function useTetraMessage(messageId: string): TetraMessage | null {
  const message = useMessage(messageId)
  const request = useRequestForMessage(messageId)

  return useMemo(() => {
    if (!message) {
      return null
    }

    const stepRecords = request?.steps ?? []

    return {
      createdAt: message.createdAt,
      id: message.id,
      request: request
        ? {
            errorMessage: request.errorMessage || null,
            status: request.status,
            totals: deriveTotals(stepRecords),
          }
        : null,
      role: message.role,
      steps: groupPartsByStep(message.parts, stepRecords),
      updatedAt: message.updatedAt,
    }
  }, [message, request])
}

// Sums token and cost fields across all steps. Returns null when there are no steps yet.
function deriveTotals(stepRecords: StepRecord[]): TetraTotals | null {
  if (stepRecords.length === 0) {
    return null
  }

  let cacheRead = 0
  let cacheWrite = 0
  let costTotal = 0
  let hasCost = false
  let input = 0
  let output = 0
  let reasoning = 0
  let total = 0

  for (const { tokens, cost } of stepRecords) {
    cacheRead += tokens.cacheRead
    cacheWrite += tokens.cacheWrite
    input += tokens.input
    output += tokens.output
    reasoning += tokens.reasoning
    total += tokens.total
    if (cost.total !== null) {
      costTotal += cost.total
      hasCost = true
    }
  }

  return {
    cacheRead,
    cacheWrite,
    cost: hasCost ? costTotal : null,
    input,
    output,
    reasoning,
    total,
  }
}

// Splits a flat parts array into step groups using step-start markers as boundaries.
// step-start only appears in assistant messages; user messages produce one implicit step.
// Each group index aligns with the corresponding StepRecord index.
function groupPartsByStep(parts: Part[], stepRecords: StepRecord[]): TetraStep[] {
  let current: Part[] = []
  let hasSeenStepStart = false
  const groups: Part[][] = []

  for (const part of parts) {
    if (part.type === 'step-start') {
      if (hasSeenStepStart) {
        groups.push(current)
      }
      current = []
      hasSeenStepStart = true
    } else {
      current.push(part)
    }
  }
  groups.push(current)

  return groups.map((stepParts, i) => {
    const record = stepRecords[i] ?? null
    const inference: StepInference | null = record
      ? {
          cost: record.cost,
          finishReason: record.finishReason,
          generationId: record.generationId,
          model: record.model,
          provider: record.provider,
          tokens: record.tokens,
        }
      : null
    return { inference, parts: stepParts, stepIndex: i }
  })
}
