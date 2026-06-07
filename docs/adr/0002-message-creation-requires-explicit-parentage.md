# Message Creation Requires Explicit Parentage

Transcript message creation requires callers to provide `parentMessageId`, using `null` for root-level messages. Transcripts validates parent ownership, but it does not infer parentage from session state, UI focus, role, run semantics, or an active thread. We chose this because continuation, regeneration, editing, CLI flows, web views, and agent workflows can all choose parents for different reasons, and hiding that choice inside transcript storage would recreate the durable active-thread assumption.
