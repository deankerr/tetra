# Session Rows Do Not Store Thread Focus

Session rows do not store `activeThreadId`, `activeMessageId`, or another durable thread-focus pointer. Focus is caller-owned view or continuation state, while `session.getThread()` provides a content-derived default from the newest created leaf when no focus is supplied. We chose this so synchronized clients do not move their UI focus just because another client navigated to a different path.
