import { DEFAULT_REQUEST_CONFIG, sessionConfigRowToRequestConfig } from '@tetra/core'
import type { Rows } from '@tetra/core'

import { typedTinybase } from '@/tinybase'

export const useMessage = (id: string): Rows.Message | null => {
  const message = typedTinybase.useEntity('messages', id)
  if (id === '' || message === null) {
    return null
  }
  return message
}

export const useSessionRequestIds = (sessionId: string) =>
  typedTinybase.useSliceRowIds('requestsBySession', sessionId)

export const useRequest = (id: string): Rows.Request | null => {
  const request = typedTinybase.useEntity('requests', id)
  if (id === '' || request === null) {
    return null
  }
  return request
}

export const useSessionConfig = (id: string) => {
  const row = typedTinybase.useRow('sessionConfigs', id)

  if (row === null || id === '') {
    return DEFAULT_REQUEST_CONFIG
  }

  return sessionConfigRowToRequestConfig(row)
}
