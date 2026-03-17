import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { getDataLayer } from '@/lib/core/data'
import { useAgent } from '@/lib/core/data/agents'
import { useSession } from '@/lib/core/data/sessions'
import { updateAgentConfig } from '@/lib/core/operations'

export function AgentPanel({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)

  if (session === null) {
    return null
  }

  return <AgentEditor agentId={session.agentId} />
}

function AgentEditor({ agentId }: { agentId: string }) {
  const agent = useAgent(agentId)

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
                updateAgentConfig(getDataLayer(), agentId, { model: event.target.value })
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
                updateAgentConfig(getDataLayer(), agentId, { systemPrompt: event.target.value })
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
