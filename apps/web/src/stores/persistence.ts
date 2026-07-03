/* eslint-disable max-classes-per-file -- This file is the catalog of browser storage media; each class is small and they are read together. */
import {
  createLocalPersister,
  createOpfsPersister,
  createSessionPersister,
} from 'tinybase/persisters/persister-browser/with-schemas'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas'
import type { OptionalSchemas } from 'tinybase/store/with-schemas'

// Every store's browser home follows the same lifecycle: load once at boot, auto-save from then
// on, halt before a wipe. Each storage medium keeps its own class so its particulars (file
// handles, database names, cross-tab reloads) stay visible instead of behind a generic wrapper.
export interface StorePersistence {
  readonly label: string
  start(): Promise<void>
  halt(): Promise<void>
}

// halt() only needs to stop the machinery; the concrete persister types stay inside start().
interface RunningPersister {
  destroy(): Promise<unknown>
}

export class OpfsFilePersistence<Schemas extends OptionalSchemas> implements StorePersistence {
  readonly label: string
  private readonly fileName: string
  private readonly store: Parameters<typeof createOpfsPersister<Schemas>>[0]
  private running: RunningPersister | undefined

  constructor(
    label: string,
    store: Parameters<typeof createOpfsPersister<Schemas>>[0],
    fileName: string,
  ) {
    this.label = label
    this.store = store
    this.fileName = fileName
  }

  async start(): Promise<void> {
    // OPFS hands out async file handles; the persister owns whole-file JSON writes over one.
    if (navigator.storage.getDirectory === undefined) {
      throw new Error('OPFS is not available: navigator.storage.getDirectory is missing')
    }

    const opfsDirectory = await navigator.storage.getDirectory()
    const handle = await opfsDirectory.getFileHandle(this.fileName, { create: true })
    const persister = createOpfsPersister(this.store, handle, reportPersistenceError(this.label))
    await persister.load(() => this.store.getContent())
    logPersisterLoaded(this.label, persister, { fileName: this.fileName, storage: 'opfs' })
    await persister.startAutoSave()
    this.running = persister
  }

  async halt(): Promise<void> {
    if (this.running === undefined) {
      return
    }

    await this.running.destroy()
    console.log(`[stores:${this.label}] persistence halted`)
  }
}

export class IndexedDbPersistence<Schemas extends OptionalSchemas> implements StorePersistence {
  readonly label: string
  private readonly dbName: string
  private readonly store: Parameters<typeof createIndexedDbPersister<Schemas>>[0]
  private running: RunningPersister | undefined

  constructor(
    label: string,
    store: Parameters<typeof createIndexedDbPersister<Schemas>>[0],
    dbName: string,
  ) {
    this.label = label
    this.store = store
    this.dbName = dbName
  }

  async start(): Promise<void> {
    // The IndexedDB persister opens and closes its connection per operation, so it never holds
    // a lock that would block a wipe's deleteDatabase.
    const persister = createIndexedDbPersister(
      this.store,
      this.dbName,
      undefined,
      reportPersistenceError(this.label),
    )
    await persister.load(() => this.store.getContent())
    logPersisterLoaded(this.label, persister, { dbName: this.dbName, storage: 'indexedDB' })
    await persister.startAutoSave()
    this.running = persister
  }

  async halt(): Promise<void> {
    if (this.running === undefined) {
      return
    }

    await this.running.destroy()
    console.log(`[stores:${this.label}] persistence halted`)
  }
}

export class SessionStoragePersistence<
  Schemas extends OptionalSchemas,
> implements StorePersistence {
  readonly label: string
  private readonly storageName: string
  private readonly store: Parameters<typeof createSessionPersister<Schemas>>[0]
  private running: RunningPersister | undefined

  constructor(
    label: string,
    store: Parameters<typeof createSessionPersister<Schemas>>[0],
    storageName: string,
  ) {
    this.label = label
    this.store = store
    this.storageName = storageName
  }

  async start(): Promise<void> {
    const persister = createSessionPersister(
      this.store,
      this.storageName,
      reportPersistenceError(this.label),
    )
    await persister.load(() => this.store.getContent())
    logPersisterLoaded(this.label, persister, {
      storage: 'sessionStorage',
      storageName: this.storageName,
    })
    await persister.startAutoSave()
    this.running = persister
  }

  async halt(): Promise<void> {
    if (this.running === undefined) {
      return
    }

    await this.running.destroy()
    console.log(`[stores:${this.label}] persistence halted`)
  }
}

export class LocalStoragePersistence<Schemas extends OptionalSchemas> implements StorePersistence {
  readonly label: string
  private readonly storageName: string
  private readonly store: Parameters<typeof createLocalPersister<Schemas>>[0]
  private running: RunningPersister | undefined

  constructor(
    label: string,
    store: Parameters<typeof createLocalPersister<Schemas>>[0],
    storageName: string,
  ) {
    this.label = label
    this.store = store
    this.storageName = storageName
  }

  async start(): Promise<void> {
    const persister = createLocalPersister(
      this.store,
      this.storageName,
      reportPersistenceError(this.label),
    )
    // localStorage is shared across tabs, and TinyBase's persister listens to browser storage
    // events natively — auto-load keeps every tab's copy converged without hand-rolled listeners.
    await persister.startAutoLoad(() => this.store.getContent())
    logPersisterLoaded(this.label, persister, {
      storage: 'localStorage',
      storageName: this.storageName,
    })
    await persister.startAutoSave()
    this.running = persister
  }

  async halt(): Promise<void> {
    if (this.running === undefined) {
      return
    }

    await this.running.destroy()
    console.log(`[stores:${this.label}] persistence halted`)
  }
}

function reportPersistenceError(label: string) {
  return (error: unknown) => {
    console.error(`[stores:${label}] persistence error`, error)
  }
}

function logPersisterLoaded(
  label: string,
  persister: { getStats(): { loads: number; saves: number } },
  details: Record<string, string>,
): void {
  console.log(`[stores:${label}] persister loaded`, {
    ...details,
    stats: persister.getStats(),
  })
}
