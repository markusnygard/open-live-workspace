# Open Live Modular Studio — Design Spec

> Repo: `github.com/markusnygard/open-live-modular-studio`
> Date: 2026-07-07

## 1. Motivation

The current `ControllerPage` is a monolithic 1098-line file that directly imports
every sub-panel, owns all toggle state, keyboard shortcuts, and modals. Adding a
panel requires editing this file in ~5 places. `AudioPanel.tsx` alone is 1392 lines.
The codebase will become unmaintainable as features grow.

Goal: a side-by-side alternative (`/studio-modular`) that runs against the same
backend/Strom/CouchDB, where every feature is an isolated module. Users choose
which studio they prefer. No existing functionality is lost. The old `/studio`
continues working unchanged.

## 2. What is a Module?

A module is a full vertical slice — it owns its UI, state, WS message handlers,
and API calls. It communicates with other modules only through a typed event bus
and a shared WS connection.

Directory structure:

```
frontend/src/modules/<name>/
  index.ts                  # Exports StudioModule descriptor
  <Name>Module.tsx          # React component (entry point)
  <name>.store.ts           # Zustand store (module-private)
  <name>.messages.ts        # WS handler registration + outbound types
  <name>.api.ts             # REST calls (optional)
  components/               # Internal UI components
```

Module descriptor interface:

```ts
interface StudioModule {
  /** Unique identifier, e.g. 'audio', 'controller' */
  id: string
  /** Which named slot this module appears in */
  slot: 'top' | 'pgm' | 'bottom'
  /** Display name in toggle bar and pane page */
  label: string
  /** Icon for toggle bar (ReactNode) */
  icon: ReactNode
  /** Show on first load? Persisted to localStorage after. */
  defaultVisible: boolean
  /** Whether user can open this module in a separate browser window */
  supportsPopout: boolean
  /** Pop-out window dimensions (defaults to 1280x720) */
  popoutSize?: { width: number; height: number }
  /** React component — receives shared context */
  component: React.FC<{ send: SendFn; productionId: string | null }>
  /** Standalone component for pop-out windows. Defaults to `component`. */
  standaloneComponent?: React.FC<{ send: SendFn; productionId: string | null }>
  /** Register WS inbound handlers when module mounts. Returns cleanup fn. */
  onRegister?: (ctx: ModuleCtx) => () => void
}

interface ModuleCtx {
  send: SendFn
  eventBus: EventBus
  productionId: string | null
}
```

Adding a module = create the directory, export a StudioModule, add one line to
the registry array. Zero changes to existing files.

## 3. Module Registry

`frontend/src/modules/registry.ts` — a single array:

```ts
export const STUDIO_MODULES: StudioModule[] = [
  multiviewer,    controller,   audio,
  pgm,            looks,        pip,
  mediaplayer,    timer,
  // Output modules
  srtStream,      efpStream,    recording,
  ndiOutput,      sdiOutput,
]
```

The `StudioShell` reads this array at startup. Visibility per module persisted to
`localStorage` as `ol-module-<id>-visible`. No god component.

## 4. Named Slots Layout

Same layout as current, but driven by registry:

```
┌──────────────────────────────────────────┐
│  Slot "top" (flex-fill)                  │  Stretches to fill height
│  = multiviewer                           │  above bottom row.
│                                          │
├───────────────────────┬──────────────────┤
│  Slot "pgm"           │ (corner)         │  Fixed 640x360,
│  = pgm monitor        │                  │  fullscreen toggle.
├───────────────────────┴──────────────────┤
│  Slot "bottom" (392px fixed height)      │  Horizontal flex row.
│  [controller] [fx] [pip] [media] [audio] │  Each module declares
│  [timer] [streams] [recording] [ndi] ... │  preferred min/max width.
└──────────────────────────────────────────┘

Header bar (fixed): production selector
                   + PGM/PVW tally + LIVE indicator
                   + module toggle icons (per slot)
                   + output status bar (stream/record indicators)
```

Each module declares its `slot` in its descriptor. The `SlotLayout` component
queries the registry for modules assigned to each slot and renders them. Toggle
icons are generated from the registry — no hardcoded `PANEL_ICONS` array.

## 5. Pop-Out Windows

Every module with `supportsPopout: true` can be opened in its own browser window.
The PanePage becomes generic:

```
Route:  /pane/:moduleId

PanePage:
  1. Reads moduleId from URL
  2. Looks up module in STUDIO_MODULES registry
  3. Renders module.standaloneComponent (or module.component if no standalone)
  4. Applies module.popoutSize for window dimensions
  5. Module gets its own WS connection via WsProvider
```

Pop-out trigger: each module's header in the slot layout has a pop-out button.

Module components render the same whether inline or popped out. For modules that
need different layout when standalone (e.g. audio panel fills the full window
height differently), they export a `standaloneComponent` override.

Supported pop-out modules:

| Module | Popout size | Standalone behavior |
|---|---|---|
| multiviewer | 1920x1080 | Full-window WHEP video |
| pgm | 1280x720 | Full-window PGM WHEP video |
| controller | 800x392 | Compact CUT/AUTO/DSK row |
| audio | 600x800 | Full-height channel strips |
| pip | 900x500 | Larger PiP editor canvas |
| mediaplayer | 400x300 | Playlist + transport only |
| timer | 400x150 | Large clock display |

## 6. Full Feature Parity

Every function in the current studio maps to the modular version:

| Current feature | Modular equivalent | Notes |
|---|---|---|
| Multiviewer WHEP video | multiviewer module | Same `useWebRTC` hook |
| PGM monitor WHEP video | pgm module | Same hook |
| Source buses (PGM/PVW rows) | controller module | SourceBusDual component |
| CUT, AUTO, FTB buttons | controller module | Same WS messages |
| Transition type chips | controller module | Per-transition type |
| DSK toggle | controller module | Same |
| Macro bar | controller module | Same |
| Keyboard shortcuts (Space/Enter/1-9/Shift+1-9) | controller module owns them | Global event listener in module |
| Audio channel strips | audio module | Same ChannelStrip component |
| VU meters / EBU meters | audio module | Same components |
| Peak readouts | audio module | Same |
| AFV (audio follows video) | audio module subscribes to `PGM_SOURCE_CHANGED` event | Event bus replaces poll |
| H/G/C/E processing popup | audio module | Same ProcessingPopup |
| Pan slider | audio module | Same |
| Faders (MAIN, AUX, GRP, Monitor) | audio module | Same custom fader |
| PFL/AFL | audio module | Same |
| Aux sends / Group sends | audio module | Same |
| Looks/FX per source | looks module | Same LooksPanel |
| PiP editor | pip module | Same PipPanel |
| Media player transport | mediaplayer module | Same MediaPlayerCard |
| Playlist browser + file add | mediaplayer module | Same |
| LOOP toggle | mediaplayer module | Same |
| Program clock / timer | timer module | Same TimerBar |
| Panel visibility toggles | Per-module toggle in header | Generated from registry |
| Production selector | Header bar | One `<select>` in shell |
| Controller options modal | controller module | Moved into module, same fields |
| Audio options modal (AFV ramp) | audio module | Moved into module |
| Source video/audio offsets | controller module | Moved into module |
| Fullscreen (F key) | per-module built-in | Each module decides |
| Pop-out to window | `/pane/:moduleId` | Generic PanePage |

Not changing / not losing:

- All WS message types — same format
- All Zustand store data shapes — same
- All REST API endpoints — same
- WHEP video playback — same `useWebRTC` hook
- Fader system (broadcast log taper) — same
- FaderDimsCtx (pop-out pane override) — same

## 7. Event Bus

A typed publish/subscribe in `lib/event-bus.ts`. Modules emit domain events; other
modules subscribe. No module imports another module.

```ts
type StudioEvent =
  | { type: 'PGM_SOURCE_CHANGED'; sourceId: string }
  | { type: 'PVW_SOURCE_CHANGED'; sourceId: string }
  | { type: 'PRODUCTION_ACTIVATED'; productionId: string }
  | { type: 'PRODUCTION_DEACTIVATED' }
  | { type: 'AUDIO_AFV_TOGGLED'; mixerInput: string; enabled: boolean }
  | { type: 'OUTPUT_STARTED'; outputId: string; flowId: string }
  | { type: 'OUTPUT_STOPPED'; outputId: string }
  | { type: 'OUTPUT_ERROR'; outputId: string; error: string }
```

## 8. Shared WebSocket Provider

A `WsProvider` React component wraps the shell. Single WebSocket connection per
active production. Modules register handlers on mount and deregister on unmount.

In pop-out windows: the PanePage instantiates its own `WsProvider`. Each pop-out
gets its own WS connection.

Handler registration pattern:

```ts
// In audio.messages.ts:
export function register(ctx: ModuleCtx): () => void {
  const unsubs = [
    ctx.ws.on('AUDIO_STATE',        (msg) => audioStore.applyLevel(...)),
    ctx.ws.on('METER_DATA',         (msg) => audioStore.applyMeter(...)),
    ctx.ws.on('LOUDNESS_DATA',      (msg) => audioStore.applyLoudness(...)),
    ctx.ws.on('AFV_STATE',          (msg) => audioStore.applyAfv(...)),
    ctx.ws.on('PFL_STATE',          (msg) => audioStore.applyPfl(...)),
    ctx.ws.on('AFL_STATE',          (msg) => audioStore.applyAfl(...)),
    ctx.ws.on('AUX_SEND_STATE',     ...),
    ctx.ws.on('GRP_STATE_RESET',    ...),
    ctx.ws.on('MONITOR_STATE',      ...),
    ctx.ws.on('AUDIO_DYNAMICS_STATE', ...),
  ]
  return () => unsubs.forEach(fn => fn())
}
```

The `send` function is passed to every module component. Messages are typed via
the existing `OutboundMessage` union.

## 9. Output Flows Architecture

### 9.1 Concept

Outputs run as independent Strom flows, separate from the main production flow.
This enables per-output start/stop without affecting the main production,
different encoding settings per output, and individual recorder start/stop.

```
Main Production Flow
  +-- Inputs -> Vision Mixer -> inter_output blocks
  +-- Audio Mixer -> inter_output blocks

Per-Output Flows (started/stopped independently)
  Stream "YouTube":  inter_input -> encoder -> mpegtsmux -> srtsink
  EFP/SRT "Backup": inter_input -> encoder -> efp pipeline
  Record "ISO Cam1": inter_input -> splitmuxsink
  Record "PGM":      inter_input -> splitmuxsink
  NDI "Program":     inter_input -> ndisink
  SDI "Monitor":     inter_input -> decklinkvideosink
```

Inter-pipeline blocks: `builtin.inter_output` publishes named channels on the
main flow; `builtin.inter_input` subscribes to them in output flows.

### 9.2 Output Module Types

| Module | Slot | Manages | Flow type |
|---|---|---|---|
| `srtStream` | bottom | SRT destination URL, bitrate, latency | mpegtsmux -> srtsink |
| `efpStream` | bottom | EFP destination URL, bitrate | efp pipeline |
| `recording` | bottom | List of recorders, per-recorder start/stop | splitmuxsink |
| `ndiOutput` | bottom | NDI stream name | ndisink |
| `sdiOutput` | bottom | SDI device number | decklinkvideosink |

Each output module renders as a compact status card in the "Outputs" section at
the right end of the bottom slot.

### 9.3 Inter-pipeline Naming Convention

Channel names for `inter_output` / `inter_input`:

```
{outputId}_{productionId_first8chars}
```

This prevents collisions when the same production is activated multiple times or
across different servers.

### 9.4 Backend API Additions

```
POST /api/v1/productions/:id/outputs/:outputId/start
  Body: { config: OutputConfig }
  Response: { flowId: string, status: 'starting' }
  -> Creates inter_output on main flow
  -> Creates output flow with inter_input -> encoder -> sink
  -> Starts flow

POST /api/v1/productions/:id/outputs/:outputId/stop
  -> Stops output flow, removes flow, removes inter_output from main

GET /api/v1/productions/:id/outputs/:outputId/status
  -> { state, bitrate?, uptime?, errors? }
```

## 10. Route Structure

```tsx
// In app.tsx -- both studios coexist:
{
  path: '/studio',           element: <ControllerPage />,     // existing, untouched
},
{
  path: '/studio-modular',   element: <StudioShell />,        // NEW
},
{
  path: '/pane/:moduleId',   element: <PanePage />,           // generic, works for both
},
```

The old `<PanePage>` imports specific panels. The new one looks up any module
from the registry by ID.

## 11. Migration Path

- Existing code — not touched. `/studio` continues working.
- New `frontend/src/modules/` — built from existing components, not from scratch.
- New `frontend/src/studio/` — `StudioShell`, `WsProvider`, `EventBus`, `SlotLayout`.
- Shared code — hooks, stores, API client, UI components import from existing locations initially.

Order of work:

1. Scaffold: EventBus, WsProvider, ModuleCtx, SlotLayout, StudioShell — works with 1 test module
2. Port simplest modules first: timer, multiviewer, pgm (each ~50-100 lines to wrap)
3. Port controller module (keyboard shortcuts move into it)
4. Port audio (largest — 1392 lines refactored into sub-components)
5. Port remaining: looks, pip, mediaplayer
6. Build output flow backend API
7. Build output modules (streaming, recording, NDI, SDI)
8. Generic PanePage for pop-outs
9. User acceptance testing side-by-side
10. Optionally deprecate `/studio` (not required)

## 12. Non-Goals

- Not replacing the existing studio — parallel offering
- Not changing backend/Strom/CouchDB architecture
- Not implementing drag-and-drop or freeform windowing
- Not adding plugin hot-reload from external files
- Not changing WS message protocol
- Not splitting audio into separate per-strip micro-modules (too granular)
