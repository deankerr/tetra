import type { CatalogEntities } from '@tetra/schemas/catalog'
import { ModelSelectorLogo } from '@tetra/ui/components/ai-elements/model-selector'
import { Button } from '@tetra/ui/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@tetra/ui/components/ui/input-group'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tetra/ui/components/ui/sheet'
import { cn } from '@tetra/ui/lib/utils'
import { RotateCcwIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentProps } from 'react'

import { useApp } from '@/app'
import { catalogReact, libraryReact } from '@/store'

import { ModelCard } from './model-card'

type ModelFilter = 'all' | 'audio' | 'file' | 'image' | 'starred' | 'text' | 'video'
type ModelSortMode = 'latest' | 'provider'
type LanguageModelRow = CatalogEntities['languageModels']

const MODEL_FILTERS = [
  { label: 'Starred', value: 'starred' },
  { label: 'All', value: 'all' },
  { label: 'Text', value: 'text' },
  { label: 'Images', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Files', value: 'file' },
] satisfies { label: string; value: ModelFilter }[]

function compareByLatest(left: LanguageModelRow, right: LanguageModelRow) {
  const latest = right.upstreamCreatedAt - left.upstreamCreatedAt
  if (latest !== 0) {
    return latest
  }

  const provider = left.providerName.localeCompare(right.providerName)
  if (provider !== 0) {
    return provider
  }

  const name = left.name.localeCompare(right.name)
  if (name !== 0) {
    return name
  }

  return left.id.localeCompare(right.id)
}

function compareByProvider(left: LanguageModelRow, right: LanguageModelRow) {
  const provider = normalizeProviderName(left).localeCompare(normalizeProviderName(right))
  if (provider !== 0) {
    return provider
  }

  const name = left.name.localeCompare(right.name)
  if (name !== 0) {
    return name
  }

  return left.id.localeCompare(right.id)
}

function matchesSearch(model: LanguageModelRow, query: string) {
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

function matchesFilter(model: LanguageModelRow, filter: ModelFilter, favoriteIds: Set<string>) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'starred') {
    return favoriteIds.has(model.id)
  }

  return [...model.inputModalities, ...model.outputModalities].includes(filter)
}

function normalizeProviderName(model: LanguageModelRow) {
  const providerName = model.providerName.toLowerCase()
  if (providerName.startsWith('~')) {
    return providerName.slice(1)
  }
  return providerName
}

function groupModelsByProvider(models: LanguageModelRow[]) {
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
  const models = catalogReact.languageModels.useAll()
  const favorites = libraryReact.modelFavorites.useAll()

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
  const favorites = libraryReact.modelFavorites.useAll()
  return useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites])
}

function RefreshButton() {
  const { modelCatalog } = useApp()
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      await modelCatalog.refresh({ force: true })
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
  const currentModel = catalogReact.languageModels.useGet(value)
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
  // Selected reads as the filled, prominent state; unselected sits back as a quiet outlined pill.
  return (
    <Button aria-pressed={active} onClick={onClick} variant={active ? 'default' : 'outline'}>
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
  const { stores } = useApp()
  const libraryStore = stores.library
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<ModelSortMode>('latest')
  const favoriteIds = useFavoriteIds()
  const groups = useModelGroups({ filter, query, sortMode })

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex flex-col overflow-hidden data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Model selection</SheetTitle>
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
        </SheetHeader>

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
                    <div className="bg-background text-xxs text-muted-foreground sticky top-0 z-40 border-b px-4 py-2 font-medium uppercase">
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
                          libraryStore.modelFavorites.delete(model.id)
                          return
                        }
                        libraryStore.modelFavorites.set(model.id, {
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
