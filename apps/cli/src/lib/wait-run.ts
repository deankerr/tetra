import type { Run } from '@tetra/core'

export async function waitForRun(run: Run): Promise<void> {
  // The CLI owns the live run, so it can wait on the same object that streams snapshots.
  await run.done
  if (run.status === 'completed') {
    return
  }

  // Run terminal errors are persisted already; this turns them back into a CLI failure.
  if (run.error instanceof Error) {
    throw run.error
  }
  throw new Error(run.error === null ? run.status : JSON.stringify(run.error))
}
