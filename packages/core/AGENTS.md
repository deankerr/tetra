# Core Redesign Notes

This package is an experimental redesign space for Tetra's core. The structure will change often; keep this document conceptual rather than descriptive of the current files.

## Design Goal

TinyBase is the durable, synchronous substrate. Its synchronous queries and mutations are a major strength: most of core should be ordinary state reads and writes, not async actions.

The raw TinyBase API is also sharp enough that it should not be the interface most code thinks in. The redesign should make TinyBase access safe, typed enough, and pleasant, so higher-level modules can express domain mutations directly.

## Accessors

Use Accessors as the placeholder concept for table-shaped, row-oriented APIs around TinyBase.

Accessors exist to remove repeated TinyBase ceremony:

- checking whether rows exist before reading or mutating them
- turning raw rows into domain records with IDs
- validating structured cells such as model config
- hiding index lookup details
- centralising common timestamp and row-update patterns
- making transactions easy to read

Accessors are not service boundaries. They are not an isolation mechanism. They are a practical ergonomics layer over TinyBase.

## Modules

Modules should model domain moves over state. Most modules are synchronous query/mutation helpers around a domain such as sessions, prompts, or transcripts.

Modules may coordinate across tables when that is the clearest way to preserve a domain invariant. Do not contort code to enforce dependency-direction rules unless a real lifecycle or complexity problem appears.

The important distinction is not "which module may talk to which module"; it is whether raw TinyBase details are leaking into places that should be talking in domain terms.

## Actions

Async work should stay explicit and external where possible. In Convex terms, most of core should be mutations and queries; actions are the smaller set of operations that touch the outside world or long-running work.

Examples of action-like concerns:

- inference
- remote catalog refresh
- tool calls that use network APIs
- persistence activation
- recovery after external interruption

Keep these adaptable. They should use the synchronous state modules and Accessors rather than bypassing them.

## Runners

Use "Runners" as the working term for long-lived or async execution controllers. A Runner should be able to use the same query/mutation APIs as the rest of core.

Avoid fire-and-forget as the long-term shape. Prefer explicit handles that can expose lifecycle, cancellation, completion, and live state as the design matures.

## What To Optimize For

- Make good code easy to delete.
- Keep the state layer boring and synchronous.
- Prefer precise domain mutations over convenience facades.
- Let the design remain fluid while the package is experimental.
- Add abstractions only when they remove repeated TinyBase friction or concentrate a real invariant.
