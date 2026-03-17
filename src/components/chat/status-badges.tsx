import { Badge } from '@/components/ui/badge'
import type { RequestStatus } from '@/lib/core/data/requests'

const getStatusBadgeVariant = (status: RequestStatus) => {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'streaming' || status === 'pending') {
    return 'secondary'
  }
  return 'outline'
}

export function StatusBadge({ status }: { status: RequestStatus | null }) {
  // Don't show badge for completed or no request (idle)
  if (status === null || status === 'completed') {
    return null
  }
  return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
}
