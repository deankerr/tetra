import type { RefObject } from 'react'
import { useState } from 'react'

import { Field, FieldGroup, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { InferenceConfig } from '@/lib/core/data/config'

type Props = {
  configRef: RefObject<InferenceConfig>
  initialConfig: InferenceConfig
}

export function SessionConfig({ configRef, initialConfig }: Props) {
  const [config, setConfig] = useState(initialConfig)

  const update = (next: InferenceConfig) => {
    setConfig(next)
    configRef.current = next
  }

  return (
    <FieldGroup>
      <Field>
        <FieldTitle>Model</FieldTitle>
        <Input
          onChange={(e) => {
            update({ ...config, modelId: e.currentTarget.value })
          }}
          placeholder="openai/gpt-4o-mini"
          value={config.modelId}
        />
      </Field>
      <Field>
        <FieldTitle>System Prompt</FieldTitle>
        <Textarea
          onChange={(e) => {
            update({ ...config, systemPrompt: e.currentTarget.value })
          }}
          placeholder="You are a helpful assistant."
          value={config.systemPrompt ?? ''}
        />
      </Field>
    </FieldGroup>
  )
}
