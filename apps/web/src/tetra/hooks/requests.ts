import type { Rows } from '@tetra/core'

import { typedTinybase } from '@/tetra/tinybase'

const activeStatuses = new Set(['preparing', 'streaming'])

export const useSessionRequestIds = (sessionId: string) =>
  typedTinybase.useSliceRowIds('requestsBySession', sessionId)

export const useActiveRequest = (sessionId: string): Rows.Request | null => {
  const ids = typedTinybase.useSliceRowIds('requestsBySession', sessionId)
  const latestId = ids[0] ?? ''
  const request = useRequest(latestId)

  if (request === null || !activeStatuses.has(request.status)) {
    return null
  }

  return request
}

export const useRequest = (id: string): Rows.Request | null => {
  const request = typedTinybase.useEntity('requests', id)
  if (request === null || id === '') {
    return null
  }

  return request
}

export const useRequestForMessage = (messageId: string): Rows.Request | null => {
  const ids = typedTinybase.useSliceRowIds('requestByAssistantMessage', messageId)
  return useRequest(ids.at(-1) ?? '')
}
