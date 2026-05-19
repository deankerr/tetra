import type { SessionExport, Sessions } from '#sessions'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'

const BUNDLED_SEEDS: SessionExport[] = [
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON structure matches SessionExport
  tailwindV4Cheatsheet as unknown as SessionExport,
]

/** Load all bundled seed sessions into the store. Idempotent — safe to call repeatedly. */
export function loadSeeds(sessions: Sessions): void {
  for (const seed of BUNDLED_SEEDS) {
    sessions.importSession(seed)
  }
}
