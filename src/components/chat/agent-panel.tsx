import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { updateAgent } from '@/lib/chat/commands'
import { useAgentRecord, useSessionRecord } from '@/lib/chat/react'

export function AgentPanel({ sessionId }: { sessionId: string }) {
  const session = useSessionRecord(sessionId)

  if (session === null) {
    return null
  }

  return <AgentEditor agentId={session.agentId} />
}

function AgentEditor({ agentId }: { agentId: string }) {
  const agent = useAgentRecord(agentId)

  if (agent === null) {
    return null
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Agent</CardTitle>
        <CardDescription>
          Edit the seeded agent to evaluate config-store ergonomics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field className="flex flex-col gap-2">
            <label className="font-medium text-xs/relaxed text-muted-foreground" htmlFor="model">
              Model
            </label>
            <Textarea
              id="model"
              onChange={(event) => {
                updateAgent(agentId, { model: event.target.value })
              }}
              rows={2}
              value={agent.model}
            />
          </Field>
          <Field className="flex flex-col gap-2">
            <label
              className="font-medium text-xs/relaxed text-muted-foreground"
              htmlFor="system-prompt"
            >
              System prompt
            </label>
            <Textarea
              id="system-prompt"
              onChange={(event) => {
                updateAgent(agentId, { systemPrompt: event.target.value })
              }}
              rows={6}
              value={agent.systemPrompt}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
