import {
  createCliStoreHost,
  createTinyBaseProviderProps,
  createWebStoreHost,
  createWorkerStoreHost,
  describeLifecyclePlans,
  getCliLifecyclePlans,
  getWebLifecyclePlans,
  getWorkerLifecyclePlans,
  startWebStoreHost,
} from './index.ts'
import type { RuntimePersister, RuntimeSynchronizer } from './index.ts'

const SYNC_URL = 'ws://localhost:8787/tetra'

function summarizeHost(
  host: Record<
    string,
    {
      definition: {
        indexIds: readonly string[]
        policy: string
        schema: {
          tables: object
          values: object
        }
      }
      id: string
      isMergeable: boolean
    }
  >,
) {
  return Object.fromEntries(
    Object.values(host).map((instance) => [
      instance.id,
      {
        indexes: instance.definition.indexIds,
        isMergeable: instance.isMergeable,
        policy: instance.definition.policy,
        tables: Object.keys(instance.definition.schema.tables),
        values: Object.keys(instance.definition.schema.values),
      },
    ]),
  )
}

function createPrototypePersister(id: string, log: string[]): RuntimePersister {
  return {
    async destroy() {
      log.push(`${id}:destroy`)
      await Promise.resolve()
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

function createPrototypeSynchronizer(id: string, log: string[]): RuntimeSynchronizer {
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

async function main() {
  const webHost = createWebStoreHost('sync')
  const cliHost = createCliStoreHost('sync')
  const workerHost = createWorkerStoreHost()

  console.log('WEB STORE HOST')
  console.dir(summarizeHost(webHost), { depth: null })
  console.log(describeLifecyclePlans(getWebLifecyclePlans('sync', SYNC_URL)).join('\n'))
  console.log(Object.keys(createTinyBaseProviderProps(webHost).storesById))

  console.log('\nCLI STORE HOST')
  console.dir(summarizeHost(cliHost), { depth: null })
  console.log(describeLifecyclePlans(getCliLifecyclePlans('sync', SYNC_URL)).join('\n'))

  console.log('\nWORKER STORE HOST')
  console.dir(summarizeHost(workerHost), { depth: null })
  console.log(describeLifecyclePlans(getWorkerLifecyclePlans()).join('\n'))

  const runtimeLog: string[] = []
  const webRuntime = await startWebStoreHost('sync', {
    createIndexedDbPersister(instance) {
      return createPrototypePersister(instance.definition.persisterId, runtimeLog)
    },
    createWebSocket(url) {
      return { url }
    },
    createWsSynchronizer(instance) {
      return createPrototypeSynchronizer(instance.definition.synchronizerId, runtimeLog)
    },
    syncUrl: SYNC_URL,
  })

  console.log('\nWEB RUNTIME SMOKE')
  console.dir(
    {
      indexes: Object.keys(webRuntime.providerProps.indexesById),
      persisters: Object.keys(webRuntime.providerProps.persistersById),
      stores: Object.keys(webRuntime.providerProps.storesById),
      synchronizers: Object.keys(webRuntime.providerProps.synchronizersById),
    },
    { depth: null },
  )
  console.dir(runtimeLog, { depth: null })
  await webRuntime.close()
  console.dir(runtimeLog, { depth: null })
}

await main()
