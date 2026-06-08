import { RunConfigSchema } from '@tetra/store-schema'
import type { Rows } from '@tetra/store-schema'

import { typedTinybase } from '@/lib/tinybase'

export type MessagePart = Rows['messages']['parts'][number]

type MessageRunStatus = Rows['runs']['status']

const streamingStatuses = new Set<MessageRunStatus>(['preparing', 'streaming'])

export function getRunModelId(run: Rows['runs']): string {
  return RunConfigSchema.parse(run.config).modelId
}

export function getRunErrorMessage(run: Rows['runs'] | null): string | null {
  if (run === null || run.errorMessage === '') {
    return null
  }

  return run.errorMessage
}

export function isMessageRunStreaming(run: Rows['runs'] | null): boolean {
  return run !== null && streamingStatuses.has(run.status)
}

export function useMessageRun(messageId: string): Rows['runs'] | null {
  const ids = typedTinybase.useSliceRowIds('runsByTargetMessageNewestFirst', messageId)

  return typedTinybase.useEntity('runs', ids[0] ?? '')
}
