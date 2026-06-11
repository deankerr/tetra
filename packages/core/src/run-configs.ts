import { DEFAULT_RUN_CONFIG, RunConfigSchema } from '@tetra/store-schema'
import type { RunConfig, TetraRawStore, TetraTypedStore } from '@tetra/store-schema'

// RunConfigs owns the run config operations a single cell write cannot express:
// the session config birth merge and run-start resolution (ADR-0008). Typed
// per-cell writes to sessionRunConfigs remain first-class for surfaces.
export class RunConfigs {
  private readonly rawStore: TetraRawStore
  private readonly typedStore: TetraTypedStore

  constructor({ rawStore, typedStore }: { rawStore: TetraRawStore; typedStore: TetraTypedStore }) {
    this.rawStore = rawStore
    this.typedStore = typedStore
  }

  // Birth merge: built-in defaults under the stored new-session default under the
  // caller partial. Parse happens before any store write so an invalid merge
  // never lands a row.
  createForSession(sessionId: string, partial?: Partial<RunConfig>): RunConfig {
    const storedDefault = this.rawStore.hasValue('defaultRunConfig')
      ? this.rawStore.getValue('defaultRunConfig')
      : undefined
    const config = RunConfigSchema.parse({
      ...DEFAULT_RUN_CONFIG,
      ...toConfigObject(storedDefault),
      ...partial,
    })

    this.typedStore.tables.sessionRunConfigs.setRow(sessionId, config)

    return config
  }

  // Run-start resolution: raw-read the session config row so the merge stays
  // tolerant of missing cells, then parse into the effective RunConfig.
  resolveForRun(sessionId: string): RunConfig {
    const sessionRunConfig = this.rawStore.getRow('sessionRunConfigs', sessionId)

    return RunConfigSchema.parse({
      ...DEFAULT_RUN_CONFIG,
      ...sessionRunConfig,
    })
  }
}

// Stored defaults are user-authored input; ignore non-object shapes instead of merging them.
function toConfigObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value))
  }

  return {}
}
