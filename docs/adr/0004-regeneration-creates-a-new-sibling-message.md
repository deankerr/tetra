# Regeneration Creates A New Sibling Message

Regeneration creates a new message with the same parent as the message being regenerated, then runs generation into that new target message. The original message and its descendants remain intact, and descendants are not copied onto the regenerated sibling. We chose this because regeneration is an alternate output, not an edit, and the parent-linked message tree can represent that alternate without durable thread rows.
