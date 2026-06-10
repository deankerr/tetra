# Session Rows Do Not Store Thread Focus

Session rows do not store `activeThreadId`, `activeMessageId`, `threadAnchorMessageId`, or another durable thread-focus pointer. Thread anchors are caller-owned view or continuation state. When a surface has no anchor yet, it may initialize one from the newest-created leaf, but core transcript actions should operate on explicit message ids. We chose this so synchronized clients do not move their UI focus just because another client navigated to a different path.
