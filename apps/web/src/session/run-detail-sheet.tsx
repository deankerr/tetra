import { summarizeSteps } from '@tetra/core'
import type { LibraryRows } from '@tetra/schemas/library'
import { CodeBlock } from '@tetra/ui/components/ai-elements/code-block'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { ScrollArea } from '@tetra/ui/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@tetra/ui/components/ui/sheet'
import { cn } from '@tetra/ui/lib/utils'
import { CopyIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'

import { libraryTinybase } from '@/store'

import { useRunSteps } from './usage-hooks'

type Run = LibraryRows['runs']
type Step = LibraryRows['steps']

// Run detail sheets subscribe directly to the run and step rows they render.
export function RunDetailSheet({
  onOpenChange,
  open,
  runId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  runId: string
}) {
  const detail = useRunDetail(runId)
  const copyDisabled = detail === null

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="grid grid-rows-[var(--header-height)_1fr]"
        showCloseButton={false}
        style={{ maxWidth: 'none', width: 'min(92vw, 900px)' }}
      >
        {/* Sheet header */}
        <div className="flex items-center justify-between gap-2 border-b px-2">
          <SheetTitle className="truncate px-2 text-xs font-medium">Run details</SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Copy run details JSON"
              disabled={copyDisabled}
              onClick={() => {
                if (detail === null) {
                  return
                }
                void navigator.clipboard.writeText(detail.json)
              }}
              size="icon-sm"
              title="Copy run details JSON"
              type="button"
              variant="ghost"
            >
              <CopyIcon />
            </Button>
            <SheetClose
              render={<Button aria-label="Close run details" size="icon-sm" variant="ghost" />}
            >
              <XIcon />
            </SheetClose>
          </div>
        </div>

        {detail === null ? (
          <MissingRun />
        ) : (
          <ScrollArea className="h-full min-h-0">
            <div className="flex flex-col gap-4 divide-y p-4">
              <RunOverview run={detail.run} />
              <RunUsage usage={detail.usage} />
              <RunConfigDetail config={detail.run.config} />
              <RunSteps steps={detail.steps} />
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}

// The sheet keeps derived usage next to the source rows for copy/export parity.
function useRunDetail(runId: string) {
  const run = libraryTinybase.useEntity('runs', runId)
  const steps = useRunSteps(runId)

  return useMemo(() => {
    if (run === null) {
      return null
    }

    const usage = summarizeSteps(steps)
    const json = stringifyJson({ run, steps, usage })

    return { json, run, steps, usage }
  }, [run, steps])
}

// Overview fields are row-level facts, not derived accounting.
function RunOverview({ run }: { run: Run }) {
  return (
    <DetailSection title="Run">
      <DataListGrid columns="two">
        <DataListItem
          label="Status"
          value={<RunStatusBadge status={run.status} />}
          valueClassName="font-sans"
        />
        <DataListItem label="Run ID" value={run.id} />
        <DataListItem label="Session ID" value={run.sessionId} />
        <DataListItem label="Target message ID" value={run.targetMessageId} />
        <DataListItem label="Created" value={formatDateTime(run.createdAt)} />
        <DataListItem label="Updated" value={formatDateTime(run.updatedAt)} />
        <DataListItem label="Terminal" value={formatTerminalTime(run.terminalAt)} />
        <DataListItem label="Duration" value={formatDuration(run)} />
      </DataListGrid>

      {run.errorMessage !== '' && (
        <DataListGrid>
          <DataListItem
            label="Error"
            labelClassName="text-destructive"
            value={run.errorMessage}
            valueClassName="text-destructive whitespace-pre-wrap"
          />
        </DataListGrid>
      )}
    </DetailSection>
  )
}

// Usage totals are derived from steps so streaming runs update as new records land.
function RunUsage({ usage }: { usage: ReturnType<typeof summarizeSteps> }) {
  return (
    <DetailSection title="Usage">
      <DataListGrid columns="three">
        <DataListItem label="Total tokens" value={formatOptionalTokens(usage.totalTokens)} />
        <DataListItem label="Input tokens" value={formatOptionalTokens(usage.inputTokens)} />
        <DataListItem label="Output tokens" value={formatOptionalTokens(usage.outputTokens)} />
        <DataListItem
          label="Reasoning tokens"
          value={formatOptionalTokens(usage.reasoningTokens)}
        />
        <DataListItem label="Cache read" value={formatOptionalTokens(usage.cacheReadTokens)} />
        <DataListItem label="Cache write" value={formatOptionalTokens(usage.cacheWriteTokens)} />
        <DataListItem label="Total cost" value={formatCurrency(usage.costTotal)} />
        <DataListItem label="Input cost" value={formatCurrency(usage.costInput)} />
        <DataListItem label="Output cost" value={formatCurrency(usage.costOutput)} />
      </DataListGrid>
    </DetailSection>
  )
}

// Config snapshots are loose JSON, so quick fields are best-effort and the blob stays visible.
function RunConfigDetail({ config }: { config: Run['config'] }) {
  return (
    <DetailSection title="Config snapshot">
      <DataListGrid columns="two">
        <DataListItem label="Model" value={formatConfigValue(config.modelId)} />
        <DataListItem label="Max messages" value={formatConfigValue(config.maxMessages)} />
        <DataListItem label="System prompt ID" value={formatConfigValue(config.systemPromptId)} />
        <DataListItem label="Tools" value={formatToolIds(config.toolIds)} />
      </DataListGrid>

      <JsonBlock title="Full config JSON" value={config} />
    </DetailSection>
  )
}

// Steps are shown as an itemized list because each provider response can differ in shape.
function RunSteps({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return (
      <DetailSection title="Steps">
        <DataListGrid>
          <DataListItem
            label="No steps recorded"
            value="The run has not persisted a model step yet."
            valueClassName="font-sans text-muted-foreground"
          />
        </DataListGrid>
      </DetailSection>
    )
  }

  return (
    <DetailSection title={`Steps (${steps.length})`}>
      <div className="flex flex-col gap-2" role="list">
        {steps.map((step) => (
          <StepDetail key={step.id} step={step} />
        ))}
      </div>
    </DetailSection>
  )
}

// Each step keeps normalized accounting, warnings, and raw provider fields together.
function StepDetail({ step }: { step: Step }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" role="listitem">
      <div className="flex min-w-0 items-center gap-2">
        <Badge className="rounded-xs font-mono" variant="secondary">
          step {step.stepNumber}
        </Badge>
      </div>

      <DataListGrid columns="two">
        <DataListItem label="Model" value={step.model} />
        <DataListItem label="Provider" value={step.provider} />
        <DataListItem label="Finish reason" value={step.finishReason} />
        <DataListItem label="Step ID" value={step.id} />
        <DataListItem label="Generation ID" value={step.generationId} />
        <DataListItem label="Message ID" value={step.messageId} />
        <DataListItem label="Created" value={formatDateTime(step.createdAt)} />
        <DataListItem label="Input tokens" value={formatOptionalTokens(step.usage.input.total)} />
        <DataListItem label="Output tokens" value={formatOptionalTokens(step.usage.output.total)} />
        <DataListItem
          label="Reasoning tokens"
          value={formatOptionalTokens(step.usage.output.reasoning)}
        />
        <DataListItem label="Total tokens" value={formatOptionalTokens(step.usage.total)} />
        <DataListItem label="Input cost" value={formatCurrency(step.cost.input)} />
        <DataListItem label="Output cost" value={formatCurrency(step.cost.output)} />
        <DataListItem label="Total cost" value={formatCurrency(step.cost.total)} />
      </DataListGrid>

      {step.warnings.length > 0 && <JsonBlock title="Warnings JSON" value={step.warnings} />}

      {hasJsonDetail(step.raw) && <JsonBlock title="Raw provider JSON" value={step.raw} />}
    </div>
  )
}

// Data list grids are purpose-built for dense run metadata and always wrap long values.
function DataListGrid({
  children,
  className,
  columns = 'one',
}: {
  children: ReactNode
  className?: string
  columns?: 'one' | 'two' | 'three'
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-1.5',
        columns === 'two' && 'sm:grid-cols-2',
        columns === 'three' && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </dl>
  )
}

// Data list items keep label/value relationships semantic while behaving like compact tiles.
function DataListItem({
  label,
  labelClassName,
  value,
  valueClassName,
}: {
  label: ReactNode
  labelClassName?: string
  value: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-md border border-transparent p-1.5">
      <dt className={cn('text-muted-foreground text-xs leading-snug', labelClassName)}>{label}</dt>
      <dd
        className={cn(
          'text-foreground font-mono text-xs leading-snug [overflow-wrap:anywhere]',
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  )
}

// Detail sections keep the sheet scannable without nesting cards inside cards.
function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-2 pb-2">
      <h2 className="px-1 text-xs font-medium">{title}</h2>
      {children}
    </section>
  )
}

// JSON blocks are collapsed by default so detailed blobs are available without dominating the list.
function JsonBlock({
  className,
  title,
  value,
}: {
  className?: string
  title: string
  value: unknown
}) {
  return (
    <details className={cn('overflow-hidden rounded-md border', className)}>
      <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs font-medium">
        {title}
      </summary>
      <CodeBlock
        className="rounded-none border-0 **:data-[slot=code-block-body-pre]:whitespace-pre-wrap"
        code={stringifyJson(value)}
        language="json"
      />
    </details>
  )
}

// Missing rows can happen if a message is deleted while its sheet is open.
function MissingRun() {
  return (
    <div className="text-muted-foreground flex min-h-0 items-center justify-center p-6 text-xs">
      Run details are no longer available.
    </div>
  )
}

// Status presentation mirrors message-level run status without adding another abstraction.
function RunStatusBadge({ status }: { status: Run['status'] }) {
  if (status === 'error') {
    return <Badge variant="destructive">{status}</Badge>
  }

  return (
    <Badge className="text-muted-foreground" variant="secondary">
      {status}
    </Badge>
  )
}

// Config cells are intentionally best-effort because run snapshots preserve loose JSON.
function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'n/a'
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? 'none' : value.map(String).join(', ')
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString()
  }

  return stringifyJson(value)
}

// Tool ids get their own formatter so an empty tool list reads differently from missing config.
function formatToolIds(value: unknown): string {
  if (!Array.isArray(value)) {
    return 'n/a'
  }

  return value.length === 0 ? 'none' : value.map(String).join(', ')
}

// Timestamp cells should be explicit because run data is often inspected after the fact.
function formatDateTime(value: number): string {
  return new Date(value).toLocaleString()
}

// Terminal time is absent until a run leaves the active status.
function formatTerminalTime(value: number): string {
  if (value === 0) {
    return 'n/a'
  }

  return formatDateTime(value)
}

// Durations prefer terminalAt but still show live elapsed time for active runs.
function formatDuration(run: Run): string {
  const end = run.terminalAt === 0 ? run.updatedAt : run.terminalAt
  const durationMs = Math.max(0, end - run.createdAt)

  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    durationMs / 1000,
  )}s`
}

// Token cells distinguish unavailable accounting from a recorded zero.
function formatOptionalTokens(value: number | undefined): string {
  if (value === undefined) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US').format(value)
}

// Cost cells use the same precision as the rest of the session UI.
function formatCurrency(value: number | undefined): string {
  if (value === undefined) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

// Empty raw objects do not add useful detail in the itemized step list.
function hasJsonDetail(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length > 0
  }

  return value !== undefined && value !== null
}

// JSON.stringify returns undefined for undefined, but CodeBlock expects a string.
function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'undefined'
}
