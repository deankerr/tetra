# Tetra

Tetra's shared product language across apps, packages, and core behavior.

## Language

**RunConfig**:
A recipe for starting a run: model, system prompt, selected tools, provider-specific options, and message selection. It is shared by app surfaces and core execution rather than owned by one UI.
_Avoid_: Settings, one-off overrides
