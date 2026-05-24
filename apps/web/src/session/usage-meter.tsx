import type { UsageSummary } from '@tetra/core'
import { Button } from '@tetra/ui/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@tetra/ui/components/ui/hover-card'
import { Progress } from '@tetra/ui/components/ui/progress'
import { useMemo } from 'react'

import { typedTinybase } from '@/tinybase'

interface SessionContextSummary {
  maxTokens: number
  modelLabel: string
  percentUsed: number | null
  usage: UsageSummary
  usedTokens: number
}

export function SessionUsageMeter({ sessionId }: { sessionId: string }) {
  const summary = useSessionContextSummary(sessionId)

  if (!summary) {
    return null
  }

  return (
    <HoverCard>
      <HoverCardTrigger>
        <Button className="h-7 gap-1.5 px-2 text-xs" type="button" variant="ghost">
          <span className="text-muted-foreground font-medium">
            {formatPercent(summary.percentUsed)}
          </span>
          <UsageIcon percentUsed={summary.percentUsed} />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="min-w-64 divide-y overflow-hidden p-0">
        <div className="w-full space-y-2 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>{formatPercent(summary.percentUsed)}</p>
            <p className="text-muted-foreground font-mono">
              {formatTokens(summary.usedTokens)} / {formatMaxTokens(summary.maxTokens)}
            </p>
          </div>
          <Progress className="bg-muted" value={formatProgressValue(summary.percentUsed)} />
        </div>
        <div className="w-full space-y-2 p-3">
          <UsageRow label="Model" value={summary.modelLabel} />
          <UsageRow
            cost={summary.usage.costInput}
            label="Input"
            tokens={summary.usage.inputTokens}
          />
          <UsageRow
            cost={summary.usage.costOutput}
            label="Output"
            tokens={summary.usage.outputTokens}
          />
          <UsageRow label="Cache read" tokens={summary.usage.cacheReadTokens} />
          <UsageRow label="Cache write" tokens={summary.usage.cacheWriteTokens} />
        </div>
        <div className="bg-secondary flex w-full items-center justify-between gap-3 p-3 text-xs">
          <span className="text-muted-foreground">Recorded cost</span>
          <span>{formatCurrency(summary.usage.costTotal)}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function useSessionContextSummary(sessionId: string): SessionContextSummary | null {
  const modelId = typedTinybase.useCell('sessionConfigs', sessionId, 'modelId') ?? ''
  const languageModel = typedTinybase.useRow('languageModels', modelId)
  const sessionSummary = typedTinybase.useRow('sessionSummaries', sessionId)

  return useMemo(() => {
    const usage = sessionSummary?.usage ?? {}
    if ((usage.totalTokens ?? 0) === 0) {
      return null
    }

    const input = usage.inputTokens ?? 0
    const maxTokens = languageModel?.contextLength ?? 0

    return {
      maxTokens,
      modelLabel:
        languageModel === null ? modelId : `${languageModel.providerName} / ${languageModel.name}`,
      percentUsed: maxTokens > 0 ? input / maxTokens : null,
      usage,
      usedTokens: input,
    }
  }, [languageModel, modelId, sessionSummary])
}

function UsageIcon({ percentUsed }: { percentUsed: number | null }) {
  const circumference = 2 * Math.PI * 10
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, percentUsed ?? 0)))

  return (
    <svg
      aria-label="Model context usage"
      height="20"
      role="img"
      style={{ color: 'currentcolor' }}
      viewBox="0 0 24 24"
      width="20"
    >
      <circle
        cx="12"
        cy="12"
        fill="none"
        opacity="0.25"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        fill="none"
        opacity={percentUsed === null ? '0' : '0.7'}
        r="10"
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="2"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    </svg>
  )
}

function UsageRow({
  cost,
  label,
  tokens,
  value,
}: {
  cost?: number | undefined
  label: string
  tokens?: number | undefined
  value?: string | undefined
}) {
  if (value === undefined && tokens === undefined && cost === undefined) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        {value ?? formatTokens(tokens ?? 0)}
        {cost !== undefined && (
          <span className="text-muted-foreground ml-2">{formatCurrency(cost)}</span>
        )}
      </span>
    </div>
  )
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value)
}

function formatProgressValue(value: number | null): number {
  if (value === null) {
    return 0
  }

  return Math.min(100, Math.max(0, value * 100))
}

function formatMaxTokens(value: number): string {
  if (value <= 0) {
    return 'unknown'
  }

  return formatTokens(value)
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
  }).format(value)
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}
