import type { Rows } from '@tetra/store-schema'
import { ModelSelectorLogo } from '@tetra/ui/components/ai-elements/model-selector'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@tetra/ui/components/ui/input-group'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@tetra/ui/components/ui/sheet'
import { cn } from '@tetra/ui/lib/utils'
import {
  CalendarDaysIcon,
  CheckIcon,
  CopyIcon,
  InfoIcon,
  RotateCcwIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

type LanguageModel = Rows['languageModels'] & { id: string }
type ModelFilter = 'all' | 'audio' | 'file' | 'image' | 'starred' | 'text' | 'video'
type ModelSortMode = 'latest' | 'provider'

const MODEL_FILTERS = [
  { label: 'Starred', value: 'starred' },
  { label: 'All', value: 'all' },
  { label: 'Text', value: 'text' },
  { label: 'Images', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Files', value: 'file' },
] satisfies { label: string; value: ModelFilter }[]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function compareByLatest(left: LanguageModel, right: LanguageModel) {
  return (
    right.upstreamCreatedAt - left.upstreamCreatedAt ||
    left.providerName.localeCompare(right.providerName) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

function compareByProvider(left: LanguageModel, right: LanguageModel) {
  return (
    normalizeProviderName(left).localeCompare(normalizeProviderName(right)) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

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

function matchesSearch(model: LanguageModel, query: string) {
  if (query === '') {
    return true
  }

  const searchable = [
    model.id,
    model.name,
    model.provider,
    model.providerName,
    ...model.inputModalities,
    ...model.outputModalities,
  ]
    .join(' ')
    .toLowerCase()

  return searchable.includes(query)
}

function matchesFilter(model: LanguageModel, filter: ModelFilter, favoriteIds: Set<string>) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'starred') {
    return favoriteIds.has(model.id)
  }

  return [...model.inputModalities, ...model.outputModalities].includes(filter)
}

function normalizeProviderName(model: LanguageModel) {
  const providerName = model.providerName.toLowerCase()
  if (providerName.startsWith('~')) {
    return providerName.slice(1)
  }
  return providerName
}

function groupModelsByProvider(models: LanguageModel[]) {
  return [...Map.groupBy(models, normalizeProviderName).entries()]
    .map(([heading, groupedModels]) => ({
      heading,
      models: groupedModels.toSorted(compareByProvider),
    }))
    .toSorted((left, right) => left.heading.localeCompare(right.heading))
}

function useModelGroups({
  filter,
  query,
  sortMode,
}: {
  filter: ModelFilter
  query: string
  sortMode: ModelSortMode
}) {
  const models = typedTinybase.useEntityList('languageModels')
  const favorites = typedTinybase.useEntityList('modelFavorites')

  return useMemo(() => {
    const favoriteIds = new Set(favorites.map((favorite) => favorite.id))
    const normalizedQuery = query.trim().toLowerCase()
    const visibleModels = models.filter(
      (model) => matchesSearch(model, normalizedQuery) && matchesFilter(model, filter, favoriteIds),
    )
    const compare = sortMode === 'latest' ? compareByLatest : compareByProvider
    const favoriteModels = visibleModels
      .filter((model) => favoriteIds.has(model.id))
      .toSorted(compare)
    const regularModels =
      filter === 'starred'
        ? []
        : visibleModels.filter((model) => !favoriteIds.has(model.id)).toSorted(compare)

    if (sortMode === 'latest') {
      return [{ heading: null, models: [...favoriteModels, ...regularModels] }].filter(
        (group) => group.models.length > 0,
      )
    }

    return [...groupModelsByProvider(favoriteModels), ...groupModelsByProvider(regularModels)]
  }, [favorites, filter, models, query, sortMode])
}

function useFavoriteIds() {
  const favorites = typedTinybase.useEntityList('modelFavorites')
  return useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites])
}

function RefreshButton() {
  const { catalog } = useTetra()
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await catalog.refresh({ force: true })
    } finally {
      setLoading(false)
    }
  }, [catalog])

  return (
    <Button
      aria-label="Refresh model list"
      disabled={loading}
      onClick={() => {
        void refresh()
      }}
      size="icon"
      title="Refresh model list"
      variant="ghost"
    >
      <RotateCcwIcon className={cn(loading && 'animate-spin')} />
    </Button>
  )
}

function ModelPreview({
  className,
  onOpen,
  value,
}: {
  className?: string | undefined
  onOpen: () => void
  value: string
}) {
  const currentModel = typedTinybase.useEntity('languageModels', value)
  const label = currentModel?.name ?? (value === '' ? 'Select model' : value)

  return (
    <Button className={cn('justify-start', className)} onClick={onOpen} variant="outline">
      {currentModel !== null && <ModelSelectorLogo provider={currentModel.provider} />}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </Button>
  )
}

function FavoriteButton({
  isFavorite,
  onToggleFavorite,
}: {
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  return (
    <Button
      aria-label={isFavorite ? 'Remove model from favorites' : 'Add model to favorites'}
      onClick={(event) => {
        event.stopPropagation()
        onToggleFavorite()
      }}
      size="icon-sm"
      title={isFavorite ? 'Remove model from favorites' : 'Add model to favorites'}
      variant="ghost"
    >
      <StarIcon className={cn(isFavorite && 'fill-current')} />
    </Button>
  )
}

function CopyModelIdButton({ modelId }: { modelId: string }) {
  return (
    <Button
      aria-label={`Copy ${modelId}`}
      onClick={(event) => {
        event.stopPropagation()
        void navigator.clipboard.writeText(modelId)
      }}
      size="icon-sm"
      title="Copy model id"
      variant="ghost"
    >
      <CopyIcon />
    </Button>
  )
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn(
        'rounded-md px-2',
        active && 'border-ring bg-background text-foreground ring-ring/50 ring-1',
      )}
      onClick={onClick}
      variant={active ? 'outline' : 'secondary'}
    >
      {children}
    </Button>
  )
}

function ModalityBadges({ label, modalities }: { label: string; modalities: string[] }) {
  return (
    <span className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-1">
      <span className="text-muted-foreground">{label}</span>
      {modalities.length === 0 ? (
        <span>
          <Badge className="h-4 rounded-sm px-1 font-normal" variant="outline">
            none
          </Badge>
        </span>
      ) : (
        <span className="flex min-w-0 flex-wrap gap-1">
          {modalities.map((modality) => (
            <Badge className="h-4 rounded-sm px-1 font-normal" key={modality} variant="outline">
              {formatModality(modality)}
            </Badge>
          ))}
        </span>
      )}
    </span>
  )
}

function ModelCapabilities({ model }: { model: LanguageModel }) {
  return (
    <div className="text-muted-foreground flex items-start gap-2 text-xs leading-5">
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span>Context {formatContextLength(model.contextLength)}</span>
        <ModalityBadges label="Input" modalities={model.inputModalities} />
        <ModalityBadges label="Output" modalities={model.outputModalities} />
      </div>
    </div>
  )
}

function ModelDateFact({ model }: { model: LanguageModel }) {
  return (
    <div className="text-muted-foreground text-xxs flex items-start gap-2 leading-4">
      <CalendarDaysIcon className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0">
        Release date: {formatUpstreamCreatedAt(model.upstreamCreatedAt)}
      </span>
    </div>
  )
}

function ModelCard({
  favorite,
  model,
  onSelect,
  onToggleFavorite,
  selected,
}: {
  favorite: boolean
  model: LanguageModel
  onSelect: () => void
  onToggleFavorite: () => void
  selected: boolean
}) {
  return (
    <div
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'border-border border-b border-l-2 border-l-transparent px-4 py-2.5 transition-colors last:border-b-0',
        selected && 'border-l-ring bg-muted/35',
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
              <ModelSelectorLogo className="size-4" provider={model.provider} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  aria-label={`Select ${model.name}`}
                  className="h-auto min-w-0 justify-start px-0 py-0 text-left text-sm font-medium hover:bg-transparent"
                  onClick={onSelect}
                  variant="ghost"
                >
                  <span className="min-w-0 truncate">{model.name}</span>
                </Button>
                {selected && (
                  <Badge className="gap-1" variant="secondary">
                    <CheckIcon className="size-3" />
                    Selected
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                {model.id}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:pl-12">
            <ModelCapabilities model={model} />
            <ModelDateFact model={model} />
          </div>
        </div>
        <div className="flex items-start justify-end gap-1 sm:pt-1">
          <FavoriteButton isFavorite={favorite} onToggleFavorite={onToggleFavorite} />
          <CopyModelIdButton modelId={model.id} />
          <Button
            aria-label={selected ? `${model.name} selected` : `Use ${model.name}`}
            disabled={selected}
            onClick={onSelect}
            size="icon-sm"
            title={selected ? 'Selected model' : 'Use model'}
            variant={selected ? 'secondary' : 'ghost'}
          >
            <CheckIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ModelPreviewButton({
  className,
  onOpen,
  value,
}: {
  className?: string | undefined
  onOpen: () => void
  value: string
}) {
  return <ModelPreview className={className} onOpen={onOpen} value={value} />
}

export function ModelPickerSheet({
  onOpenChange,
  onValueChange,
  open,
  value,
}: {
  onOpenChange: (open: boolean) => void
  onValueChange: (modelId: string) => void
  open: boolean
  value: string
}) {
  const { helpers } = useTetra()
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<ModelSortMode>('latest')
  const favoriteIds = useFavoriteIds()
  const groups = useModelGroups({ filter, query, sortMode })

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex flex-col"
        showCloseButton={false}
        style={{ maxWidth: 'min(100vw, 760px)', width: 'min(100vw, 760px)' }}
      >
        <div className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-2">
          <SheetTitle className="px-2 text-xs font-medium">Model selection</SheetTitle>
          <SheetClose
            render={
              <Button
                aria-label="Close model selection"
                size="icon-sm"
                title="Close model selection"
                variant="ghost"
              />
            }
          >
            <XIcon />
          </SheetClose>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-b p-3">
          <div className="flex items-center gap-2">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                onChange={(event) => {
                  setQuery(event.currentTarget.value)
                }}
                placeholder="Search for a model"
                value={query}
              />
            </InputGroup>
            <RefreshButton />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {MODEL_FILTERS.map((modelFilter) => (
              <FilterChip
                active={filter === modelFilter.value}
                key={modelFilter.value}
                onClick={() => {
                  setFilter(modelFilter.value)
                }}
              >
                {modelFilter.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['latest', 'provider'] satisfies ModelSortMode[]).map((nextSortMode) => (
              <FilterChip
                active={sortMode === nextSortMode}
                key={nextSortMode}
                onClick={() => {
                  setSortMode(nextSortMode)
                }}
              >
                {nextSortMode === 'latest' ? 'Latest first' : 'Group by provider'}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              No models found.
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <section key={group.heading ?? 'models'}>
                  {group.heading !== null && (
                    <div className="bg-background/95 text-xxs text-muted-foreground sticky top-0 z-10 border-b px-4 py-2 font-medium uppercase">
                      {group.heading}
                    </div>
                  )}
                  {group.models.map((model) => (
                    <ModelCard
                      favorite={favoriteIds.has(model.id)}
                      key={model.id}
                      model={model}
                      onSelect={() => {
                        onValueChange(model.id)
                        onOpenChange(false)
                      }}
                      onToggleFavorite={() => {
                        if (favoriteIds.has(model.id)) {
                          helpers.typedStore.tables.modelFavorites.deleteRow(model.id)
                          return
                        }
                        helpers.typedStore.tables.modelFavorites.setRow(model.id, {
                          createdAt: Date.now(),
                        })
                      }}
                      selected={value === model.id}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ModelPicker({
  className,
  onValueChange,
  value,
}: {
  className?: string | undefined
  onValueChange: (modelId: string) => void
  value: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ModelPreviewButton
        className={className}
        onOpen={() => {
          setOpen(true)
        }}
        value={value}
      />
      <ModelPickerSheet
        onOpenChange={setOpen}
        onValueChange={onValueChange}
        open={open}
        value={value}
      />
    </>
  )
}

export function SessionModelPickerSheet({
  onOpenChange,
  open,
  sessionId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  sessionId: string
}) {
  const [modelId, setModelId] = typedTinybase.useCellState('sessionConfigs', sessionId, 'modelId')

  return (
    <ModelPickerSheet
      onOpenChange={onOpenChange}
      onValueChange={(nextModelId) => {
        setModelId(nextModelId)
      }}
      open={open}
      value={modelId ?? ''}
    />
  )
}
