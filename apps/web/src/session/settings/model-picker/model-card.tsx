import type { CatalogRows } from '@tetra/stores/catalog'
import { ModelSelectorLogo } from '@tetra/ui/components/ai-elements/model-selector'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CalendarDaysIcon,
  CopyIcon,
  InfoIcon,
  StarIcon,
} from 'lucide-react'
import type { ComponentProps } from 'react'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatContextLength(contextLength: number) {
  if (contextLength <= 0) {
    return '?'
  }

  if (contextLength >= 1_000_000) {
    return `${Number((contextLength / 1_000_000).toFixed(1))}m`
  }

  return `${Number((contextLength / 1000).toFixed(1))}k`
}

function formatModality(modality: string) {
  if (modality === '') {
    return 'unknown'
  }

  return modality.replaceAll('_', ' ')
}

function formatUpstreamCreatedAt(upstreamCreatedAt: number) {
  if (upstreamCreatedAt <= 0) {
    return 'unknown'
  }

  const timestamp =
    upstreamCreatedAt < 1_000_000_000_000 ? upstreamCreatedAt * 1000 : upstreamCreatedAt
  return dateFormatter.format(new Date(timestamp))
}

function ModelFact({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'text-muted-foreground flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs',
        '[&>svg]:size-3.5 [&>svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ModelCard({
  favorite,
  model,
  onSelect,
  onToggleFavorite,
  selected,
}: {
  favorite: boolean
  model: CatalogRows['languageModels']
  onSelect: () => void
  onToggleFavorite: () => void
  selected: boolean
}) {
  const selectLabel = selected ? `${model.name} selected` : `Use ${model.name}`

  return (
    <div
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'border-border @container/model-card relative border-b border-l-2 border-l-transparent last:border-b-0',
        selected && 'border-l-ring bg-muted/35',
      )}
    >
      <button
        aria-label={selectLabel}
        aria-pressed={selected}
        className="focus-visible:ring-ring/50 hover:bg-muted/35 absolute inset-0 z-10 bg-transparent text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onSelect}
        type="button"
      />

      <div className="pointer-events-none relative z-20 min-w-0 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
            <ModelSelectorLogo className="size-4" provider={model.provider} />
          </div>

          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-foreground truncate text-sm font-medium">{model.name}</div>
              <div className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                {model.id}
              </div>
            </div>

            <div className="pointer-events-auto relative z-30 flex shrink-0 items-start gap-1">
              <Button
                aria-label={favorite ? 'Remove model from favorites' : 'Add model to favorites'}
                onClick={onToggleFavorite}
                size="icon-sm"
                title={favorite ? 'Remove model from favorites' : 'Add model to favorites'}
                variant="ghost"
              >
                <StarIcon className={cn(favorite && 'fill-current')} />
              </Button>
              <Button
                aria-label={`Copy ${model.id}`}
                onClick={() => {
                  void navigator.clipboard.writeText(model.id)
                }}
                size="icon-sm"
                title="Copy model id"
                variant="ghost"
              >
                <CopyIcon />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-2 grid min-w-0 grid-cols-1 items-start gap-x-6 gap-y-1.5 pl-12 @lg/model-card:grid-cols-2">
          <ModelFact>
            <InfoIcon />
            Context: {formatContextLength(model.contextLength)}
          </ModelFact>

          <ModelFact>
            <CalendarDaysIcon />
            Released: {formatUpstreamCreatedAt(model.upstreamCreatedAt)}
          </ModelFact>

          <ModelFact>
            <ArrowDownToLineIcon />
            Input:
            {model.inputModalities.map((modality) => (
              <Badge key={modality} variant="outline">
                {formatModality(modality)}
              </Badge>
            ))}
          </ModelFact>

          <ModelFact>
            <ArrowUpFromLineIcon />
            Output:
            {model.outputModalities.map((modality) => (
              <Badge key={modality} variant="outline">
                {formatModality(modality)}
              </Badge>
            ))}
          </ModelFact>
        </div>
      </div>
    </div>
  )
}
