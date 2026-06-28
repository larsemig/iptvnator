# Player-Controls Contract

This document is the canonical reference for IPTVnator's player-controls
architecture: the engine-agnostic **contract** every player implements, the
shared **default controls** component, the per-engine **adapters**, the embedded
MPV **docked** compositing path, the feature
**flags**, and the **background-playback readiness** of the design.

It is the deliverable for the epic
[A Clean, Extensible Player-Controls Architecture](../../.plans/player-controls-architecture/epic.md)
whose Definition of Done requires "a documented, tested player-controls
contract". The embedded MPV native/compositing internals are documented
separately in [embedded-mpv-native.md](./embedded-mpv-native.md); this file owns
the cross-engine controls layer.

## Why this exists

Originally the embedded MPV player fused five concerns in one ~743-line
component: native-surface lifecycle, bounds/compositing, the controls UI,
transient UI state, and recording display. Three coupled problems followed from
that: controls could not float over the video (a native-surface "airspace" limit
forces a shrink-and-dock approach), the controls UI could not be reused across
engines, and "video stops when you switch views" (background playback) was
blocked because the player was owned by a routed leaf that Angular destroys on
navigation.

The fix is a clean **contract** that separates *what controls exist and what
they command* from *how a given engine renders and composites*. Each engine
implements the contract its own way; the same default controls component drives
all of them; and the controls are presentation-only with no lifecycle
assumptions, so they can later be hosted above the router.

## Layered architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│   app-player-controls  (default, engine-agnostic controls component)  │
│   white controls · transparent-black → transparent gradient scrim     │
│   owns ONLY transient UI: menus, feedback, auto-hide, fullscreen,     │
│   keyboard shortcuts. Binds purely to a PlayerController.             │
└──────────────────────────────────────────────────────────────────────┘
                                  │ input.required<PlayerController>()
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          CONTRACT LAYER                                │
│   PlayerController  =  capabilities (Signal) + state (Signal)         │
│                        + commands (imperative, fire-and-forget)        │
│   Lifecycle-agnostic by design (see Background-playback readiness).   │
└──────────────────────────────────────────────────────────────────────┘
              ▲                                   ▲
   ┌──────────┘                       ┌───────────┘
   │ EmbeddedMpvControlsAdapter       │ WebVideoControlsAdapter
   │ (libmpv session → contract)      │ (<video> DOM/events → contract)
   ▼                                   ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│  ENGINE / SESSION LAYER     │   │  ENGINE / SESSION LAYER             │
│  EmbeddedMpvSessionController│   │  HTMLVideoElement driven by         │
│  → IPC → Electron main      │   │  Video.js / html5+hls.js / ArtPlayer│
│  process libmpv session     │   │  (route-scoped DOM)                 │
└────────────────────────────┘   └────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       COMPOSITING LAYER (MPV only)                     │
│   docked: native surface composited above WebContents, shrunk into    │
│   a strip-docked rect so the inline controls/menus stay DOM-reachable  │
└──────────────────────────────────────────────────────────────────────┘
```

## The contract

Defined in
`libs/ui/playback/src/lib/player-controls/player-controls.model.ts`.

```ts
interface PlayerController {
    readonly capabilities: Signal<PlayerControlsCapabilities>;
    readonly state: Signal<PlayerControlsState>;
    readonly commands: PlayerControlsCommands;
}
```

- **Capabilities** (`PlayerControlsCapabilities`) — booleans gating which
  controls render: `seek`, `volume`, `audioTracks`, `subtitles`,
  `playbackSpeed`, `aspectRatio`, `recording`, `fullscreen`,
  `seriesNavigation`. A control is only shown when its flag is true, so an
  engine exposes exactly what it supports. Defaults are all-`false`
  (`DEFAULT_PLAYER_CAPABILITIES`); each adapter turns on what it can do.
- **State** (`PlayerControlsState`) — a single reactive snapshot:
  `status` (`idle | loading | playing | paused | ended | error`),
  `statusMessage`, `stalled`, `positionSeconds`, `durationSeconds`, `isLive`,
  `canSeek`, `volume` (0..1), `audioTracks` / `subtitleTracks` (pre-labelled
  `PlayerTrack[]`), `subtitlesEnabled`, `playbackSpeed` + `speedPresets`,
  `aspectRatio` + `aspectPresets`, `recording` (`{ active, elapsedSeconds,
  message }`), `canPreviousEpisode`, `canNextEpisode`. The adapter pre-computes
  display labels and presets so the component never imports an engine type.
- **Commands** (`PlayerControlsCommands`) — imperative, fire-and-forget
  (`void`): `togglePlay`, `seekTo`, `seekBy`, `setVolume`, `setAudioTrack`,
  `setSubtitleTrack`, `setPlaybackSpeed`, `setAspectRatio`, `toggleRecording`.

Deliberately **not** on the contract: episode navigation and fullscreen.
Episode prev/next are `app-player-controls` **outputs**
(`previousEpisodeRequested` / `nextEpisodeRequested`) the host wires to its
playlist logic; fullscreen is a DOM affordance the controls component owns
against the player surface element. The contract has **no component-lifecycle
assumptions** — a controller may live above the router (see
[Background-playback readiness](#background-playback-readiness)).

### Fullscreen (`ControlsFullscreen`)

The controls run fullscreen against their own player-surface element via the
built-in `ControlsFullscreen` helper for every engine (docked embedded MPV and
all web players):

- `isFullscreen()` — the icon/label and cursor-hide read this.
- `canFullscreen()` — gates the fullscreen button's `disabled` state.
- `toggle()` — DOM `requestFullscreen()` / `exitFullscreen()` on the surface.

There is no external fullscreen delegate. The transparent-window overlay path
that once required one (a child window whose own host could not be fullscreened)
was deferred — see [MPV compositing](#mpv-compositing-docked) — so the docked
player simply fullscreens its real player root element directly.

Shared defaults live in
`libs/ui/playback/src/lib/player-controls/player-controls-defaults.ts`
(`DEFAULT_PLAYER_CAPABILITIES`, `DEFAULT_SPEED_PRESETS`,
`DEFAULT_ASPECT_PRESETS`, `createEmptyControlsState`).

## The default controls component (`app-player-controls`)

`libs/ui/playback/src/lib/player-controls/player-controls.component.ts`.

- Binds purely to `controller = input.required<PlayerController>()`. Reads
  `controller().capabilities()` / `controller().state()` and calls
  `controller().commands.*`. It has **no knowledge of any specific engine**, so
  the same component drives embedded MPV and the web players.
- Owns only **transient presentation state**, extracted into small collaborator
  classes (each independently unit-tested):
  `ControlsMenuState` (single-open popover machine),
  `ControlsFeedback` (transient flash overlay),
  `ControlsVisibility` (auto-hide), `ControlsFullscreen`,
  `ControlsVolume` (optimistic slider reconciled from state),
  `ControlsShortcuts` (Space/K, F, arrows, M, Escape),
  `ControlsSurface` (reveal/hover wiring), and `controls-view-model.ts`
  (derived display signals).
- **Look:** white controls over a **scrim** — a
  `linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 45%,
  transparent 100%)` so controls read clearly over video and fade to
  fully transparent at the top
  (`player-controls.component.scss`, `.player-controls__bar`).
- **Reveal hook:** `reveal()` is public so a host can re-show controls after
  auto-hide. `anyMenuOpen` is exposed so a compositor can react to open menus.

## Per-engine adapters

### EmbeddedMpvControlsAdapter

`libs/ui/playback/src/lib/embedded-mpv-player/embedded-mpv-controls.adapter.ts`.
Bridges the engine-specific `EmbeddedMpvSessionController` (libmpv session via
IPC) onto the contract. Computes capabilities from
`EmbeddedMpvSupport.capabilities` (so older addon binaries hide unsupported
controls), derives `state` from the session snapshot, maps session status to
`PlayerStatus`, and owns the recording-message lifecycle. The host component
pushes reactive context (`playback`, `seriesNavigation`, `recordingFolder`)
into the adapter's writable signals.

### WebVideoControlsAdapter

`libs/ui/playback/src/lib/player-controls/web-video-controls.adapter.ts`.
Bridges any `<video>`-backed web engine onto the contract by binding purely to
DOM/media APIs (works in the PWA — no `window.electron`), so one adapter drives
Video.js, html5+hls.js, and ArtPlayer. Track access is injected via
`WebVideoControlsOptions` so the adapter never imports hls.js/videojs/artplayer.
A `tick` signal bumped on every media event recomputes the reactive state.
Wired through `web-video-controls.host.ts`.

## MPV compositing: docked

The native MPV video surface paints outside the DOM stacking model, so DOM
controls cannot reliably z-index above it. The shipped approach is **docked**:
the inline `<app-player-controls>` render in the main window and the native
surface is composited ABOVE the WebContents (`NSWindowAbove`), shrunk into a
strip-docked rect so the controls strip and any open popover stay DOM-reachable.
The pure bounds provider (`embedded-mpv-compositor.ts`) computes that rect:
`HIDDEN_BOUNDS` while a MatDialog occludes the surface, a bottom cutout while a
popover is open, a `CONTROLS_DOCK_PX` reduction while the strip is visible, and
full-bleed when controls are hidden. See
[embedded-mpv-native.md → Shipped path: docked controls](./embedded-mpv-native.md#shipped-path-docked-controls)
for the native/IPC and cross-platform detail.

A full-bleed **transparent-window overlay** (option b) was evaluated and
deferred: it needs the global `transparent: true` BrowserWindow setting plus
extra macOS window chrome / click-through plumbing, a cost that outweighed the
benefit over the docked strip.

## Feature flags

| Flag | File | Default | Effect |
|---|---|---|---|
| `WEB_PLAYER_SHARED_CONTROLS_ENABLED` / `WEB_PLAYER_SHARED_CONTROLS` (token) | `player-controls/web-player-controls.flag.ts` | `false` | Rollout switch for the shared `app-player-controls` chrome on the web engines (Video.js / html5+hls.js / ArtPlayer). Default OFF: each keeps its built-in skin. The injectable token lets specs override per-test. |

## File map

```
libs/ui/playback/src/lib/player-controls/
├── player-controls.model.ts          # the contract (capabilities/state/commands)
├── player-controls-defaults.ts       # default caps + speed/aspect presets
├── player-controls.component.ts      # app-player-controls (default controls)
├── player-controls.component.html/scss
├── controls-menu-state.ts            # transient UI collaborators (each *.spec.ts)
├── controls-feedback.ts
├── controls-visibility.ts
├── controls-fullscreen.ts            # built-in DOM fullscreen
├── controls-volume.ts
├── controls-shortcuts.ts
├── controls-surface.ts
├── controls-view-model.ts
├── controls-format.utils.ts
├── web-video-controls.adapter.ts     # web <video> → contract
├── web-video-controls.host.ts        # wires web players to the adapter
├── web-player-controls.flag.ts       # WEB_PLAYER_SHARED_CONTROLS flag/token
└── index.ts                          # barrel

libs/ui/playback/src/lib/embedded-mpv-player/
├── embedded-mpv-controls.adapter.ts        # libmpv session → contract
├── embedded-mpv-session-controller.ts      # session lifecycle + IPC + bounds sync
├── embedded-mpv-player.component.ts         # view shell: native surface + docked controls
├── embedded-mpv-overlay-visibility.service.ts  # hides native view behind MatDialogs
└── embedded-mpv-compositor.ts               # pure docked bounds provider
```

## Background-playback readiness

> Subissue 04 (background playback) is **architecture-ready and documented but
> intentionally not built** in the current iteration. This section is the
> reference for what is already true and exactly what 04 must change. The
> persistent host is **not** present today: playback still stops on navigation.

### Current ownership (today)

- The controls component and both adapters are **presentation/translation only**
  and **component-scoped**. The MPV controller (`EmbeddedMpvSessionController`)
  and adapter are provided on `EmbeddedMpvPlayerComponent`, so Angular destroys
  them when the routed leaf is destroyed.
- The MPV **session itself lives in the Electron main process** and survives the
  renderer component — *unless it is explicitly disposed*. It **is** disposed
  today: `EmbeddedMpvSessionController.startSession(...)` returns a teardown
  closure that the component registers via `effect((onCleanup) => …)`. On route
  teardown that cleanup runs and calls
  `window.electron.disposeEmbeddedMpvSession(id)`. This single teardown closure
  is the only place the session is torn down on navigation — the contained seam
  04 must change.
- The **native surface** is decoupled from disposal: the docked compositor only
  positions / hides the native view (e.g. `HIDDEN_BOUNDS` behind a MatDialog) and
  **never disposes the session**. So "occlude while away, reveal on return" comes
  largely for free — only the bounds need re-attaching on return.

### Why 04 is contained (the seam)

1. **Contract is lifecycle-agnostic.** `PlayerController` has no
   component-lifecycle assumptions; the default controls component can be hosted
   by a persistent host above the router with no change.
2. **Controls are presentation-only.** They hold no playback session; moving
   their host does not move any session state.
3. **Compositing is isolated.** The pure bounds provider means re-attaching
   native bounds on return is a localized concern.
4. **Native surface already decoupled.** Hide ≠ dispose; the native view can be
   repositioned/hidden and re-shown without recreating the session.
5. **Session lives in the main process.** It keeps playing if the renderer
   simply stops disposing it.

### Concrete 04 change-list (when picked up)

- Introduce a **persistent player host** above the router that survives
  navigation.
- Provide the controller/adapter at **app/root scope** (not component scope) so
  they outlive the routed leaf.
- **Stop disposing the session on component teardown.** The disposal decision
  must move out of the route-scoped `onCleanup` teardown so the session is
  disposed only on **genuine stop / app quit** (and on playback replacement).
  The current single teardown closure in `startSession` is where this behavior
  is owned today.
- On **return** to the player view, re-attach native bounds via the docked
  compositor (no session recreation needed).
- Keep leak-safety: sessions are still disposed on genuine stop / app quit.

### Web-player limitation

DOM-based web players (`<video>` driven by Video.js / hls.js / ArtPlayer) are
**route-scoped**: Angular destroys the `<video>` element on navigation, so they
cannot keep playing in the background unless their host element is never
destroyed. Background playback is therefore **MPV-only** in practice; the web
engines would need a persistent host element or **picture-in-picture**, which is
out of scope for 04.

### Why no runtime change was made for 04 readiness

The disposal decision is already concentrated in exactly one isolated, clearly
commented teardown closure (`startSession`'s return) plus the explicitly
documented "hide ≠ dispose" rule for the native surface. Encapsulating it further would require
introducing the root-scoped host / ownership change that 04 explicitly defers,
which would add risk without behavioral benefit now. The seam is therefore left
exactly as-is and documented here. See also
[embedded-mpv-native.md → Power management](./embedded-mpv-native.md#power-management):
a persistent host must keep the `prevent-display-sleep` blocker semantics tied
to a *playing* session, not to the routed component.
