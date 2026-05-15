import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tetra/ui/components/ui/table'

import { useRequest, useSessionRequestIds } from '@/runtime/hooks'
import type { Request } from '@/runtime/hooks'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTokens(usage: unknown): string {
  if (!isRecord(usage)) {
    return '—'
  }
  const { total } = usage
  if (!isRecord(total)) {
    return '—'
  }
  const { usage: u } = total
  if (!isRecord(u)) {
    return '—'
  }
  const { promptTokens, completionTokens } = u
  if (typeof promptTokens !== 'number' && typeof completionTokens !== 'number') {
    return '—'
  }
  const p = typeof promptTokens === 'number' ? promptTokens : 0
  const c = typeof completionTokens === 'number' ? completionTokens : 0
  return `${p} / ${c}`
}

function formatCost(usage: unknown): string {
  if (!isRecord(usage)) {
    return '—'
  }
  const { total } = usage
  if (!isRecord(total)) {
    return '—'
  }
  const { cost } = total
  if (typeof cost !== 'number' || cost === 0) {
    return '—'
  }
  return `$${cost.toFixed(6)}`
}

function statusClass(status: string) {
  if (status === 'complete') {
    return 'text-green-500'
  }
  if (status === 'error') {
    return 'text-red-500'
  }
  if (status === 'streaming') {
    return 'text-blue-500'
  }
  return 'text-muted-foreground'
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
  return (
    <TableRow>
      <TableCell className="text-muted-foreground font-mono">
        {formatTime(request.createdAt)}
      </TableCell>
      <TableCell className={statusClass(request.status)}>{request.status}</TableCell>
      <TableCell className="max-w-48 truncate font-mono">{request.config.modelId}</TableCell>
      <TableCell className="font-mono">{formatTokens(request.usage)}</TableCell>
      <TableCell className="font-mono">{formatCost(request.usage)}</TableCell>
      <TableCell className="max-w-64 truncate text-red-400">
        {request.errorMessage || null}
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
