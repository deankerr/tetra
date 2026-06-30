# @tetra/web

The Tetra web frontend: a client-side Vite + React SPA (TanStack Router) over the local-first
TinyBase data layer. It ships as **two form-factors from one codebase**:

- **Web** — static SPA, deployed to Vercel.
- **Desktop** — the same SPA wrapped in a [Tauri](https://v2.tauri.app) v2 native window
  (`src-tauri/`). It adds no local-only functionality; it's the web app in a window, which is what
  makes the local-first / sync story tangible. See `src-tauri/` for the Rust shell.

Inference goes directly to OpenRouter from the client with user-supplied credentials. Remote sync
(optional) is a WebSocket to the Cloudflare Worker. Neither needs a server of our own at runtime.

## Prerequisites

- **Bun** (repo uses Bun workspaces) — `bun install` at the repo root.
- **Desktop only:** a Rust toolchain (`rustup`/`cargo`) and Xcode Command Line Tools
  (`xcode-select --install`). See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Develop

| Command                             | What it runs                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `bun run dev` (in `apps/web`)       | Vite dev server only; prefers **port 5299**, floats to the next free port if taken    |
| `bun run dev` (repo root)           | Same web dev server (`bun run --cwd apps/web dev`)                                    |
| `bun run tauri dev` (in `apps/web`) | Desktop shell — boots Vite, compiles the Rust crate, opens the native window with HMR |

`tauri dev` drives the web dev server itself through `beforeDevCommand`, so you don't start Vite
separately. The first Rust compile takes ~1 min; subsequent runs are fast. Frontend logs don't stream
to the terminal — open the in-window devtools (right-click → Inspect), or poll them on demand with
`node_modules/.bin/tauri-agent-tools console-monitor` (see the dev bridge note below).

## Build

| Command                               | Output                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `bun run build` (in `apps/web`)       | Static SPA → `apps/web/dist`                                                                                    |
| `bun run build:vercel` (repo root)    | What Vercel runs; SPA → `dist`, served with an `/index.html` rewrite (see `vercel.json`)                        |
| `bun run tauri build` (in `apps/web`) | Builds the SPA → `apps/web/dist-desktop`, then a release `Tetra.app` → `src-tauri/target/release/bundle/macos/` |

`tauri build` runs `bun run build:tauri` first (`beforeBuildCommand`), i.e. `vite build --mode desktop`,
which WebKit-targets the assets and writes them to `dist-desktop` — a **separate out-dir from the web
`dist`**, so a desktop build can no longer clobber what Vercel deploys. The bundle is currently
**app-only** (`bundle.targets: ["app"]`); add `"dmg"` when you want a distributable file. The `.app` is
**unsigned** — fine locally, but Gatekeeper will block it on another Mac until we add signing +
notarization.

## Configuration notes

- **Env** (`.env.local`, git-ignored): `VITE_SYNC_WORKER_URL` (the Worker `wss://` URL) and
  `VITE_SYNC_ENABLED`, **baked in at build time**. Web and desktop **deliberately share** this file —
  both point at the same remote sync target. Vite's mode env files (`.env.desktop`) could split them,
  but the real issue is that sync config is a build-time env var at all; see the remaining items.
- **Mode-driven config** (`vite.config.ts`) — one discriminator, the Vite **mode**. `--mode desktop`
  (baked into the `dev:tauri`/`build:tauri` scripts that Tauri's before-commands run) merges a small
  `desktop` slice onto the shared base; every other invocation (`vite dev`, `vite build`, Vercel) gets
  the shared base untouched. The desktop slice owns: the `dist-desktop` out-dir, the `safari13` WebKit
  build target, and the pinned dev port.
- **Port 5299** appears in two places that must agree: `vite.config.ts` (`server.port`) and
  `src-tauri/tauri.conf.json` (`devUrl`). `strictPort` is **on only under `--mode desktop`**: `tauri dev`
  pins 5299 and fails loudly on a collision — `devUrl` is static and Vite can't report back which port
  it floated to — while plain `vite dev`/preview leaves it unpinned and floats to the next free port
  across parallel worktrees.
- **`frontendDist: ../dist-desktop`** — Tauri embeds the desktop build output, which is now a different
  directory from the web `dist`; the two builds can't overwrite each other.
- **CSP is off** (`app.security.csp: null`). When we lock it down, `connect-src` must allow
  `https://openrouter.ai` (inference + model catalog) and the `wss://` Worker; most everything else
  can be `'self'` (KaTeX/shiki assets are bundled).
- **Capabilities** (`src-tauri/capabilities/default.json`) are just `core:default` — no fs/http/shell.
  The window-state plugin uses Rust-side auto-restore only, so it needs **no** `window-state:default`
  permission. Add it only if we ever drive window state from JS.
- **Identifier** `app.tetra.desktop` — also keys the WebKit data container (localStorage/IndexedDB),
  so dev and release share storage.
- **Window** opens 1200×800, centered, min 760×540; size/position persist across launches via
  `tauri-plugin-window-state`.
- **App icons** (`icons/`) derive from `public/favicon.svg` (the tetra mark on a zinc rounded tile).
  Regenerate by rasterizing a ≥1024px square PNG and feeding it to the Tauri CLI:
  `magick -background none public/favicon.svg -resize 1024x1024 /tmp/icon.png && bun run tauri icon /tmp/icon.png`
  (the generated `android/`+`ios/` dirs are removed — desktop-only target).
- **Dev inspection bridge** (`src-tauri/src/dev_bridge.rs`) — a vendored copy of the
  [`tauri-agent-tools`](https://github.com/cesarandreslopez/tauri-agent-tools) Rust bridge, wired into
  `lib.rs` behind `cfg!(debug_assertions)` so it's stripped from release builds. Under `tauri dev` it
  runs a localhost-only, token-authed HTTP server (token in `/tmp/tauri-dev-bridge-<pid>.token`) that
  lets the CLI inspect the live app: `node_modules/.bin/tauri-agent-tools probe | dom | eval |
screenshot --selector | storage | console-monitor | health`. Its extra deps (`tiny_http`, `tracing`,
  `rand`, `uuid`, `scopeguard`, `libc`) are dev-bridge-only. Re-sync the module by re-copying it from
  `node_modules/tauri-agent-tools/examples/tauri-bridge/src/dev_bridge.rs`; its unused sidecar helpers
  emit harmless dead-code warnings. If the app is killed (not quit), remove the stale token file.

## Layout

```
apps/web/
  src/              # React SPA (routes, store wiring, components)
  index.html        # SPA entry
  vite.config.ts    # shared base + `--mode desktop` slice
  dist/             # web build output (git-ignored)
  dist-desktop/     # desktop build output, embedded by Tauri (git-ignored)
  src-tauri/        # Rust desktop shell
    tauri.conf.json # window, bundle, build hooks
    Cargo.toml      # crate `tetra-desktop`, lib `tetra_lib`
    src/lib.rs      # Tauri builder + plugins + dev-bridge wiring
    src/dev_bridge.rs # vendored tauri-agent-tools dev bridge (debug-only)
    capabilities/   # permission sets
    icons/          # app icons (Tetra mark — see Configuration notes)
    target/         # Rust build output (git-ignored)
```

## Remaining things to look at (desktop)

Roughly in priority order:

- **Security pass** — define and enable the CSP (see above); revisit whether credentials should move
  from `localStorage` to OS-secure storage.
- **Vendored dev bridge** — `src-tauri/src/dev_bridge.rs` is kept verbatim from `tauri-agent-tools`
  (~1k lines, debug-only). Decide later whether to keep vendoring it as-is (easy re-sync, harmless
  dead-code warnings) or trim it to the endpoints we actually use.
- **Version source** — `tauri.conf.json` `version` is hardcoded `0.1.0`; nothing derives it.
- **Runtime sync config** — sync target + enabled flag are build-time `VITE_` envs, so web and desktop
  share `.env.local` and a `tauri build` bakes in whatever it held. A per-surface env split (`.env.desktop`)
  is the cheap patch, but the underlying weakness is that sync config is build-time at all; it should be
  runtime, user-authored state (like credentials). Fix that and the desktop/web env split is moot. Parked
  for now — sharing one remote sync target is currently the desired behavior.
- **Distribution** — code signing + notarization before the `.app`/`.dmg` can run on other Macs.
- **Cross-platform** — currently macOS-only; Windows/Linux targets would need CI.
