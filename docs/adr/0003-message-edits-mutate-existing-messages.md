# Message Edits Mutate Existing Messages

Tetra will initially model message edits as in-place mutations of an existing message's committed content or caller-authored metadata. Editing does not create a fork, replacement message, or run by itself; callers can append new children and start runs after an edit when they want new downstream output. We chose this because Tetra is not Git, and most transcript edits are expected to mean "make this message say this now" rather than "preserve another durable timeline."
