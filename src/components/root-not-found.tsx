import { useRouter } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

export function RootNotFoundComponent() {
  const router = useRouter()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-medium text-lg">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
      </div>
      <Button
        onClick={() => {
          void router.navigate({ to: '/' })
        }}
        variant="outline"
      >
        Go home
      </Button>
    </div>
  )
}
