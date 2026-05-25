import type { StepRecord, UsageSummary } from '@tetra/store-schema'

export function combineUsageSummaries(summaries: UsageSummary[]): UsageSummary {
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

  for (const summary of summaries) {
    cacheReadTokens += summary.cacheReadTokens ?? 0
    cacheWriteTokens += summary.cacheWriteTokens ?? 0
    inputTokens += summary.inputTokens ?? 0
    outputTokens += summary.outputTokens ?? 0
    reasoningTokens += summary.reasoningTokens ?? 0
    totalTokens += summary.totalTokens ?? 0
    if (summary.costInput !== undefined) {
      costInput += summary.costInput
      hasCostInput = true
    }
    if (summary.costOutput !== undefined) {
      costOutput += summary.costOutput
      hasCostOutput = true
    }
    if (summary.costTotal !== undefined) {
      costTotal += summary.costTotal
      hasCostTotal = true
    }
  }

  return compactUsageSummary({
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

export function deriveUsageSummary(steps: StepRecord[]): UsageSummary {
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

  for (const { cost, tokens } of steps) {
    cacheReadTokens += tokens.inputCacheRead ?? 0
    cacheWriteTokens += tokens.inputCacheWrite ?? 0
    inputTokens += tokens.inputTotal
    outputTokens += tokens.outputTotal
    reasoningTokens += tokens.outputReasoning ?? 0
    totalTokens += tokens.total
    if (cost.inputTotal !== undefined) {
      costInput += cost.inputTotal
      hasCostInput = true
    }
    if (cost.outputTotal !== undefined) {
      costOutput += cost.outputTotal
      hasCostOutput = true
    }
    if (cost.total !== undefined) {
      costTotal += cost.total
      hasCostTotal = true
    }
  }

  return compactUsageSummary({
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

function compactUsageSummary(summary: UsageSummary): UsageSummary {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined && value !== 0),
  ) as UsageSummary
}
