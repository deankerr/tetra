# Tetra

Local-first LLM chat app for power users, built on [TinyBase](https://tinybase.org). It's a testbed for using a reactive, in-memory database as the state layer between an agent runtime and its UI — where inference streams survive navigation, sessions run concurrently, and the runtime has no React dependency.

## Why

Most chat UIs couple the inference stream to the React lifecycle: navigating away kills the request, switching sessions disrupts in-flight generation, and component state is the source of truth. Tetra inverts that. The runtime writes streaming snapshots into TinyBase; the UI is a pure reader. A request started in one session keeps running when you leave it, and every surface — web, CLI, another tab, another device — sees the same state converge.

It is a working chat app, but the real subject is the foundation underneath it: sessions as durable message trees, run configuration as a first-class shared recipe, and a tool/sub-agent runtime that grows from the same primitives.

## Architecture

```text
Consumer actions  ──►  Runtime  ──►  Inference
Consumer reads    ◄──  TinyBase  ◄──  Runtime writes
```

Consumers call runtime commands for user intentions and read from TinyBase for reactive state. The runtime has no React dependency; the inference adapter has no TinyBase dependency. That decoupling is what lets active requests survive unmounts and remounts.

Bun monorepo:

| Workspace | Role |
| --- | --- |
| `apps/web` | TanStack Router + Vite SPA, with a Tauri desktop runtime |
| `apps/cli` | Bun CLI frontend, tracking the web feature set |
| `apps/worker` | Cloudflare Worker + Durable Object sync backend |
| `packages/core` | UI-agnostic app logic: sessions, run/inference runtime, run configs, transcripts, prompts, tools |
| `packages/schemas` | TinyBase store definitions, indexes, and row types |
| `packages/tinydb` | Reusable typed TinyBase `db`: zod-derived collections, inferred queries, values, React hooks |
| `packages/credentials` | Credential registry and local key storage |
| `packages/tools-exa` | Exa search tool integration |
| `packages/ui` | shadcn / AI Elements component library |
| `packages/config` | Shared base tsconfig |

### State and sync

TinyBase is the local, durable, reactive state between frontend and runtime — reads are synchronous, with no network round-trip. The shared library store is *mergeable* (CRDT), so one shape serves three layers: local persistence (localStorage / IndexedDB), same-origin tab convergence over BroadcastChannel, and optional cross-device sync over the Worker WebSocket (Durable Object + SQLite storage). Provider secrets are local host state, never persisted domain data.

### Sessions as message trees

A session is a durable tree of messages linked by parent, not a linear transcript. Threads (root-to-leaf paths), fork points, and continuations are *derived views* over that tree rather than stored entities — which makes branching, regeneration, and manual transcript editing first-class. See `CONTEXT.md` for the domain language.

## Inference

OpenRouter is the sole inference provider, via the AI SDK. Users bring their own key; it is stored locally and never persisted as domain data.

## Stack

TypeScript on Bun with the OXC toolchain (oxlint + oxfmt). React 19, TanStack Router, Vite, Tailwind 4, shadcn/AI Elements, Tauri. TinyBase for state, the AI SDK + OpenRouter for inference, Zod at boundaries, Remeda for transforms, Cloudflare Workers + Durable Objects for sync.

## Status

A design-iteration prototype: no backwards-compatibility shims, no migrations, schemas change freely. The goal is exploring the primitives, not shipping to end users. See `VISION.md` for the roadmap and `CONTEXT-MAP.md` for the per-context documentation layout.

## Develop

```bash
bun install
bun run fix   # lint / format / type-aware autofix — the one check script
```
