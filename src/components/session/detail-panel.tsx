import type { ReactNode } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

export function DetailPanel({ children, open }: { children: ReactNode; open: boolean }) {
  if (!open) {
    return null
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-muted/40">
      <ScrollArea className="flex-1">
        <div className="p-4">{children}</div>
      </ScrollArea>
    </aside>
  )
}
