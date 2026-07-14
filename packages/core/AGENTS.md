# Core Design Notes

`@tetra/core` owns the local-first domain model: schema, typed TinyBase access, session/request/message mutations, runtime execution, and shared behavior used by both web and CLI.

## Claims

- Core should express domain moves, not UI workflows. Web and CLI can decide what messages to create; core should own the durable invariants once they do.
- Long-running work should have explicit handles for lifecycle, cancellation, and completion. Interrupted-run recovery is not implemented yet; it belongs in core when introduced. Avoid fire-and-forget as the durable shape.
- Async/external work, such as inference, catalog refresh, persistence, network tools, and future recovery, should use the same synchronous state APIs as everything else.
- Add abstractions only when they remove repeated TinyBase friction or concentrate a real invariant. Keep experimental code easy to delete.

## Notes

- `Runs` does not create messages - the caller has the ability to direct the output to the `message` it needs to.
