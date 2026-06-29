import type { CatalogEntities } from '@tetra/schemas/catalog'
import { ModelSelectorLogo } from '@tetra/ui/components/ai-elements/model-selector'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'
import {
  AudioLinesIcon,
  CalendarDaysIcon,
  CopyIcon,
  FileIcon,
  GaugeIcon,
  ImageDownIcon,
  ImageUpIcon,
  ShapesIcon,
  StarIcon,
  VideoIcon,
} from 'lucide-react'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const contextLengthFormatter = new Intl.NumberFormat(undefined, {
  compactDisplay: 'short',
  maximumFractionDigits: 1,
  notation: 'compact',
})

// Direction-specific image glyphs keep input and output capabilities distinct while the rest of the
// known modalities share their natural icon. Unknown modalities stay visible via the fallback.
const MODALITY_ICONS: Record<'input' | 'output', Record<string, LucideIcon>> = {
  input: {
    audio: AudioLinesIcon,
    file: FileIcon,
    image: ImageUpIcon,
    video: VideoIcon,
  },
  output: {
    audio: AudioLinesIcon,
    file: FileIcon,
    image: ImageDownIcon,
    video: VideoIcon,
  },
}

function formatUpstreamCreatedAt(upstreamCreatedAt: number) {
  if (upstreamCreatedAt <= 0) {
    return 'unknown'
  }

  const timestamp =
    upstreamCreatedAt < 1_000_000_000_000 ? upstreamCreatedAt * 1000 : upstreamCreatedAt
  return dateFormatter.format(new Date(timestamp))
}

// Text is the baseline capability, so only non-text input and output modalities get icon slots.
function ModelModalities({ model }: { model: CatalogEntities['languageModels'] }) {
  const modalities = [
    ...model.inputModalities.map((modality) => ({ direction: 'input' as const, modality })),
    ...model.outputModalities.map((modality) => ({ direction: 'output' as const, modality })),
  ].filter(({ modality }) => modality !== 'text')

  if (modalities.length === 0) {
    return null
  }

  return (
    <span className="flex items-center gap-1.5">
      {modalities.map(({ direction, modality }) => {
        const Icon = MODALITY_ICONS[direction][modality] ?? ShapesIcon
        const label = `${modality} ${direction}`

        return (
          <span
            aria-label={label}
            className="inline-flex"
            key={`${direction}:${modality}`}
            role="img"
            title={label}
          >
            <Icon aria-hidden className="size-3.5 shrink-0" />
          </span>
        )
      })}
    </span>
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
  model: CatalogEntities['languageModels']
  onSelect: () => void
  onToggleFavorite: () => void
  selected: boolean
}) {
  const contextLength = contextLengthFormatter.format(model.contextLength)
  const releaseDate = formatUpstreamCreatedAt(model.upstreamCreatedAt)
  const selectLabel = selected ? `${model.name} selected` : `Use ${model.name}`

  return (
    <div
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'border-border relative border-b border-l-4 border-l-transparent last:border-b-0',
        selected && 'border-l-primary',
      )}
    >
      <button
        aria-label={selectLabel}
        aria-pressed={selected}
        className="focus-visible:ring-ring/50 hover:bg-muted/35 absolute inset-0 z-10 bg-transparent text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onSelect}
        type="button"
      />

      <div className="pointer-events-none relative z-20 flex min-w-0 items-start gap-3 px-4 py-2.5">
        <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
          <ModelSelectorLogo className="size-4" provider={model.provider} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
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

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span
              aria-label={`Context length ${contextLength}`}
              className="flex items-center gap-1.5"
              title="Context length"
            >
              <GaugeIcon aria-hidden className="size-3.5 shrink-0" />
              {contextLength}
            </span>
            <span
              aria-label={`Release date ${releaseDate}`}
              className="flex items-center gap-1.5"
              title="Release date"
            >
              <CalendarDaysIcon aria-hidden className="size-3.5 shrink-0" />
              {releaseDate}
            </span>
            <ModelModalities model={model} />
          </div>
        </div>
      </div>
    </div>
  )
}
