# Thread Is A Derived Message Path

Tetra will model a session transcript as parent-linked messages rather than durable thread rows. A thread is the focused path view from a chosen message to the root, reversed for display and context assembly; children of the chosen message are navigation choices rather than automatically part of the thread. We chose this over a `threads` table, subtree-shaped thread, synthetic root messages, and thread-local position fields because regeneration, transcript editing, and context assembly need flexible path selection more than named branch-like entities.
