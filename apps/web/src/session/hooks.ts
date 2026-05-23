import type { Rows } from '@tetra/core'

import { typedTinybase } from '@/tetra/tinybase'

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
