import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { AlertCircleIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { clearAllData } from '@/lib/debug'

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8">
      <AlertCircleIcon className="size-8 text-destructive" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-medium text-lg">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            reset()
            void router.invalidate()
          }}
          variant="outline"
        >
          Try again
        </Button>
        <Button onClick={clearAllData} variant="outline">
          <Trash2Icon />
          Clear data
        </Button>
      </div>
    </div>
  )
}
