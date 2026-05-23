import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import { AlertCircleIcon, Trash2Icon } from 'lucide-react'

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <AlertCircleIcon className="text-destructive size-8" />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-medium">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-sm">
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
        <Button disabled variant="outline">
          <Trash2Icon />
          Clear data
        </Button>
      </div>
    </div>
  )
}
