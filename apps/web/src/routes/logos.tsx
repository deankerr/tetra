import { createFileRoute } from '@tanstack/react-router'

import { TETRA_PALETTES, TetraLogo } from '@/components/tetra-logo'
import type { TetraPalette } from '@/components/tetra-logo'

export const Route = createFileRoute('/logos')({
  component: LogosRoute,
  head: () => ({ meta: [{ title: 'Tetra — Logos' }] }),
})

function LogosRoute() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-14 p-12">
      <TetraLogo className="w-36" detailed />

      <div className="grid grid-cols-4 gap-x-10 gap-y-8">
        {/* oxlint-disable-next-line typescript/no-unsafe-type-assertion */}
        {(Object.keys(TETRA_PALETTES) as TetraPalette[]).map((palette) => (
          <div className="flex flex-col items-center gap-3" key={palette}>
            <TetraLogo className="w-16" palette={palette} />
            <span className="text-muted-foreground text-xs capitalize">{palette}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-3 shadow">
          <TetraLogo className="size-5" />
          <span className="font-orbitron text-sm font-semibold text-zinc-900 uppercase">Tetra</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-zinc-900 px-5 py-3 shadow">
          <TetraLogo className="size-5" />
          <span className="font-orbitron text-sm font-semibold text-zinc-100 uppercase">Tetra</span>
        </div>
      </div>
    </div>
  )
}
