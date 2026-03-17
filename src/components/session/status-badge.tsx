import { Badge } from '@/components/ui/badge'
import type { RequestStatus } from '@/lib/core/data/requests'

export function StatusBadge({ status }: { status: RequestStatus | null }) {
  if (status !== 'pending' && status !== 'streaming') {
    return null
  }
  return <Badge variant="secondary">streaming</Badge>
}
