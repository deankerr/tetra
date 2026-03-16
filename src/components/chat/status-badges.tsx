import { Badge } from '@/components/ui/badge'
import type { useCommandRecord, useSessionRecord } from '@/lib/chat/react'

export const getStatusBadgeVariant = (
  status: NonNullable<ReturnType<typeof useSessionRecord>>['status'],
) => {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'streaming') {
    return 'secondary'
  }
  return 'outline'
}

const getCommandBadgeVariant = (
  status: NonNullable<ReturnType<typeof useCommandRecord>>['status'],
) => {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'processing') {
    return 'secondary'
  }
  return 'outline'
}

export function StatusBadge({
  status,
}: {
  status: NonNullable<ReturnType<typeof useSessionRecord>>['status']
}) {
  return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
}

export function CommandStatusBadge({
  status,
}: {
  status: NonNullable<ReturnType<typeof useCommandRecord>>['status']
}) {
  return <Badge variant={getCommandBadgeVariant(status)}>{status}</Badge>
}
