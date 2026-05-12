import { ScrollArea } from '@tetra/ui/components/ui/scroll-area'
import type { ReactNode } from 'react'

export function DetailPanel({ children, open }: { children: ReactNode; open: boolean }) {
  if (!open) {
    return null
  }

  return (
    <aside className="bg-muted/40 flex w-80 shrink-0 flex-col border-l">
      <ScrollArea className="flex-1">
        <div className="p-4">{children}</div>
      </ScrollArea>
    </aside>
  )
}
