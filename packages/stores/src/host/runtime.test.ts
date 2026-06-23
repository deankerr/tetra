import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import { startCliStoreHost } from '../cli.ts'
import { startWebStoreHost } from '../web.ts'
import { createWorkerStoreRuntime } from '../worker.ts'
import type { RuntimePersister, RuntimeSynchronizer } from './runtime.ts'

function createLoggedPersister(id: string, log: string[]): RuntimePersister {
  return {
    async destroy() {
      log.push(`${id}:destroy`)
      await Promise.resolve()
    },
    getStore() {
      return { id }
    },
    async load() {
      log.push(`${id}:load`)
      await Promise.resolve()
    },
    async save() {
      log.push(`${id}:save`)
      await Promise.resolve()
    },
    async startAutoLoad() {
      log.push(`${id}:startAutoLoad`)
      await Promise.resolve()
    },
    async startAutoSave() {
      log.push(`${id}:startAutoSave`)
      await Promise.resolve()
    },
  }
}

function createLoggedSynchronizer(id: string, log: string[]): RuntimeSynchronizer {
  return {
    async destroy() {
      log.push(`${id}:destroy`)
      await Promise.resolve()
    },
    async startSync() {
      log.push(`${id}:startSync`)
      await Promise.resolve()
    },
  }
}

function expectLog(log: string[], expectedEntries: readonly string[]): void {
  for (const entry of expectedEntries) {
    expect(log).toContain(entry)
  }
}

describe('store host runtimes', () => {
  test('starts the web sync host with a local catalog persister and library synchronizer', async () => {
    const log: string[] = []
    const runtime = await startWebStoreHost('sync', {
      createIndexedDbPersister(instance) {
        return createLoggedPersister(instance.definition.persisterId, log)
      },
      createWebSocket(url) {
        return { url }
      },
      createWsSynchronizer(instance, webSocket) {
        expect(instance.id).toBe('library')
        expect(webSocket).toEqual({ url: 'ws://test/tetra' })
        return createLoggedSynchronizer(instance.definition.synchronizerId, log)
      },
      syncUrl: 'ws://test/tetra',
    })

    expect(runtime.host.library.isMergeable).toBe(true)
    expect(Object.keys(runtime.providerProps.storesById).toSorted()).toEqual([
      'catalog',
      'library',
      'web',
    ])
    expect(Object.keys(runtime.persistersById)).toEqual(['catalogPersister'])
    expect(Object.keys(runtime.synchronizersById)).toEqual(['librarySynchronizer'])
    expectLog(log, [
      'catalogPersister:startAutoLoad',
      'catalogPersister:startAutoSave',
      'librarySynchronizer:startSync',
    ])

    await runtime.close()
    await runtime.close()

    expectLog(log, [
      'catalogPersister:destroy',
      'catalogPersister:save',
      'librarySynchronizer:destroy',
    ])
    expect(log.filter((entry) => entry === 'librarySynchronizer:destroy')).toHaveLength(1)
  })

  test('starts the web persist host with IndexedDB persisters only', async () => {
    const log: string[] = []
    const runtime = await startWebStoreHost('persist', {
      createIndexedDbPersister(instance, databaseName) {
        log.push(`${instance.id}:database:${databaseName}`)
        return createLoggedPersister(instance.definition.persisterId, log)
      },
      syncUrl: 'ws://unused/tetra',
    })

    expect(runtime.host.library.isMergeable).toBe(false)
    expect(Object.keys(runtime.persistersById).toSorted()).toEqual([
      'catalogPersister',
      'libraryPersister',
    ])
    expect(Object.keys(runtime.synchronizersById)).toEqual([])
    expectLog(log, [
      'catalog:database:tetra-catalog',
      'library:database:tetra-library',
      'catalogPersister:startAutoLoad',
      'libraryPersister:startAutoSave',
    ])

    await runtime.close()
  })

  test('starts the CLI local host with real SQLite persisters', async () => {
    const runtime = await startCliStoreHost('local', {
      createDatabase() {
        return new Database(':memory:')
      },
      syncUrl: 'ws://unused/tetra',
    })

    expect(runtime.host.library.isMergeable).toBe(false)
    expect(Object.keys(runtime.persistersById).toSorted()).toEqual([
      'catalogPersister',
      'cliPersister',
      'libraryPersister',
    ])
    expect(Object.keys(runtime.synchronizersById)).toEqual([])

    runtime.host.cli.typedStore.values.activeSessionId.set('sess_1')
    expect(runtime.host.cli.typedStore.values.activeSessionId.get()).toBe('sess_1')

    await runtime.close()
    await runtime.close()
  })

  test('starts the CLI sync host with a library synchronizer', async () => {
    const log: string[] = []
    const runtime = await startCliStoreHost('sync', {
      createDatabase() {
        return {
          close() {
            log.push('database:close')
          },
        }
      },
      createSqlitePersister(instance) {
        return createLoggedPersister(instance.definition.persisterId, log)
      },
      createWebSocket(url) {
        return { url }
      },
      createWsSynchronizer(instance, webSocket) {
        expect(instance.id).toBe('library')
        expect(instance.isMergeable).toBe(true)
        expect(webSocket).toEqual({ url: 'ws://test/tetra' })
        return createLoggedSynchronizer(instance.definition.synchronizerId, log)
      },
      syncUrl: 'ws://test/tetra',
    })

    expect(Object.keys(runtime.persistersById).toSorted()).toEqual([
      'catalogPersister',
      'cliPersister',
      'libraryPersister',
    ])
    expect(Object.keys(runtime.synchronizersById)).toEqual(['librarySynchronizer'])
    expectLog(log, [
      'catalogPersister:load',
      'cliPersister:load',
      'libraryPersister:load',
      'librarySynchronizer:startSync',
    ])

    await runtime.close()

    expectLog(log, [
      'catalogPersister:destroy',
      'cliPersister:save',
      'database:close',
      'libraryPersister:destroy',
      'librarySynchronizer:destroy',
    ])
  })

  test('creates the Worker library host and Durable Object persister boundary', async () => {
    const runtime = await createWorkerStoreRuntime({
      sqlStorage: {
        exec() {
          return {
            toArray() {
              return []
            },
          }
        },
      },
    })

    expect(runtime.host.library.isMergeable).toBe(true)
    expect(Object.keys(runtime.providerProps.storesById)).toEqual(['library'])
    expect(Object.keys(runtime.persistersById)).toEqual(['libraryPersister'])
    expect(
      Object.is(runtime.persistersById.libraryPersister.getStore(), runtime.host.library.rawStore),
    ).toBe(true)

    await runtime.close()
  })
})
