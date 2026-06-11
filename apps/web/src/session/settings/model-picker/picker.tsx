import type { Rows } from '@tetra/store-schema'
import { ModelSelectorLogo } from '@tetra/ui/components/ai-elements/model-selector'
import { Button } from '@tetra/ui/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@tetra/ui/components/ui/input-group'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@tetra/ui/components/ui/sheet'
import { cn } from '@tetra/ui/lib/utils'
import { RotateCcwIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentProps } from 'react'

import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

import { ModelCard } from './model-card'

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

function compareByLatest(left: Rows['languageModels'], right: Rows['languageModels']) {
  return (
    right.upstreamCreatedAt - left.upstreamCreatedAt ||
    left.providerName.localeCompare(right.providerName) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

function compareByProvider(left: Rows['languageModels'], right: Rows['languageModels']) {
  return (
    normalizeProviderName(left).localeCompare(normalizeProviderName(right)) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

function matchesSearch(model: Rows['languageModels'], query: string) {
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

function matchesFilter(
  model: Rows['languageModels'],
  filter: ModelFilter,
  favoriteIds: Set<string>,
) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'starred') {
    return favoriteIds.has(model.id)
  }

  return [...model.inputModalities, ...model.outputModalities].includes(filter)
}

function normalizeProviderName(model: Rows['languageModels']) {
  const providerName = model.providerName.toLowerCase()
  if (providerName.startsWith('~')) {
    return providerName.slice(1)
  }
  return providerName
}

function groupModelsByProvider(models: Rows['languageModels'][]) {
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

  const refresh = async () => {
    setLoading(true)
    try {
      await catalog.refresh({ force: true })
    } finally {
      setLoading(false)
    }
  }

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

export function ModelPickerButton({
  className,
  value,
  variant = 'outline',
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'value'> & { value: string }) {
  const currentModel = typedTinybase.useEntity('languageModels', value)
  const label = currentModel?.name ?? (value === '' ? 'Select model' : value)

  return (
    <Button className={cn('justify-start', className)} variant={variant} {...props}>
      {currentModel !== null && <ModelSelectorLogo provider={currentModel.provider} />}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
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
  const { typedStore } = useTetra()
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<ModelSortMode>('latest')
  const favoriteIds = useFavoriteIds()
  const groups = useModelGroups({ filter, query, sortMode })

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="data-[side=right]:sm:max-w-lg" showCloseButton={false}>
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
                          typedStore.tables.modelFavorites.deleteRow(model.id)
                          return
                        }
                        typedStore.tables.modelFavorites.setRow(model.id, {
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
