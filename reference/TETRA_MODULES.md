# Tetra Modules

Working proposal for a minimum viable architectural upgrade.

This is intentionally conceptual. It is not a formal ADR and not a complete schema migration plan.

## Guiding Claim

The data model is not a module.

The model lives throughout the modules: in their terms, schemas, interfaces, invariants, and runtime behavior. A persistence package can compose tables and instantiate TinyBase, but it should not become the place where every domain concept goes to become anonymous.

The current `@tetra/store` package is mostly mechanical:

- create the TinyBase store,
- define current tables,
- define indexes,
- load snapshots,
- parse a few config objects.

That mechanical role may survive as a persistence kernel or disappear behind module-owned adapters. Either way, the app model should be owned by the modules that understand the concepts.

## Minimum Viable Upgrade

Use AI SDK `UIMessage` as the canonical transcript/message shape.

`UIMessage` is already extendable through:

- message metadata,
- custom data parts,
- typed tool parts,
- file parts,
- source parts,
- provider metadata.

We should not project away from `UIMessage` only to rebuild a nearby shape ourselves.

The breaking change is not "replace `UIMessage`." The breaking change is:

> A request may emit durable data that is not part of the assistant message stream.

Message parts remain for UI-visible message state. Request emissions, artifacts, tool execution records, model step records, context manifests, and cost accounting do not all need to be embedded in `messages.parts`.

## Proposed Flow

```txt
User message
  -> request runtime
  -> context assembler
  -> inference stream
  -> tool executions
  -> request emissions
  -> artifacts
  -> assistant UIMessage
```

The assistant message is one output of the request. It is not the whole request.

## Module: Transcript

Owns human-visible conversation state.

The transcript should be compact, editable, and easy to render. It may reference execution data, but it should not own every raw execution payload.

### Responsibilities

- Sessions.
- Ordered messages.
- UI-visible message metadata.
- Transcript editing later.
- Rendering-friendly message shape.

### Not Responsibilities

- Raw tool payload storage.
- Provider-call step accounting.
- Context budgeting.
- Tool execution lifecycle.

### Proposed Tables

```ts
const sessionSchema = z.object({
  id: z.string(),
  activeProfileId: z.string().optional(),
  createdAt: z.number(),
  lastSeq: z.number(),
  parentSessionId: z.string().optional(),
  spawnRequestId: z.string().optional(),
  title: z.string(),
  updatedAt: z.number(),
})
```

```ts
const messageSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  sessionId: z.string(),
  seq: z.number(),
  uiMessage: z.custom<TetraUIMessage>(),
  updatedAt: z.number(),
})
```

Invariant: `message.id === message.uiMessage.id`.

### Proposed Types

```ts
type TetraUIMessage = UIMessage<TetraMessageMetadata, TetraDataParts, TetraUITools>
```

```ts
type TetraMessageMetadata = {
  createdAt: number
  requestId?: string
  updatedAt: number
}
```

```ts
type TetraDataParts = {
  artifact: {
    artifactId: string
    charCount?: number
    mediaType?: string
    title?: string
  }
}
```

## Module: Request Runtime

Owns user-initiated runs and the request lifecycle.

A request can contain several model steps and several tool executions. The request is the orchestration boundary, not the provider-call boundary.

### Responsibilities

- Request status.
- Request configuration snapshot.
- Linking user message to assistant message.
- Model step lifecycle.
- Request-level totals derived from steps.
- Request emissions.
- Restart/interruption behavior.

### Not Responsibilities

- Provider-specific inference details.
- Tool implementation details.
- Raw artifact storage.
- UI rendering.

### Proposed Tables

```ts
const requestSchema = z.object({
  id: z.string(),
  assistantMessageId: z.string(),
  completedAt: z.number().optional(),
  configSnapshot: requestConfigSchema,
  createdAt: z.number(),
  errorMessage: z.string().optional(),
  messageId: z.string(),
  sessionId: z.string(),
  startedAt: z.number().optional(),
  status: z.enum(['pending', 'running', 'completed', 'error', 'aborted']),
  totalCost: z.number().optional(),
  totalUsage: z.unknown().optional(),
})
```

```ts
const requestStepSchema = z.object({
  id: z.string(),
  completedAt: z.number().optional(),
  contextManifestId: z.string().optional(),
  cost: z.number().optional(),
  createdAt: z.number(),
  errorMessage: z.string().optional(),
  finishReason: z.string().optional(),
  modelId: z.string(),
  providerId: z.string(),
  providerMetadata: z.unknown().optional(),
  requestId: z.string(),
  startedAt: z.number().optional(),
  status: z.enum(['pending', 'running', 'completed', 'error', 'aborted']),
  stepNumber: z.number(),
  usage: z.unknown().optional(),
})
```

```ts
const requestEmissionSchema = z.object({
  id: z.string(),
  artifactId: z.string().optional(),
  createdAt: z.number(),
  kind: z.enum(['artifact-created', 'tool-output', 'message-update', 'provider-metadata']),
  payload: z.unknown().optional(),
  requestId: z.string(),
  stepId: z.string().optional(),
  visibility: z.enum(['internal', 'inspectable', 'message-visible']),
})
```

## Module: Inference

Owns the provider/AI SDK boundary.

Inference should not know TinyBase. It should speak in streams and events that runtime can persist.

### Responsibilities

- Convert app context into provider calls.
- Stream AI SDK UI message chunks or snapshots.
- Emit provider call boundaries.
- Emit usage/cost/provider metadata per model step.
- Preserve provider continuation metadata.

### Not Responsibilities

- Choosing what historical context to include.
- Persisting rows directly.
- Running app-specific tools outside the AI SDK tool boundary.

### Proposed Interface

```ts
type InferenceEvent =
  | { type: 'message-snapshot'; message: TetraUIMessage }
  | { type: 'step-start'; stepNumber: number; modelId: string; providerId: string }
  | { type: 'step-finish'; step: InferenceStepResult }
  | { type: 'finish'; result: InferenceRunResult }
  | { type: 'error'; error: Error }
```

```ts
type InferenceStepResult = {
  cost?: number
  finishReason?: string
  providerMetadata?: unknown
  stepNumber: number
  usage?: unknown
}
```

The current `toUIMessageStream` path can continue to exist, but it should not be the only durable event source.

## Module: Tools

Owns code-defined capabilities exposed to models.

Tools are better defined by code than by database rows. The database should record executions, not define behavior.

### Responsibilities

- Tool registry.
- Tool schemas.
- Tool execution.
- Tool output shaping.
- Tool-specific artifact policy.
- Tool-specific model-output mapping.

### Not Responsibilities

- Global context policy.
- Transcript storage.
- Provider usage/cost accounting.

### Proposed Tables

```ts
const toolExecutionSchema = z.object({
  id: z.string(),
  artifactIds: z.array(z.string()).default([]),
  completedAt: z.number().optional(),
  createdAt: z.number(),
  errorMessage: z.string().optional(),
  input: z.unknown(),
  modelOutput: z.unknown().optional(),
  outputForMessage: z.unknown().optional(),
  requestId: z.string(),
  startedAt: z.number().optional(),
  status: z.enum(['pending', 'running', 'completed', 'error']),
  stepId: z.string().optional(),
  toolCallId: z.string(),
  toolId: z.string(),
})
```

### Proposed Interface

```ts
type ToolRuntimeResult<ModelOutput, MessageOutput = ModelOutput> = {
  artifacts?: ArtifactDraft[]
  modelOutput: ModelOutput
  outputForMessage: MessageOutput
}
```

For Jina, the raw markdown can become an artifact while the model receives a summary or excerpt. The message can show a compact data part or tool result that references the artifact.

## Module: Artifacts

Owns durable app data that may be referenced by sessions, messages, tools, and future requests.

An artifact is not just a row. It is an interface for data the app can store, inspect, summarize, and selectively include in model context.

Uploaded documents are artifacts. Tool-originated documents are artifacts. Generated images can be artifacts. Long generated files can become artifacts.

### Responsibilities

- Durable content identity.
- Source/provenance.
- Content metadata.
- Raw content storage reference.
- Summaries/excerpts.
- Cross-session references.

### Not Responsibilities

- Deciding whether an artifact is included in a particular model call.
- Rendering a whole chat message.
- Running tools.

### Proposed Tables

```ts
const artifactSchema = z.object({
  id: z.string(),
  byteCount: z.number().optional(),
  charCount: z.number().optional(),
  contentRef: z.string(),
  createdAt: z.number(),
  excerpt: z.string().optional(),
  hash: z.string().optional(),
  kind: z.enum(['document', 'file', 'image', 'model-output', 'tool-output']),
  mediaType: z.string(),
  origin: z.unknown(),
  summary: z.string().optional(),
  title: z.string().optional(),
  tokenEstimate: z.number().optional(),
  updatedAt: z.number(),
})
```

```ts
const artifactLinkSchema = z.object({
  id: z.string(),
  artifactId: z.string(),
  createdAt: z.number(),
  ownerId: z.string(),
  ownerKind: z.enum(['session', 'message', 'request', 'request-step', 'tool-execution']),
  role: z.string(),
})
```

The first implementation can store content directly in TinyBase if that remains acceptable. `contentRef` leaves room for moving large payloads elsewhere later.

## Module: Context

Owns the translation from app state to model input.

We should not build a sophisticated compiler immediately, but we should introduce the port now. The first implementation can be simple and intentionally boring.

### Responsibilities

- Build model messages for a request step.
- Decide what messages and artifacts are included.
- Record what was omitted and why.
- Track approximate budget information.

### Not Responsibilities

- Persisting raw artifacts.
- Running inference.
- Tool execution.
- UI rendering.

### Proposed Tables

```ts
const contextManifestSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  modelId: z.string(),
  requestId: z.string(),
  stepId: z.string().optional(),
  tokenBudget: z.number().optional(),
  tokenEstimate: z.number().optional(),
})
```

```ts
const contextItemSchema = z.object({
  id: z.string(),
  artifactId: z.string().optional(),
  charCount: z.number().optional(),
  contextManifestId: z.string(),
  included: z.boolean(),
  messageId: z.string().optional(),
  omitReason: z.string().optional(),
  renderedTokenEstimate: z.number().optional(),
  sourceKind: z.enum(['message', 'artifact', 'system', 'tool-result-summary']),
  sourceRole: z.string().optional(),
})
```

### Proposed Interface

```ts
interface ContextAssembler {
  assemble(args: {
    modelId: string
    requestId: string
    sessionId: string
  }): Promise<AssembledContext>
}
```

```ts
type AssembledContext = {
  manifest: ContextManifestDraft
  modelMessages: ModelMessage[]
}
```

## Module: Profiles And Configuration

Owns reusable model/personality/tool defaults.

This can stay small initially, but request config should become a snapshot of a profile and local overrides rather than an opaque blob that accumulates meaning.

### Proposed Tables

```ts
const profileSchema = z.object({
  id: z.string(),
  archivedAt: z.number().optional(),
  createdAt: z.number(),
  description: z.string().optional(),
  modelId: z.string(),
  name: z.string(),
  providerOptions: z.record(z.string(), z.json()).optional(),
  systemPrompt: z.string().optional(),
  toolIds: z.array(z.string()).default([]),
  updatedAt: z.number(),
})
```

## Module: Persistence Kernel

Owns mechanical persistence.

This is the role the current `@tetra/store` package mostly plays. It should compose module-owned schemas and provide adapters, but it should not become the owner of app concepts.

### Responsibilities

- Instantiate the local database.
- Register module tables.
- Register indexes.
- Provide snapshot import/export.
- Provide low-level typed access helpers if useful.

### Not Responsibilities

- Defining what a request means.
- Defining what an artifact means.
- Deciding context policy.
- Owning all schemas in one file forever.

### Possible Shape

```ts
type TetraModule = {
  indexes?: IndexDefinition[]
  name: string
  tables?: Record<string, z.ZodType>
}
```

```ts
const tetraModules = [
  transcriptModule,
  requestRuntimeModule,
  artifactModule,
  toolRuntimeModule,
  contextModule,
  profileModule,
]
```

The exact database may remain TinyBase. The architecture should not depend on every concept being declared in a central store file.

## Module: Inspection

Owns derived, lossy, agent-friendly views of the local data.

Inspection output is not canonical. It can truncate, summarize, and join aggressively as long as it labels what happened.

### Responsibilities

- Snapshot loading.
- Table-led exports.
- Session-led joined exports.
- Known truncation markers.
- Size and usage summaries.

### Not Responsibilities

- Canonical retention policy.
- Runtime model context policy.
- Data migration.

## Cross-Cutting Concept: Provider Continuation State

Provider metadata can be necessary for continuation. Reasoning details are not merely display data.

The open question is whether exact provider continuation state should live:

- inside `UIMessage.parts.providerMetadata`,
- beside request steps,
- or in a separate provider-state record linked to messages/steps.

Minimum viable answer: keep it where AI SDK expects it, but treat inspection filtering as derived and lossy. Do not mutate canonical continuation data casually.

## Cross-Cutting Concept: Files And Images

`FileUIPart` should be supported as part of `TetraUIMessage`.

Images and files may be represented as:

- `FileUIPart` when they are message-visible,
- `Artifact` when they need durable app semantics,
- both, with a message part pointing to a data URL or artifact-backed URL.

Base64 strings are not inherently a TinyBase problem. The architectural issue is whether the file is transcript content, reusable artifact content, or both.

## Cross-Cutting Concept: Breaking Change Policy

Prototype mode means we can replace the schema directly.

The minimum viable upgrade can be breaking if it clarifies the architecture:

- Replace current message rows with `TetraUIMessage` rows.
- Replace request usage object with request/step-owned accounting.
- Move raw tool outputs out of message parts.
- Introduce artifacts before building a complex context compiler.

## Open Design Questions

- Is `UIMessage` the canonical message row, or does the row wrap it with session ordering?
- Do tool executions always create artifacts, or only when outputs cross a size/type threshold?
- Should artifact raw content initially live in TinyBase or a separate local content store?
- Should context manifests store full rendered model messages or just source references and omission decisions?
- Where should provider continuation metadata live long term?
- How much of request execution should be event-sourced versus row-updated?
- Should request emissions be persisted as a table, or are typed rows like `toolExecutions` and `artifacts` enough?
- How do partially completed tool executions and model steps survive app restart?
