import { CheckIcon } from 'lucide-react'
import { useState } from 'react'

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
} from '@/components/ai-elements/model-selector'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useModels } from './models'

interface ModelPickerProps {
  className?: string
  onValueChange: (modelId: string) => void
  value: string
}

export function ModelPicker({ className, onValueChange, value }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const { models, loading } = useModels()

  // Extract provider slug from model id (e.g. "openai/gpt-4o-mini" → "openai")
  const [providerSlug = ''] = value.split('/')

  // Resolve display name for current value
  const currentModel = models.flatMap((g) => g.models).find((m) => m.id === value)

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={<Button variant="outline" className={cn('justify-start', className)} />}
      >
        <ModelSelectorLogo provider={providerSlug} />
        <ModelSelectorName>{currentModel?.name ?? value}</ModelSelectorName>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>
            {loading ? 'Loading models...' : 'No models found.'}
          </ModelSelectorEmpty>
          {models.map((group) => (
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
