import * as UiReact from 'tinybase/ui-react/with-schemas'

import {
  isRecord,
  toAgentRecord,
  toCommandRecord,
  toMessageRecord,
  toSessionRecord,
} from '@/lib/chat/repository'
import { CONFIG_STORE_ID, RUNTIME_INDEXES_ID, RUNTIME_STORE_ID } from '@/lib/chat/schemas'
import type {
  ConfigSchemas,
  RuntimeSchemas,
  configTablesSchema,
  runtimeTablesSchema,
  runtimeValuesSchema,
} from '@/lib/chat/schemas'

type ConfigTableId = Extract<keyof typeof configTablesSchema, string>
type RuntimeTableId = Extract<keyof typeof runtimeTablesSchema, string>
type ConfigCellId<TableId extends ConfigTableId> = Extract<
  keyof (typeof configTablesSchema)[TableId],
  string
>
type RuntimeCellId<TableId extends RuntimeTableId> = Extract<
  keyof (typeof runtimeTablesSchema)[TableId],
  string
>
type RuntimeValueId = Extract<keyof typeof runtimeValuesSchema, string>
type RuntimeIndexId = 'commandsByCreatedAt' | 'messagesBySession' | 'sessionsByRecency'

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- TinyBase documents module-level WithSchemas casts as the way to get schema-aware ui-react hooks.
const configUiReact = UiReact as unknown as UiReact.WithSchemas<ConfigSchemas>
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- TinyBase documents module-level WithSchemas casts as the way to get schema-aware ui-react hooks.
const runtimeUiReact = UiReact as unknown as UiReact.WithSchemas<RuntimeSchemas>

const useConfigHasRow = <TableId extends ConfigTableId>(tableId: TableId, rowId: string) =>
  configUiReact.useHasRow(tableId, rowId, CONFIG_STORE_ID)

const useConfigCell = <TableId extends ConfigTableId, CellId extends ConfigCellId<TableId>>(
  tableId: TableId,
  rowId: string,
  cellId: CellId,
) => configUiReact.useCell(tableId, rowId, cellId, CONFIG_STORE_ID)

const useRuntimeHasRow = <TableId extends RuntimeTableId>(tableId: TableId, rowId: string) =>
  runtimeUiReact.useHasRow(tableId, rowId, RUNTIME_STORE_ID)

const useRuntimeRow = <TableId extends RuntimeTableId>(tableId: TableId, rowId: string) =>
  runtimeUiReact.useRow(tableId, rowId, RUNTIME_STORE_ID)

const useRuntimeCell = <TableId extends RuntimeTableId, CellId extends RuntimeCellId<TableId>>(
  tableId: TableId,
  rowId: string,
  cellId: CellId,
) => runtimeUiReact.useCell(tableId, rowId, cellId, RUNTIME_STORE_ID)

const useRuntimeValue = <ValueId extends RuntimeValueId>(valueId: ValueId) =>
  runtimeUiReact.useValue(valueId, RUNTIME_STORE_ID)

const useRuntimeSliceRowIds = (indexId: RuntimeIndexId, sliceId: string) =>
  runtimeUiReact.useSliceRowIds(indexId, sliceId, RUNTIME_INDEXES_ID)

export const useActiveSessionId = () => useRuntimeValue('activeSessionId') ?? ''

export const useSessionIds = () => useRuntimeSliceRowIds('sessionsByRecency', 'all')

export const useSessionMessageIds = (sessionId: string) =>
  useRuntimeSliceRowIds('messagesBySession', sessionId)

export const useRecentCommandIds = (limit: number) =>
  useRuntimeSliceRowIds('commandsByCreatedAt', 'all').slice(0, limit)

export const useSessionRecord = (sessionId: string) => {
  const hasRow = useRuntimeHasRow('sessions', sessionId)
  const row = useRuntimeRow('sessions', sessionId)
  return hasRow ? toSessionRecord(row) : null
}

export const useCommandRecord = (commandId: string) => {
  const hasRow = useRuntimeHasRow('commands', commandId)

  const claimedAt = useRuntimeCell('commands', commandId, 'claimedAt')
  const claimedBy = useRuntimeCell('commands', commandId, 'claimedBy')
  const completedAt = useRuntimeCell('commands', commandId, 'completedAt')
  const createdAt = useRuntimeCell('commands', commandId, 'createdAt')
  const errorMessage = useRuntimeCell('commands', commandId, 'errorMessage')
  const payload = useRuntimeCell('commands', commandId, 'payload')
  const sessionId = useRuntimeCell('commands', commandId, 'sessionId')
  const status = useRuntimeCell('commands', commandId, 'status')
  const type = useRuntimeCell('commands', commandId, 'type')
  const updatedAt = useRuntimeCell('commands', commandId, 'updatedAt')

  if (!hasRow) {
    return null
  }

  return toCommandRecord({
    claimedAt: Number(claimedAt),
    claimedBy: String(claimedBy ?? ''),
    completedAt: Number(completedAt),
    createdAt: Number(createdAt),
    errorMessage: String(errorMessage ?? ''),
    payload: isRecord(payload) ? payload : {},
    sessionId: String(sessionId ?? ''),
    status: String(status ?? ''),
    type: String(type ?? ''),
    updatedAt: Number(updatedAt),
  })
}

export const useMessageRecord = (messageId: string) => {
  const hasRow = useRuntimeHasRow('messages', messageId)
  const createdAt = useRuntimeCell('messages', messageId, 'createdAt')
  const message = useRuntimeCell('messages', messageId, 'message')
  const role = useRuntimeCell('messages', messageId, 'role')
  const seq = useRuntimeCell('messages', messageId, 'seq')
  const sessionId = useRuntimeCell('messages', messageId, 'sessionId')
  const updatedAt = useRuntimeCell('messages', messageId, 'updatedAt')

  if (!hasRow) {
    return null
  }

  return toMessageRecord({
    createdAt: Number(createdAt),
    message: isRecord(message) ? message : {},
    role: String(role ?? ''),
    seq: Number(seq),
    sessionId: String(sessionId ?? ''),
    updatedAt: Number(updatedAt),
  })
}

export const useAgentRecord = (agentId: string) => {
  const hasRow = useConfigHasRow('agents', agentId)
  const maxTokens = useConfigCell('agents', agentId, 'maxTokens')
  const model = useConfigCell('agents', agentId, 'model')
  const name = useConfigCell('agents', agentId, 'name')
  const provider = useConfigCell('agents', agentId, 'provider')
  const systemPrompt = useConfigCell('agents', agentId, 'systemPrompt')
  const temperature = useConfigCell('agents', agentId, 'temperature')

  if (!hasRow) {
    return null
  }

  return toAgentRecord({
    maxTokens: Number(maxTokens),
    model: String(model ?? ''),
    name: String(name ?? ''),
    provider: String(provider ?? ''),
    systemPrompt: String(systemPrompt ?? ''),
    temperature: Number(temperature),
  })
}
