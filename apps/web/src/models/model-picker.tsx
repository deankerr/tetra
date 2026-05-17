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
import { useState } from 'react'

import { useModels } from './models'

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
