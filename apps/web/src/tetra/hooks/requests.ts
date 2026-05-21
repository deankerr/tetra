import { RequestConfig } from '@tetra/core'
import type { RequestStatus, Rows, StepRecord } from '@tetra/core'

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
  const hasRow = tinybase.useHasRow('requests', id)
  const row = tinybase.useRow('requests', id)
  if (!hasRow || id === '') {
    return null
  }

  return {
    assistantMessageId: row.assistantMessageId,
    config: RequestConfig.parse(row.config),
    createdAt: row.createdAt,
    errorMessage: row.errorMessage,
    id,
    sessionId: row.sessionId,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    status: row.status as RequestStatus,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- StepRecord[] stored verbatim in TinyBase array cell.
    steps: row.steps as StepRecord[],
    terminalAt: row.terminalAt,
  }
}

export const useRequestForMessage = (messageId: string): Rows.Request | null => {
  const ids = tinybase.useSliceRowIds('requestByAssistantMessage', messageId)
  return useRequest(ids.at(-1) ?? '')
}
