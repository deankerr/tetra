import { StepRecord } from '@tetra/core'
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from '@tetra/ui/components/ai-elements/context'
import type { LanguageModelUsage } from 'ai'
import { useEffect, useMemo, useReducer } from 'react'

import { useSessionRequestIds } from '@/tetra/hooks/requests'
import { useSessionConfig } from '@/tetra/hooks/sessions'
import { tinybase } from '@/tetra/tinybase'

interface SessionContextSummary {
  cost: {
    completion: number | null
    prompt: number | null
    total: number | null
  }
  maxTokens: number
  modelId: string
  modelName: string
  providerName: string
  usage: LanguageModelUsage
  usedTokens: number
}

export function SessionUsageMeter({ sessionId }: { sessionId: string }) {
  const summary = useSessionContextSummary(sessionId)

  if (!summary) {
    return null
  }

  return (
    <Context
      maxTokens={summary.maxTokens}
      modelId={summary.modelId}
      usage={summary.usage}
      usedTokens={summary.usedTokens}
    >
      <ContextTrigger className="h-7 gap-1.5 px-2 text-xs" />
      <ContextContent align="end">
        <ContextContentHeader />
        <ContextContentBody className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Model</span>
            <span className="text-right">
              {summary.providerName} / {summary.modelName}
            </span>
          </div>
          <UsageRow cost={summary.cost.prompt} label="Input" tokens={summary.usage.inputTokens} />
          <UsageRow label="Cache read" tokens={summary.usage.inputTokenDetails.cacheReadTokens} />
          <UsageRow label="Cache write" tokens={summary.usage.inputTokenDetails.cacheWriteTokens} />
          <UsageRow
            cost={summary.cost.completion}
            label="Output"
            tokens={summary.usage.outputTokens}
          />
          <UsageRow
            label="Reasoning"
            note="included in output"
            tokens={summary.usage.outputTokenDetails.reasoningTokens}
          />
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-muted-foreground">Recorded cost</span>
          <span>{formatCurrency(summary.cost.total)}</span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  )
}

function useSessionContextSummary(sessionId: string): SessionContextSummary | null {
  const config = useSessionConfig(sessionId)
  const hasLanguageModel = tinybase.useHasRow('languageModels', config.modelId)
  const languageModel = tinybase.useRow('languageModels', config.modelId)
  const requestIds = useSessionRequestIds(sessionId)
  const steps = useSessionStepRecords(requestIds)

  return useMemo(() => {
    if (!hasLanguageModel || languageModel.contextLength <= 0 || steps.length === 0) {
      return null
    }

    let cacheRead = 0
    let cacheWrite = 0
    let completionCost = 0
    let hasCompletionCost = false
    let hasPromptCost = false
    let hasTotalCost = false
    let input = 0
    let output = 0
    let promptCost = 0
    let reasoning = 0
    let total = 0
    let totalCost = 0

    for (const { cost, tokens } of steps) {
      cacheRead += tokens.cacheRead
      cacheWrite += tokens.cacheWrite
      input += tokens.input
      output += tokens.output
      reasoning += tokens.reasoning
      total += tokens.total
      if (cost.completion !== null) {
        completionCost += cost.completion
        hasCompletionCost = true
      }
      if (cost.prompt !== null) {
        promptCost += cost.prompt
        hasPromptCost = true
      }
      if (cost.total !== null) {
        totalCost += cost.total
        hasTotalCost = true
      }
    }

    return {
      cost: {
        completion: hasCompletionCost ? completionCost : null,
        prompt: hasPromptCost ? promptCost : null,
        total: hasTotalCost ? totalCost : null,
      },
      maxTokens: languageModel.contextLength,
      modelId: config.modelId,
      modelName: languageModel.name,
      providerName: languageModel.providerName,
      usage: {
        cachedInputTokens: cacheRead,
        inputTokenDetails: {
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          noCacheTokens: Math.max(0, input - cacheRead),
        },
        inputTokens: input,
        outputTokenDetails: {
          reasoningTokens: reasoning,
          textTokens: Math.max(0, output - reasoning),
        },
        outputTokens: output,
        reasoningTokens: reasoning,
        totalTokens: total,
      },
      usedTokens: input,
    }
  }, [config.modelId, hasLanguageModel, languageModel, steps])
}

function useSessionStepRecords(requestIds: string[]): StepRecord[] {
  const store = tinybase.useStore()
  const [version, bumpVersion] = useReducer((value: number) => value + 1, 0)

  useEffect(() => {
    const listenerIds =
      store === undefined
        ? []
        : requestIds.map((requestId) =>
            store.addCellListener('requests', requestId, 'steps', bumpVersion),
          )

    return () => {
      for (const listenerId of listenerIds) {
        store?.delListener(listenerId)
      }
    }
  }, [requestIds, store])

  return useMemo(() => {
    void version

    if (!store) {
      return []
    }

    return requestIds.flatMap((requestId) =>
      StepRecord.array().parse(store.getCell('requests', requestId, 'steps')),
    )
  }, [requestIds, store, version])
}

function UsageRow({
  cost,
  label,
  note,
  tokens,
}: {
  cost?: number | null
  label: string
  note?: string
  tokens: number | undefined
}) {
  if (tokens === undefined || tokens === 0) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        {formatTokens(tokens)}
        {cost !== undefined && (
          <span className="text-muted-foreground ml-2">{formatCurrency(cost)}</span>
        )}
        {note !== undefined && <span className="text-muted-foreground ml-2">{note}</span>}
      </span>
    </div>
  )
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
  }).format(value)
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}
