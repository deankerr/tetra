# Data Model Review (Feature Goals vs. Current Architecture)

Date: 2026-05-13

## Scope

This review compares:

- Product and system intent in `VISION.md`.
- Runtime/package boundaries in `ARCHITECTURE.md`.
- Current persisted TinyBase schema in `packages/store/src/store.ts` and request config validation in `packages/store/src/request-config.ts`.

## Current Model Snapshot

Current tables:

- `sessions`: `title`, `config`, `lastSeq`, timestamps.
- `messages`: `sessionId`, `seq`, `role`, `parts`, timestamps.
- `requests`: `sessionId`, `messageId`, `assistantMessageId`, `config`, `status`, `errorMessage`, `createdAt`.

Current indexes:

- messages ordered by `sessionId + seq`
- requests grouped by `sessionId` and sorted by `createdAt` descending
- request lookup by `assistantMessageId`

## Strong Alignment

1. **Core turn persistence is correctly first-class.**
   - The architecture expects a persisted request entity with config snapshots.
   - The `requests` table already stores request status and `config` snapshots.

2. **Runtime/UI decoupling is represented well.**
   - `messages.parts` and request status support streaming updates independent of UI mount state.

3. **Boundary validation exists for execution config.**
   - `parseRequestConfig` ensures runtime validates stored config at execution boundaries.

## Gaps vs Feature Goals

### 1) Agent/Assistant profiles are missing as entities

Feature goal calls for named assistant profiles, but the model only has ad-hoc `sessions.config` and `requests.config` objects. This blocks:

- Reusable profile libraries.
- Explicit profile ownership/versioning.
- Delegation flows that target a stable assistant identity.

### 2) Prompt management is under-modeled

Prompt composition goals (fragments, assembly, preview) need explicit persisted prompt units. Today only `systemPrompt` exists in request config.

### 3) Tool registry selection is only implicit

`toolIds` exists inside request config, but there is no data entity for user-managed tool presets/sets, ordering, or parameterized tool configuration templates.

### 4) Context management is not represented

There is no entity for context selection artifacts (e.g., scoped message ranges, pinned memory, attached references) despite a feature goal centered on context assembly.

### 5) Sub-agent/session delegation lacks linkage primitives

Sub-session spawning is a stated goal, but sessions have no parent/child linkage and requests/messages have no delegation metadata.

### 6) Media/file support has no durable model

Messages have `parts` as an array, but there is no normalized asset entity for:

- file metadata,
- storage location,
- hash/dedupe,
- attachment lifecycle,
- references across messages/sessions.

### 7) Transcript editing provenance is absent

Manual editing is a goal. Current message model supports mutation, but does not preserve edit lineage or flags that distinguish generated vs user-edited assistant content.

## Recommended Model Expansion (Prototype-Mode Friendly)

No migrations are needed in prototype mode; favor direct schema replacement.

### Proposed new tables

- `assistants`
  - `name`, `description`, `baseConfig`, `createdAt`, `updatedAt`, `archivedAt?`
- `prompts`
  - reusable prompt fragments/templates with `name`, `content`, `kind`, `tags`
- `assistantPromptLinks`
  - ordered mapping of prompts to assistants (for composition)
- `toolProfiles`
  - named sets of tool IDs plus optional per-tool options
- `contexts`
  - context bundle metadata (`sessionId`, `name`, `strategy`, `maxTokensHint`)
- `contextItems`
  - ordered items composing a context (message refs, prompt refs, external refs)
- `assets`
  - file/media metadata (`mime`, `size`, `uri`, `sha256`, `createdAt`)
- `messageAssets`
  - attachment edges between messages and assets

### Proposed table changes

- `sessions`
  - add `assistantId` (current active assistant/profile)
  - add `parentSessionId` and `spawnRequestId` for delegation lineage
- `messages`
  - add `requestId?` (for generated assistant messages)
  - add `editedAt`, `editedBy`, `supersedesMessageId?`
  - optionally add `kind` (`chat`, `tool_call`, `tool_result`, `system_event`)
- `requests`
  - add `assistantIdSnapshot`
  - add `contextIdSnapshot?`
  - add `toolProfileIdSnapshot?`
  - add `completedAt`, `startedAt`, `abortReason?`, `usage?`

## Indexing Additions

- `sessionsByUpdatedAt`
- `messagesByRequest`
- `messagesByParent` (if supersede chains are used)
- `childSessionsByParentSession`
- `requestsByStatus`
- `assetsBySha256`
- ordered link indexes for `assistantPromptLinks` and `contextItems`

## Suggested Rollout Order

1. Add `assistants` + `sessions.assistantId` first (highest product leverage).
2. Add prompt entities and assistant prompt linking.
3. Add context entities used by request snapshots.
4. Add delegation lineage fields (`parentSessionId`, `spawnRequestId`).
5. Add media assets normalization if/when file UX is implemented.

## Architecture Fit Check

This expansion remains aligned with existing boundaries:

- `packages/store`: schema, indexes, and IDs only.
- `packages/runtime`: orchestration, snapshots, and execution semantics.
- `packages/inference`: still receives plain inputs; no TinyBase coupling.

## Open Decisions (Need Team Call)

- Should request snapshots store full denormalized config blobs only, or include both IDs and blobs for auditability + replay stability?
- Should message edit history be row-chained (`supersedesMessageId`) or emitted as separate event rows?
- Do we model tool calls/results as specialized message rows or as separate `toolExecutions` table?

## Bottom Line

Current schema is solid for baseline chat + streaming requests, but it is intentionally minimal relative to feature goals. The next schema iteration should introduce first-class assistant, prompt, context, and delegation entities so the runtime can evolve from “single-threaded chat turns” to “composable agent system” without overloading opaque config objects.
