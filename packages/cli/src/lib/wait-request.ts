import type { TetraStore } from '@tetra/core'

export async function waitForRequest(store: TetraStore['store'], requestId: string): Promise<void> {
  // Fast failures can reach a terminal state before the CLI attaches its listener.
  const currentStatus = store.getCell('requests', requestId, 'status')
  if (currentStatus === 'completed') {
    return
  }
  if (currentStatus === 'error' || currentStatus === 'cancelled') {
    const rawError = store.getCell('requests', requestId, 'errorMessage')
    throw new Error(typeof rawError === 'string' ? rawError : currentStatus)
  }

  // TinyBase listeners are callback-based, so the CLI wraps request completion in a Promise.
  // eslint-disable-next-line promise/avoid-new -- TinyBase exposes listener callbacks, not a Promise API.
  await new Promise<void>((resolve, reject) => {
    const listenerId = store.addCellListener(
      'requests',
      requestId,
      'status',
      (s, tableId, rowId, cellId) => {
        const status = s.getCell(tableId, rowId, cellId)
        if (status === 'completed') {
          store.delListener(listenerId)
          resolve()
          return
        }

        if (status === 'error' || status === 'cancelled') {
          store.delListener(listenerId)
          const rawError = s.getCell(tableId, rowId, 'errorMessage')
          reject(new Error(typeof rawError === 'string' ? rawError : status))
        }
      },
    )
  })
}
