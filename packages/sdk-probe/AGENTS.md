# sdk-probe

Exploration scripts for the AI SDK. Not a library. Living documentation of the SDK's data shapes.

## Running

```bash
bun run --filter @tetra/sdk-probe streamtext-result
```

## Adding scripts

Add a new `.ts` file in `src/` and a corresponding entry in `package.json` scripts. Each script should:

- Clear `output/` at the start (`rmSync` + `mkdirSync`)
- Write one concern per file (don't bundle unrelated data)
- Document what is and isn't captured in comments

`output/` dir contents are gitignored - use bash/terminal tools to navigate.

## OpenRouter: `reasoning_details` behaviour

`reasoning_details` appears duplicated on every content part (`reasoning`, `tool-call`) **and** at the step level (`step.providerMetadata.openrouter.reasoning_details`). This is intentional — not a bug.

### Why it exists

Some providers (Anthropic Claude, Google Gemini) cryptographically sign their reasoning tokens. The signed `reasoning_details` must be echoed back verbatim in the assistant message on every follow-up request, or the provider rejects/ignores the reasoning context. OpenRouter normalises this across all backends by always emitting `reasoning_details`, even for providers that don't sign (e.g. DeepSeek V4 returns `format: "unknown"` with no signature).

### Why it's on every part

The AI SDK's `ModelMessage` format (used by `response.messages` for history) has no top-level metadata field — the only durable storage location is on the content parts themselves. The provider attaches the **full accumulated array** to each part so it survives serialisation through `response.messages`.

Recovery priority in `findFirstReasoningDetails()`: `tool-call` parts first, then `reasoning` parts.

### How follow-up messages use it

When building the next request's message history, the provider:

1. Reads `reasoning_details` from `providerOptions` on the assistant message (step-level path)
2. Falls back to scanning content parts (`tool-call` → `reasoning`)
3. Deduplicates and validates signatures — unsigned `anthropic-claude-v1`/`google-gemini-v1` entries are stripped with a console warning
4. Writes the final array onto the outgoing `assistant` message body sent to the API

### Practical consequence

For DeepSeek V4 (and similar providers), `reasoning_details` carry no signature and don't need to be echoed. The duplication on individual parts is noise. **Prefer `step.providerMetadata.openrouter.reasoning_details` for any reads** — that's the canonical step-level copy. Ignore `providerMetadata` on individual content parts unless you specifically need the signature for a signing provider.
