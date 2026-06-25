import type { RawIndexesFor } from '@tetra/tinybase-schema/runtime'

import type { libraryStoreSchema } from './schema.ts'

export const libraryIndexIds = [
  'messagesBySession',
  'runsByTargetMessageNewestFirst',
  'runsBySessionNewestFirst',
  'stepsByMessage',
  'stepsByRun',
  'stepsBySession',
] as const

export function applyLibraryIndexes(rawIndexes: RawIndexesFor<typeof libraryStoreSchema>): void {
  rawIndexes
    .setIndexDefinition('messagesBySession', 'messages', 'sessionId', 'createdAt')
    .setIndexDefinition(
      'runsByTargetMessageNewestFirst',
      'runs',
      'targetMessageId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition(
      'runsBySessionNewestFirst',
      'runs',
      'sessionId',
      'createdAt',
      undefined,
      (a, b) => Number(b) - Number(a),
    )
    .setIndexDefinition('stepsByMessage', 'steps', 'messageId', 'createdAt')
    .setIndexDefinition('stepsByRun', 'steps', 'runId', 'stepNumber')
    .setIndexDefinition('stepsBySession', 'steps', 'sessionId', 'createdAt')
}
