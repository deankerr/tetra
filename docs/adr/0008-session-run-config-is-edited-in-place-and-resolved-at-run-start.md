# Session Run Config Is Edited In Place And Resolved At Run Start

Session run config is a single durable object cell that surfaces edit in place. Callers submit structured patches through `RunConfigs.update`, which owns the read, merge, complete-shape validation, and write. Runs resolve their effective config by requiring the session row and validating its schema-defaulted config when generation starts. Sparse stored cells recover through the session config table defaults; a missing session row is still a broken invariant.

There is no per-run override layer: `runs.generate` takes no config argument, and CLI flags like `-M` intentionally persist onto the Session RunConfig rather than acting as one-off overrides. A run row snapshots the resolved, complete RunConfig using the same typed schema for auditability. The durable RunConfig Default has a separate partial schema because it is a template for future sessions, not a historical snapshot.

`RunConfigs` owns session creation merges, structured updates, the new-session default, prompt unlinking, and run-start resolution. Reactive surfaces may subscribe to the config cell directly, but they do not reproduce its merge-and-write implementation. This keeps the lifecycle invariant local to one module while leaving reads naturally reactive.
