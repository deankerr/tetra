import { useActiveRequest } from '@/lib/core/hooks'

/** Whether the session has an active (pending/streaming) request. */
export const useIsStreaming = (sessionId: string): boolean => useActiveRequest(sessionId) !== null
