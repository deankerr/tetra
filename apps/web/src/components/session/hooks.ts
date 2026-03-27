import { useActiveRequest } from '@/lib/runtime/hooks'

/** Whether the session has an active (pending/streaming) request. */
export const useIsStreaming = (sessionId: string): boolean => useActiveRequest(sessionId) !== null
