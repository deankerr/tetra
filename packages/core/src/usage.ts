import type { Rows } from '@tetra/store-schema'

type StepRecord = Rows['steps']

export interface UsageTotals {
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costInput?: number
  costOutput?: number
  costTotal?: number
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export function summarizeSteps(steps: StepRecord[]): UsageTotals {
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let costInput = 0
  let costOutput = 0
  let costTotal = 0
  let hasCostInput = false
  let hasCostOutput = false
  let hasCostTotal = false
  let inputTokens = 0
  let outputTokens = 0
  let reasoningTokens = 0
  let totalTokens = 0

  // Sum the stable fields Tetra currently renders; raw provider usage stays on each step.
  for (const step of steps) {
    cacheReadTokens += step.usage.input.cacheRead ?? 0
    cacheWriteTokens += step.usage.input.cacheWrite ?? 0
    inputTokens += step.usage.input.total ?? 0
    outputTokens += step.usage.output.total ?? 0
    reasoningTokens += step.usage.output.reasoning ?? 0
    totalTokens += step.usage.total ?? 0
    if (step.cost.input !== undefined) {
      costInput += step.cost.input
      hasCostInput = true
    }
    if (step.cost.output !== undefined) {
      costOutput += step.cost.output
      hasCostOutput = true
    }
    if (step.cost.total !== undefined) {
      costTotal += step.cost.total
      hasCostTotal = true
    }
  }

  return compactUsageTotals({
    cacheReadTokens,
    cacheWriteTokens,
    costInput: hasCostInput ? costInput : undefined,
    costOutput: hasCostOutput ? costOutput : undefined,
    costTotal: hasCostTotal ? costTotal : undefined,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  })
}

function compactUsageTotals(summary: UsageTotals): UsageTotals {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined && value !== 0),
  ) as UsageTotals
}
