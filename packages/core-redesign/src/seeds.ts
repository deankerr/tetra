import type { SessionExport, Sessions } from '#sessions'

import tailwindV4Cheatsheet from './seeds/tailwind-v4-cheatsheet.json'

const bundledSeeds: SessionExport[] = [
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON structure matches the portable session export shape.
  tailwindV4Cheatsheet as unknown as SessionExport,
]

export function loadSeeds(sessions: Sessions): void {
  for (const seed of bundledSeeds) {
    sessions.importSession(seed)
  }
}
