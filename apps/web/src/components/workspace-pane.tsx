import { SidebarTrigger, useSidebar } from '@tetra/ui/components/ui/sidebar'
import { cn } from '@tetra/ui/lib/utils'
import type { ReactNode } from 'react'

import { appPlatform } from '@/platform'

export function WorkspacePane({
  actions,
  children,
  className,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  title: ReactNode
}) {
  const { state } = useSidebar()
  const needsWindowControlsClearance = appPlatform === 'tauri' && state === 'collapsed'

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}
      data-slot="workspace-pane"
    >
      <header
        className={cn(
          'flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2',
          needsWindowControlsClearance && 'ps-20',
        )}
        data-tauri-drag-region={appPlatform === 'tauri' ? '' : undefined}
      >
        <SidebarTrigger title={state === 'collapsed' ? 'Open sidebar' : 'Close sidebar'} />
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium"
          data-tauri-drag-region={appPlatform === 'tauri' ? '' : undefined}
        >
          {title}
        </span>
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="workspace-pane-body">
        {children}
      </div>
    </div>
  )
}
