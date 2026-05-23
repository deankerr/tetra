import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from '@tetra/ui/components/ai-elements/context'
import type { LanguageModelUsage } from 'ai'
import { useMemo } from 'react'

import { useSessionConfig } from '@/tetra/hooks/sessions'
import { useSessionMessages } from '@/tetra/hooks/transcripts'
import { typedTinybase } from '@/tetra/tinybase'

interface SessionContextSummary {
  cost: {
    input: number | null
    output: number | null
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
          <UsageRow cost={summary.cost.input} label="Input" tokens={summary.usage.inputTokens} />
          <UsageRow label="Cache read" tokens={summary.usage.inputTokenDetails.cacheReadTokens} />
          <UsageRow label="Cache write" tokens={summary.usage.inputTokenDetails.cacheWriteTokens} />
          <UsageRow cost={summary.cost.output} label="Output" tokens={summary.usage.outputTokens} />
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
  const hasLanguageModel = typedTinybase.useHasRow('languageModels', config.modelId)
  const languageModel = typedTinybase.useRow('languageModels', config.modelId)
  const messages = useSessionMessages(sessionId)
  const steps = useMemo(() => messages.flatMap((message) => message.steps), [messages])

  return useMemo(() => {
    if (
      !hasLanguageModel ||
      languageModel === null ||
      languageModel.contextLength <= 0 ||
      steps.length === 0
    ) {
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
      cacheRead += tokens.inputCacheRead ?? 0
      cacheWrite += tokens.inputCacheWrite ?? 0
      input += tokens.inputTotal
      output += tokens.outputTotal
      reasoning += tokens.outputReasoning ?? 0
      total += tokens.total
      if (cost.outputTotal !== undefined) {
        completionCost += cost.outputTotal
        hasCompletionCost = true
      }
      if (cost.inputTotal !== undefined) {
        promptCost += cost.inputTotal
        hasPromptCost = true
      }
      if (cost.total !== undefined) {
        totalCost += cost.total
        hasTotalCost = true
      }
    }

    return {
      cost: {
        input: hasPromptCost ? promptCost : null,
        output: hasCompletionCost ? completionCost : null,
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
