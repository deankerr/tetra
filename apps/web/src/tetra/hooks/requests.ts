import type { Rows } from '@tetra/core-redesign'

import { useTetra } from '@/tetra/provider'
import { tinybase } from '@/tetra/tinybase'

const activeStatuses = new Set(['preparing', 'streaming'])

export const useSessionRequestIds = (sessionId: string) =>
  tinybase.useSliceRowIds('requestsBySession', sessionId)

export const useActiveRequest = (sessionId: string): Rows.Request | null => {
  const ids = tinybase.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const request = useRequest(latestId)

  if (request === null || !activeStatuses.has(request.status)) {
    return null
  }

  return request
}

export const useRequest = (id: string): Rows.Request | null => {
  const { accessors } = useTetra()
  const hasRow = tinybase.useHasRow('requests', id)
  tinybase.useRow('requests', id)
  if (!hasRow || id === '') {
    return null
  }

  return accessors.requests.get(id)
}

export const useRequestForMessage = (messageId: string): Rows.Request | null => {
  const ids = tinybase.useSliceRowIds('requestByAssistantMessage', messageId)
  return useRequest(ids[0] ?? '')
}
