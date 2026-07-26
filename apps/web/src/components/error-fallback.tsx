import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import { AlertCircleIcon, HomeIcon } from 'lucide-react'

type ErrorFallbackProps = {
  className?: string
  showHomeAction?: boolean
  title: string
} & (
  | {
      description: string
      error?: never
    }
  | {
      description?: never
      error: unknown
    }
)

export function ErrorFallback({
  className,
  showHomeAction = false,
  title,
  ...details
}: ErrorFallbackProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center',
        className,
      )}
      role="alert"
    >
      <AlertCircleIcon className="text-destructive size-8" />
      <div className="flex w-full max-w-2xl flex-col items-center gap-3">
        <h1 className="text-lg font-medium">{title}</h1>
        {'description' in details ? (
          <p className="text-muted-foreground text-sm">{details.description}</p>
        ) : (
          renderError(details.error)
        )}
      </div>
      {showHomeAction ? (
        <Button nativeButton={false} render={<a aria-label="Go home" href="/" />} variant="outline">
          <HomeIcon data-icon="inline-start" />
          Go home
        </Button>
      ) : null}
    </div>
  )
}

function renderError(error: unknown) {
  if (!(error instanceof Error)) {
    return (
      <div className="border-border/60 bg-muted/30 text-muted-foreground w-full overflow-hidden rounded-md border text-left text-sm">
        <section className="p-3">
          <p className="text-foreground mb-2 font-mono font-medium">Thrown value</p>
          <pre className="overflow-auto text-xs">{formatUnknown(error)}</pre>
        </section>
      </div>
    )
  }

  return (
    <div className="border-border/60 bg-muted/30 text-muted-foreground w-full overflow-hidden rounded-md border text-left text-sm">
      <section className="p-3">
        <p className="text-foreground mb-2 font-mono font-medium">{error.name || 'Error'}</p>
        <pre className="overflow-auto font-sans break-words whitespace-pre-wrap">
          {error.message}
        </pre>
      </section>

      {error.cause === undefined
        ? null
        : renderDiagnosticDisclosure('Cause', formatUnknown(error.cause))}

      {error.stack === undefined ? null : renderDiagnosticDisclosure('Stack trace', error.stack)}
    </div>
  )
}

function renderDiagnosticDisclosure(label: string, content: string) {
  return (
    <details className="border-border/60 border-t">
      <summary className="text-foreground cursor-pointer px-3 py-2 text-xs font-medium select-none">
        {label}
      </summary>
      <div className="border-border/60 max-h-64 overflow-auto border-t p-3 font-mono text-xs">
        <pre>{content}</pre>
      </div>
    </details>
  )
}

function formatUnknown(value: unknown) {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
