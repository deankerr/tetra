import { useActiveRequest } from '@/lib/core/data/requests'

/** Whether the session has an active (pending/streaming) request. */
export const useIsStreaming = (sessionId: string): boolean => useActiveRequest(sessionId) !== null
