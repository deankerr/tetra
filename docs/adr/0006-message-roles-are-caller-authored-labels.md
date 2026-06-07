# Message Roles Are Caller-Authored Labels

Transcripts stores message roles as caller-authored labels and does not enforce chat-completion role rules. Provider-specific role projection, validation, and fallback behavior belong at run/context assembly boundaries, not in durable message control. We chose this because Tetra messages may represent user prompts, assistant outputs, critic notes, sub-agent traffic, tool observations, and other future workflows whose role semantics depend on the caller's perspective.
