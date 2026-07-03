const WIPE_BROADCAST_CHANNEL = 'tetra:wipe'
const WIPE_REPORT_STORAGE_KEY = 'tetra:wipe-report'
// A delete can sit in the 'blocked' state indefinitely if some connection never closes; the
// timeout converts that into a recorded failure so the reload guarantee stays unconditional.
const IDB_DELETE_TIMEOUT_MS = 5000

export interface WipeFailure {
  message: string
  step: string
}

// Delete-all-data is forward-only and best-effort: every step runs even when earlier ones fail,
// the reload into first-run is unconditional, and failures are stashed to be reported honestly
// after the reboot. The one unacceptable outcome is a silent partial wipe — a privacy gesture
// must not claim success it did not achieve.
export function createDataWipe(halt: () => Promise<void>): () => Promise<void> {
  const channel = new BroadcastChannel(WIPE_BROADCAST_CHANNEL)

  // Other tabs halt persistence and reload the moment one tab wipes, so their in-memory stores
  // cannot resurrect the deleted files.
  channel.addEventListener('message', () => {
    console.log('[stores:wipe] wipe broadcast received; halting and reloading')
    void (async () => {
      try {
        await halt()
      } finally {
        location.reload()
      }
    })()
  })

  return async function wipeAllData(): Promise<void> {
    console.log('[stores:wipe] delete all data started')
    const failures: WipeFailure[] = []
    const step = async (name: string, run: () => Promise<void> | void): Promise<void> => {
      const failuresBefore = failures.length
      try {
        await run()
        if (failures.length === failuresBefore) {
          console.log(`[stores:wipe] step ok: ${name}`)
        }
      } catch (error: unknown) {
        failures.push({ message: toMessage(error), step: name })
        console.error(`[stores:wipe] step failed: ${name}`, error)
      }
    }

    try {
      // Stop everything that can write before erasing what was written.
      await step('halt sync and persistence', halt)
      await step('erase files', async () => {
        failures.push(...(await eraseOpfsEntries()))
      })
      await step('erase databases', async () => {
        failures.push(...(await eraseIndexedDbDatabases()))
      })
      await step('clear device settings', () => {
        localStorage.clear()
      })
      await step('clear tab state', () => {
        sessionStorage.clear()
      })

      // The report is stashed after sessionStorage is cleared so it survives into the fresh boot.
      if (failures.length > 0) {
        console.error('[stores:wipe] completed with failures', failures)
        stashWipeReport(failures)
      } else {
        console.log('[stores:wipe] complete; reloading into first run')
      }

      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage takes no targetOrigin.
      channel.postMessage('wipe')
    } finally {
      location.reload()
    }
  }
}

// The fresh boot reads this once and reports it to the user; silence means the wipe was complete.
export function consumeWipeReport(): WipeFailure[] | undefined {
  const rawValue = sessionStorage.getItem(WIPE_REPORT_STORAGE_KEY)
  if (rawValue === null) {
    return undefined
  }

  sessionStorage.removeItem(WIPE_REPORT_STORAGE_KEY)
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Written by stashWipeReport in the previous document of this same tab.
    return JSON.parse(rawValue) as WipeFailure[]
  } catch {
    return [{ message: rawValue, step: 'unknown' }]
  }
}

// Individual entries keep erasing past failures: one stuck file must not protect the rest.
async function eraseOpfsEntries(): Promise<WipeFailure[]> {
  const failures: WipeFailure[] = []
  const opfsDirectory = await navigator.storage.getDirectory()
  for await (const name of opfsDirectory.keys()) {
    try {
      await opfsDirectory.removeEntry(name, { recursive: true })
    } catch (error: unknown) {
      failures.push({ message: toMessage(error), step: `erase file: ${name}` })
    }
  }

  return failures
}

async function eraseIndexedDbDatabases(): Promise<WipeFailure[]> {
  const failures: WipeFailure[] = []
  for (const { name } of await indexedDB.databases()) {
    if (name === undefined) {
      continue
    }

    try {
      // oxlint-disable-next-line no-await-in-loop -- IndexedDB deletion is intentionally best-effort per database so one failure is recorded before the next delete starts.
      await deleteIndexedDbDatabase(name)
    } catch (error: unknown) {
      failures.push({ message: toMessage(error), step: `erase database: ${name}` })
    }
  }

  return failures
}

async function deleteIndexedDbDatabase(name: string): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- IDBRequest predates promises; this is the standard bridge.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out deleting IndexedDB database: ${name}`))
    }, IDB_DELETE_TIMEOUT_MS)
    const request = indexedDB.deleteDatabase(name)
    request.addEventListener('blocked', () => {
      console.warn(`[stores:wipe] delete blocked by an open connection: ${name}`)
    })
    request.addEventListener('success', () => {
      clearTimeout(timer)
      resolve()
    })
    request.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error(`Failed to delete IndexedDB database: ${name}`))
    })
  })
}

function stashWipeReport(failures: WipeFailure[]): void {
  try {
    sessionStorage.setItem(WIPE_REPORT_STORAGE_KEY, JSON.stringify(failures))
  } catch (error: unknown) {
    // Reporting must never block the reload; the console is the fallback of last resort.
    console.error('[stores:wipe] failed to stash wipe report', error)
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
