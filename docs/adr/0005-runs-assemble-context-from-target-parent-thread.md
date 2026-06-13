# Runs Assemble Context From Target Parent Thread

`runs.generate({ targetMessageId })` assembles transcript context from the thread ending at the target message's parent. If the target has no parent, the transcript context is empty, and the target message itself is never included in its own context. Runs require the target message to have empty parts before generation starts; that readiness check belongs to Runs, not Transcripts.
