import { generateId, parseRequestConfig } from '@tetra/store'
import type { RequestConfig, TetraStore } from '@tetra/store'

import { executeRequest } from './execution.ts'

export const createRequests = (context: {
  controllers: Map<string, AbortController>
  indexes: TetraStore['indexes']
  store: TetraStore['store']
}) => {
  const { store } = context

  return {
    execute(args: { assistantMessageId: string; config?: RequestConfig }) {
      const { assistantMessageId } = args
      const { sessionId } = store.getRow('messages', assistantMessageId)
      const session = store.getRow('sessions', sessionId)
      const config = args.config ?? parseRequestConfig(session.config)

      const requestId = generateId.request()
      store.setRow('requests', requestId, {
        assistantMessageId,
        config,
        createdAt: Date.now(),
        errorMessage: '',
        sessionId,
        status: 'streaming',
      })

      console.log('[runtime:requests.execute]', { assistantMessageId, requestId, sessionId })

      void executeRequest(context, { assistantMessageId, config, requestId, sessionId })

      return { requestId }
    },
  }
}
