import { RunConfigSchema, SessionRunConfigSchema } from '@tetra/schemas/library'
import type { LibraryStoreInstance, LibraryTypedStore, RunConfig } from '@tetra/schemas/library'

// RunConfigs owns session config operations a raw cell write cannot express:
// birth defaults, structured updates, default snapshots, and run-start resolution.
export class RunConfigs {
  private readonly typedStore: LibraryTypedStore

  constructor({ libraryStore }: { libraryStore: LibraryStoreInstance }) {
    this.typedStore = libraryStore.typedStore
  }

  // Birth merge: session schema defaults under the stored new-session default
  // under the caller partial. Parse happens before any store write so an invalid
  // merge never lands a row.
  createForSession(partial?: Partial<RunConfig>): RunConfig {
    const storedDefault = this.typedStore.values.defaultRunConfig.get()
    return SessionRunConfigSchema.parse({
      ...toConfigObject(storedDefault),
      ...partial,
    })
  }

  // Structured update: merge the partial over the required existing row and
  // parse before any write so an invalid partial never lands a partial write.
  update(sessionId: string, partial: Partial<RunConfig>): RunConfig {
    const existing = this.typedStore.tables.sessions.requireEntity(sessionId).config
    const config = RunConfigSchema.parse({ ...existing, ...partial })

    this.typedStore.tables.sessions.setCell(sessionId, 'config', config)

    return config
  }

  // Stored new-session default: copy the required session config row into the
  // defaultRunConfig value so later createForSession calls layer it over schema defaults.
  setAsDefault(sessionId: string): void {
    const session = this.typedStore.tables.sessions.requireEntity(sessionId)
    this.typedStore.values.defaultRunConfig.set(session.config)
  }

  // Prompt unlink: clear a deleted prompt id from every session config that
  // references it. TinyBase transactions nest, so callers may wrap this with
  // their own table writes.
  unlinkPrompt(promptId: string): void {
    this.typedStore.transaction(() => {
      for (const sessionId of this.typedStore.tables.sessions.getRowIds()) {
        const { config } = this.typedStore.tables.sessions.requireEntity(sessionId)
        if (config.systemPromptId === promptId) {
          this.typedStore.tables.sessions.setCell(sessionId, 'config', {
            ...config,
            systemPromptId: '',
          })
        }
      }
    })
  }

  // Run-start resolution: require the session config row, then parse the typed row
  // into the effective RunConfig snapshot.
  resolveForRun(sessionId: string): RunConfig {
    const session = this.typedStore.tables.sessions.requireEntity(sessionId)
    return RunConfigSchema.parse(session.config)
  }
}

// Stored defaults are user-authored input; ignore non-object shapes instead of merging them.
function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
