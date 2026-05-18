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

function useGroupedLanguageModels() {
  const languageModelsTable = store.useTable('languageModels')
  const byProvider = Map.groupBy(
    Object.entries(languageModelsTable).map(([id, row]) => ({ ...row, id })),
    (lm) => {
      const providerName = lm.providerName.toLowerCase()
      if (providerName.startsWith('~')) {
        return providerName.slice(1)
      }
      return providerName
    },
  )

  return [...byProvider.entries()]
    .map(([providerName, models]) => ({
      models: models.toSorted((a, b) => a.name.localeCompare(b.name)),
      providerName,
    }))
    .toSorted((a, b) => a.providerName.localeCompare(b.providerName))
}

function RefreshButton() {
  const { models } = useTetra()
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await models.refresh({ force: true })
    } finally {
      setLoading(false)
    }
  }, [models])

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation()
        void refresh()
      }}
      title="Refresh model list"
    >
      <RotateCcwIcon className={cn('size-3.5', loading && 'animate-spin')} />
    </Button>
  )
}

export function ModelPicker({
  className,
  onValueChange,
  value,
}: {
  className?: string
  onValueChange: (modelId: string) => void
  value: string
}) {
  const [open, setOpen] = useState(false)
  const lmGroups = useGroupedLanguageModels()

  // Resolve display name for current value
  const currentModel = lmGroups.flatMap((g) => g.models).find((m) => m.id === value)

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={<Button variant="outline" className={cn('justify-start', className)} />}
      >
        <ModelSelectorLogo provider={currentModel?.provider ?? ''} />
        <ModelSelectorName>{currentModel?.name ?? value}</ModelSelectorName>
      </ModelSelectorTrigger>

      <ModelSelectorContent>
        <div className="flex items-center gap-1 p-1 pr-8 *:data-[slot=command-input-wrapper]:grow *:data-[slot=command-input-wrapper]:p-0">
          <ModelSelectorInput placeholder="Search models..." />
          <RefreshButton />
        </div>
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {lmGroups.map((group) => (
            <ModelSelectorGroup key={group.providerName} heading={group.providerName}>
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
