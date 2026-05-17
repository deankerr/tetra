import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { DatabaseIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePersister, usePersisterStatus } from 'tinybase/ui-react'

// TinyBase persister status: 0 idle, 1 loading, 2 saving
const S_SAVING = 2

const STATUS_VIEW: Record<number, { label: string; tone: string }> = {
  0: { label: 'Idle', tone: 'bg-emerald-500' },
  1: { label: 'Loading', tone: 'bg-sky-500' },
  2: { label: 'Saving', tone: 'bg-amber-500' },
}
const IDLE_STATUS_VIEW: { label: string; tone: string } = { label: 'Idle', tone: 'bg-emerald-500' }

function useLastSaved(status: number) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [display, setDisplay] = useState('')
  const prevStatus = useRef(status)

  // Record timestamp when status transitions saving → idle
  useEffect(() => {
    if (prevStatus.current === S_SAVING && status !== S_SAVING) {
      setLastSaved(new Date())
    }
    prevStatus.current = status
  }, [status])

  // Keep relative time label fresh
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined

    if (lastSaved !== null) {
      const update = () => {
        const secs = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
        if (secs < 5) {
          setDisplay('just now')
        } else if (secs < 60) {
          setDisplay(`${secs}s ago`)
        } else {
          setDisplay(`${Math.floor(secs / 60)}m ago`)
        }
      }
      update()
      id = setInterval(update, 1000)
    }

    return () => {
      clearInterval(id)
    }
  }, [lastSaved])

  return display
}

export function PersistenceStatus() {
  const persister = usePersister()
  // oxlint-disable-next-line no-unsafe-type-assertion -- Status is an ambient const enum; cast to number
  const status = usePersisterStatus() as number
  const lastSaved = useLastSaved(status)

  const { label, tone } = STATUS_VIEW[status] ?? IDLE_STATUS_VIEW
  const stats = persister?.getStats()
  const isSaving = status === S_SAVING

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`Persistence ${label.toLowerCase()}`}
            className="hover:bg-sidebar-accent flex size-8 items-center justify-center rounded-md"
            type="button"
          />
        }
      >
        <span className="relative">
          <DatabaseIcon className="size-3.5" />
          <span className={`absolute -right-1 -bottom-0.5 size-2 rounded-full ${tone}`}>
            {isSaving && (
              <span className={`absolute inset-0 animate-ping rounded-full ${tone} opacity-75`} />
            )}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid max-w-none justify-items-start gap-1" side="top">
        <span className="text-[11px] font-medium">
          Persistence: {label}
          {lastSaved && !isSaving && ` — saved ${lastSaved}`}
        </span>
        <span className="text-muted-foreground font-mono text-[11px]">
          {stats?.loads ?? 0} loads · {stats?.saves ?? 0} saves
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
