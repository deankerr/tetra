import { summarizeSteps } from '@tetra/core'
import type { Rows } from '@tetra/store-schema'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tetra/ui/components/ui/table'
import { useMemo } from 'react'

import { typedTinybase } from '@/lib/tinybase'

import { useRunSteps } from './usage-hooks'

type Run = Rows['runs']

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatModel(config: unknown): string {
  if (typeof config !== 'object' || config === null || !('modelId' in config)) {
    return '—'
  }
  return typeof config.modelId === 'string' ? config.modelId : '—'
}

function formatTokens(input: number, output: number): string {
  if (input === 0 && output === 0) {
    return '—'
  }
  return `${input.toLocaleString()} / ${output.toLocaleString()}`
}

function formatCost(cost: number | null): string {
  if (cost === null) {
    return '—'
  }
  return `$${cost.toFixed(6)}`
}

function statusClass(status: string) {
  if (status === 'completed') {
    return 'text-green-500'
  }
  if (status === 'error') {
    return 'text-red-500'
  }
  if (status === 'streaming') {
    return 'text-blue-500'
  }
  if (status === 'preparing') {
    return 'text-amber-500'
  }
  return 'text-muted-foreground'
}

function useRunAccountingSummary(runId: string) {
  const steps = useRunSteps(runId)

  return useMemo(() => {
    const usage = summarizeSteps(steps)
    return {
      cost: usage.costTotal ?? null,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    }
  }, [steps])
}

// Split out so each row subscribes independently to its run row.
function RunRowById({ runId }: { runId: string }) {
  const run = typedTinybase.useEntity('runs', runId)
  if (!run) {
    return null
  }
  return <RunRow run={run} />
}

function RunRow({ run }: { run: Run }) {
  const summary = useRunAccountingSummary(run.id)

  return (
    <TableRow>
      <TableCell className="text-muted-foreground font-mono">{formatTime(run.createdAt)}</TableCell>
      <TableCell className={statusClass(run.status)}>{run.status}</TableCell>
      <TableCell className="max-w-48 truncate font-mono">{formatModel(run.config)}</TableCell>
      <TableCell className="font-mono">
        {formatTokens(summary.inputTokens, summary.outputTokens)}
      </TableCell>
      <TableCell className="font-mono">{formatCost(summary.cost)}</TableCell>
      <TableCell className="max-w-64 truncate text-red-400">{run.errorMessage ?? null}</TableCell>
    </TableRow>
  )
}

export function RunsTable({ sessionId }: { sessionId: string }) {
  const runIds = typedTinybase.useSliceRowIds('runsBySessionNewestFirst', sessionId)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Tokens (in / out)</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runIds.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No runs yet.
              </TableCell>
            </TableRow>
          ) : (
            runIds.map((id) => <RunRowById key={id} runId={id} />)
          )}
        </TableBody>
      </Table>
    </div>
  )
}
