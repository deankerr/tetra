import type { TetraSchemas } from '@tetra/core'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@tetra/ui/components/ai-elements/model-selector'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import { CheckIcon, ImageIcon, Music2Icon, RotateCcwIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import * as UiReact from 'tinybase/ui-react/with-schemas'

import { useTetra } from '@/tetra-provider'

// oxlint-disable-next-line no-unsafe-type-assertion -- TinyBase WithSchemas pattern
const store = UiReact as unknown as UiReact.WithSchemas<TetraSchemas>

interface Model {
  contextLength: number
  createdAt: number
  id: string
  inputModalities: string[]
  name: string
  outputModalities: string[]
  provider: string
  providerName: string
  supportedParameters: string[]
}

interface ModelGroup {
  displayName: string
  models: Model[]
  provider: string
}

function deriveGroups(table: ReturnType<typeof store.useTable<'models'>>): ModelGroup[] {
  const all: Model[] = []

  for (const [id, row] of Object.entries(table)) {
    // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
    const outputModalities = row.outputModalities as string[]
    if (!outputModalities.includes('text')) {
      continue
    }

    all.push({
      contextLength: row.contextLength,
      createdAt: row.createdAt,
      id,
      // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
      inputModalities: row.inputModalities as string[],
      name: row.name,
      outputModalities,
      provider: row.provider,
      providerName: row.providerName || row.provider,
      // oxlint-disable-next-line no-unsafe-type-assertion -- array cell typed as AnyArray by TinyBase
      supportedParameters: row.supportedParameters as string[],
    })
  }

  const byProvider = new Map<string, Model[]>()
  for (const model of all) {
    const group = byProvider.get(model.providerName) ?? []
    group.push(model)
    byProvider.set(model.providerName, group)
  }

  for (const models of byProvider.values()) {
    models.sort((a, b) => b.createdAt - a.createdAt)
  }

  return [...byProvider.entries()]
    .map(([providerName, models]) => ({
      displayName: providerName,
      models,
      provider: models[0]?.provider ?? '',
    }))
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
}

function useModels() {
  const { models } = useTetra()
  const modelsTable = store.useTable('models')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await models.refresh({ force: true })
    } finally {
      setLoading(false)
    }
  }, [models])

  return { groups: deriveGroups(modelsTable), loading, refresh }
}

interface ModelPickerProps {
  className?: string
  onValueChange: (modelId: string) => void
  value: string
}

export function ModelPicker({ className, onValueChange, value }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const { groups, loading, refresh } = useModels()

  // Extract provider slug from model id (e.g. "openai/gpt-4o-mini" → "openai")
  const [providerSlug = ''] = value.split('/')

  // Resolve display name for current value
  const currentModel = groups.flatMap((g) => g.models).find((m) => m.id === value)

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={<Button variant="outline" className={cn('justify-start', className)} />}
      >
        <ModelSelectorLogo provider={providerSlug} />
        <ModelSelectorName>{currentModel?.name ?? value}</ModelSelectorName>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <div className="flex items-center gap-1 px-2 pt-2">
          <ModelSelectorInput placeholder="Search models..." className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              void refresh()
            }}
            title="Refresh model list"
          >
            <RotateCcwIcon className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
        <ModelSelectorList>
          <ModelSelectorEmpty>
            {loading ? 'Loading models...' : 'No models found.'}
          </ModelSelectorEmpty>
          {groups.map((group) => (
            <ModelSelectorGroup key={group.provider} heading={group.displayName}>
              {group.models.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onValueChange(model.id)
                    setOpen(false)
                  }}
                >
                  <ModelSelectorLogo provider={model.provider} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.inputModalities.includes('image') && (
                    <ImageIcon className="text-muted-foreground size-3" />
                  )}
                  {model.inputModalities.includes('audio') && (
                    <Music2Icon className="text-muted-foreground size-3" />
                  )}
                  {value === model.id && <CheckIcon />}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}
