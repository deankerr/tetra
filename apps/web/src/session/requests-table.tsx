import type { Rows } from '@tetra/core'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tetra/ui/components/ui/table'
import { useMemo } from 'react'

import { useRequest, useSessionRequestIds } from '@/tetra/hooks/requests'
import { useMessage } from '@/tetra/hooks/transcripts'

type Request = Rows.Request

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

// Aggregates token counts and cost from the request's assistant message.
// The message owns inference metadata, while the request owns lifecycle status.
function useRequestAccountingSummary(message: Rows.Message | null) {
  return useMemo(() => {
    let cost: number | null = null
    let inputTokens = 0
    let outputTokens = 0

    for (const { cost: stepCost, tokens } of message?.steps ?? []) {
      inputTokens += tokens.inputTotal
      outputTokens += tokens.outputTotal
      if (stepCost.total !== undefined) {
        cost = (cost ?? 0) + stepCost.total
      }
    }

    return { cost, inputTokens, outputTokens }
  }, [message?.steps])
}

// Split out so each row subscribes independently to its request row.
function RequestRowById({ requestId }: { requestId: string }) {
  const request = useRequest(requestId)
  if (!request) {
    return null
  }
  return <RequestRow request={request} />
}

function RequestRow({ request }: { request: Request }) {
  const message = useMessage(request.assistantMessageId)
  const summary = useRequestAccountingSummary(message)

  return (
    <TableRow>
      <TableCell className="text-muted-foreground font-mono">
        {formatTime(request.createdAt)}
      </TableCell>
      <TableCell className={statusClass(request.status)}>{request.status}</TableCell>
      <TableCell className="max-w-48 truncate font-mono">{formatModel(request.config)}</TableCell>
      <TableCell className="font-mono">
        {formatTokens(summary.inputTokens, summary.outputTokens)}
      </TableCell>
      <TableCell className="font-mono">{formatCost(summary.cost)}</TableCell>
      <TableCell className="max-w-64 truncate text-red-400">
        {request.errorMessage ?? null}
      </TableCell>
    </TableRow>
  )
}

export function RequestsTable({ sessionId }: { sessionId: string }) {
  const requestIds = useSessionRequestIds(sessionId)

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
          {requestIds.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No requests yet.
              </TableCell>
            </TableRow>
          ) : (
            requestIds.map((id) => <RequestRowById key={id} requestId={id} />)
          )}
        </TableBody>
      </Table>
    </div>
  )
}
