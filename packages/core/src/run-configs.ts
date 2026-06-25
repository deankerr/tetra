import { RunConfigSchema, SessionRunConfigSchema } from '@tetra/stores/library'
import type { LibraryStoreInstance, LibraryTypedStore, RunConfig } from '@tetra/stores/library'

// RunConfigs owns the run config operations a single cell write cannot express:
// the session config birth merge and run-start resolution (ADR-0008). Typed
// per-cell writes to sessionRunConfigs remain first-class for surfaces.
export class RunConfigs {
  private readonly typedStore: LibraryTypedStore

  constructor({ libraryStore }: { libraryStore: LibraryStoreInstance }) {
    this.typedStore = libraryStore.typedStore
  }

  // Birth merge: session schema defaults under the stored new-session default
  // under the caller partial. Parse happens before any store write so an invalid
  // merge never lands a row.
  createForSession(sessionId: string, partial?: Partial<RunConfig>): RunConfig {
    const storedDefault = this.typedStore.values.defaultRunConfig.get()
    const config = SessionRunConfigSchema.parse({
      ...toConfigObject(storedDefault),
      ...partial,
    })

    this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)

    return config
  }

  // Structured update: merge the partial over the required existing row and
  // parse before any write so an invalid partial never lands a partial write.
  update(sessionId: string, partial: Partial<RunConfig>): RunConfig {
    const existing = this.typedStore.tables.sessionRunConfigs.requireEntity(sessionId)
    const config = RunConfigSchema.parse({ ...existing, ...partial })

    this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)

    return config
  }

  // Stored new-session default: copy the required session config row into the
  // defaultRunConfig value so later createForSession calls layer it over schema defaults.
  setAsDefault(sessionId: string): void {
    const config = this.typedStore.tables.sessionRunConfigs.getRow(sessionId)
    if (config === null) {
      throw new Error(`Missing row: sessionRunConfigs/${sessionId}`)
    }

    this.typedStore.values.defaultRunConfig.set(config)
  }

  // Prompt unlink: clear a deleted prompt id from every session config that
  // references it. TinyBase transactions nest, so callers may wrap this with
  // their own table writes.
  unlinkPrompt(promptId: string): void {
    this.typedStore.transaction(() => {
      for (const sessionId of this.typedStore.tables.sessionRunConfigs.getRowIds()) {
        if (
          this.typedStore.tables.sessionRunConfigs.getCell(sessionId, 'systemPromptId') === promptId
        ) {
          this.typedStore.tables.sessionRunConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }
    })
  }

  // Session cascade: remove the session's config row when the owning session goes.
  deleteForSession(sessionId: string): void {
    this.typedStore.tables.sessionRunConfigs.deleteRow(sessionId)
  }

  // Run-start resolution: require the session config row, then parse the typed row
  // into the effective RunConfig snapshot.
  resolveForRun(sessionId: string): RunConfig {
    const sessionRunConfig = this.typedStore.tables.sessionRunConfigs.getRow(sessionId)
    if (sessionRunConfig === null) {
      throw new Error(`Missing row: sessionRunConfigs/${sessionId}`)
    }

    return RunConfigSchema.parse(sessionRunConfig)
  }
}

// Stored defaults are user-authored input; ignore non-object shapes instead of merging them.
function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
