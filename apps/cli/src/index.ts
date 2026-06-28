import { createPersistentCliAppContext } from './app'
import type { CliAppContext } from './app'
import { createCliProgram } from './program'
import type { CliProgramContextOptions, CliRootCommandOptions } from './program'

// Keep store startup lazy so help, version, and sync maintenance commands stay cheap.
let context: CliAppContext | undefined
let contextPromise: Promise<CliAppContext> | undefined
async function getContext(options: CliProgramContextOptions = {}): Promise<CliAppContext> {
  if (context !== undefined) {
    return context
  }

  const opts = program.opts<CliRootCommandOptions>()
  contextPromise ??= createPersistentCliAppContext({
    syncEnabled: opts.sync !== false && options.syncLibrary !== false,
  })
  context = await contextPromise
  return context
}

let closePromise: Promise<void> | undefined
async function saveAndClose(): Promise<void> {
  // A failed lazy startup should not mask the original command error.
  let ctx = context
  if (ctx === undefined && contextPromise !== undefined) {
    try {
      ctx = await contextPromise
    } catch {
      return
    }
  }

  // Help-only commands never create a context.
  if (ctx === undefined) {
    return
  }

  // Multiple exit paths may converge here after SIGINT or thrown command errors.
  closePromise ??= ctx.close()
  await closePromise
}

process.once('SIGINT', () => {
  // Ctrl+C during streaming still needs to flush already-written TinyBase rows.
  void (async () => {
    try {
      await saveAndClose()
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
    } finally {
      process.exit(130)
    }
  })()
})

// Production owns process argv and shutdown; command registration lives in the reusable program.
const program = createCliProgram({ getContext })

let exitCode = 0
try {
  await program.parseAsync(process.argv)
} catch (error: unknown) {
  exitCode = 1
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  try {
    await saveAndClose()
  } catch (error) {
    exitCode = 1
    console.error(error instanceof Error ? error.message : String(error))
  }
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
