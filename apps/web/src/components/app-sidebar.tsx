import { PlusIcon } from 'lucide-react'

import { SessionList } from '@/components/session/session-list'
import { SettingsDialog } from '@/components/settings-dialog'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRuntime } from '@/components/use-runtime'
import { ThemeSwitcher } from '@/components/util/theme-switcher'
import { DEFAULT_SESSION_CONFIG } from '@/lib/constants'
import { useSyncStatus } from '@/lib/runtime/hooks'
import {
  getDraftConfig,
  initDraft,
  useActiveSessionId,
  useUiStore,
  useUiValueState,
} from '@/lib/ui'

const SYNC_CONFIG = {
  connected: { color: 'bg-emerald-500', label: 'Synced' },
  disconnected: { color: 'bg-amber-500', label: 'Disconnected' },
  off: { color: 'bg-zinc-400', label: 'Local only' },
} as const

function SyncIndicator() {
  const status = useSyncStatus()
  const { color, label } = SYNC_CONFIG[status]

  return (
    <Tooltip>
      <TooltipTrigger className="ml-auto cursor-default">
        <span className={`block size-2 rounded-full ${color}`} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar() {
  const runtime = useRuntime()
  const uiStore = useUiStore()
  const activeSessionId = useActiveSessionId()
  const [, setActiveSessionId] = useUiValueState('activeSessionId')

  return (
    <>
      <SidebarHeader className="p-0">
        <div className="flex items-center gap-2 px-4 border-b h-(--header-height)">
          <svg className="size-5" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <polygon fill="#0f766e" points="16,2 2,28 16,19" />
            <polygon fill="#14b8a6" points="16,2 16,19 30,28" />
            <polygon fill="#5eead4" points="2,28 30,28 16,19" />
          </svg>
          <span className="font-semibold text-sm">Tetra</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupAction
            className="top-2.5"
            onClick={() => {
              // Copy config from current session, or use defaults for first session
              const config =
                uiStore !== undefined && activeSessionId !== undefined && activeSessionId !== ''
                  ? getDraftConfig(uiStore, activeSessionId)
                  : DEFAULT_SESSION_CONFIG
              const sessionId = runtime.createSession()
              if (uiStore) {
                initDraft(uiStore, sessionId, config)
              }
              setActiveSessionId(sessionId)
            }}
          >
            <PlusIcon />
            <span className="sr-only">New session</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              <SessionList />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2">
          <SettingsDialog />
          <ThemeSwitcher />
          <SyncIndicator />
        </div>
      </SidebarFooter>
    </>
  )
}
