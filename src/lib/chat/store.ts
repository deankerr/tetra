import { createIndexes } from 'tinybase/indexes/with-schemas'
import type { Indexes } from 'tinybase/indexes/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import { createStore } from 'tinybase/with-schemas'
import type { Store } from 'tinybase/with-schemas'

import {
  configTablesSchema,
  configValuesSchema,
  runtimeTablesSchema,
  runtimeValuesSchema,
} from '@/lib/chat/schemas'
import type { ConfigSchemas, RuntimeSchemas } from '@/lib/chat/schemas'

const CONFIG_DB_NAME = 'tinybasechat-config'
const RUNTIME_DB_NAME = 'tinybasechat-runtime'

export type ConfigStore = Store<ConfigSchemas>
export type RuntimeStore = Store<RuntimeSchemas>
export type RuntimeIndexes = Indexes<RuntimeSchemas>

export const createConfigStore = (): ConfigStore =>
  createStore().setSchema(configTablesSchema, configValuesSchema)

export const createRuntimeStore = (): RuntimeStore =>
  createStore().setSchema(runtimeTablesSchema, runtimeValuesSchema)

export const createConfigPersister = (configStore: ConfigStore) =>
  createIndexedDbPersister(configStore, CONFIG_DB_NAME, 1, console.error)

export const createRuntimePersister = (runtimeStore: RuntimeStore) =>
  createIndexedDbPersister(runtimeStore, RUNTIME_DB_NAME, 1, console.error)

export const createRuntimeIndexes = (runtimeStore: RuntimeStore): RuntimeIndexes =>
  createIndexes(runtimeStore)
    .setIndexDefinition(
      'sessionsByRecency',
      'sessions',
      () => 'all',
      (_, rowId) => runtimeStore.getCell('sessions', rowId, 'updatedAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )
    .setIndexDefinition(
      'messagesBySession',
      'messages',
      'sessionId',
      'seq',
      undefined,
      (left, right) => Number(left) - Number(right),
    )
    .setIndexDefinition(
      'commandsByCreatedAt',
      'commands',
      () => 'all',
      (_, rowId) => runtimeStore.getCell('commands', rowId, 'createdAt'),
      undefined,
      (left, right) => Number(right) - Number(left),
    )
