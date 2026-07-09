# Modular Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `open-live-modular-studio` — a side-by-side alternative to the
existing monolithic studio frontend, using isolated modules with a shared event
bus and WS provider. Runs against the same backend/Strom/CouchDB with zero
changes to the existing studio.

**Architecture:** New React+Svelte frontend in a separate GitHub repo
(`github.com/markusnygard/open-live-modular-studio`). A `StudioShell` renders
`StudioModule` entries from a central registry into named slots. Modules are
full vertical slices (UI + Zustand store + WS handlers). Inter-module
communication via a typed EventBus. Output flows run as independent Strom flows
per output configuration.

**Tech Stack:** React 19, React Router 7, Zustand 5 + Immer, Tailwind CSS 4,
Vite 6, TypeScript 5.8, pnpm.

## Global Constraints

- Must run Docker volume-mounted against the existing backend/Strom/CouchDB stack
- Must NOT modify any existing frontend file (`frontend/src/pages/ControllerPage/`, etc.)
- Must share the existing WS message protocol format
- Must share existing REST API endpoints unchanged
- Must reuse existing Zustand store data shapes where possible
- Must support pop-out to separate browser windows per module
- Must persist module visibility to `localStorage` per module ID

---

## Task 1: Project Scaffold + Dev Environment

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `postcss.config.js`
- Create: `src/main.tsx`, `src/app.tsx`, `src/index.css`
- Create: `src/shared/base.ts`, `src/shared/cn.ts`, `src/shared/types.ts`
- Create: `src/shared/api.ts`

**Interfaces:**
- Consumes: n/a (first task)
- Produces: `SendFn`, `OutboundMessage` type, `BASE_URL` constant

Tool call
    Write: package.json (based on existing frontend's package.json, removing unused deps, keeping: react, react-dom, react-router, zustand, immer, clsx, tailwind-merge, vite, tailwindcss, typescript, eslint, @tailwindcss/vite)
    Write: vite.config.ts (Vite 6 + React + Tailwind v4 plugin, proxy → OPEN_LIVE_URL)
    Write: tsconfig.json (target ES2022, module ESNext, jsx react-jsx, strict, paths @/ → src/)
    Write: src/index.css (@import "tailwindcss", custom CSS properties from existing, fader styles)
    Write: src/shared/base.ts (import.meta.env.VITE_OPEN_LIVE_URL || 'http://localhost:8000', WS_BASE)
    Write: src/shared/types.ts (copy OutboundMessage union from controller.ts:35-50)
    Write: src/shared/cn.ts (clsx + tailwind-merge helper)
    Write: src/shared/api.ts (fetch wrapper with JSON parsing, base error handling)
    Write: src/main.tsx (createRoot, render App)
    Write: src/app.tsx (BrowserRouter, routes: /studio-modular → StudioShell stub, /pane/:moduleId → PanePage stub)

- [ ] Write package.json matching current frontend but with only needed deps
- [ ] Write vite.config.ts with tailwindcss plugin + OPEN_LIVE_URL proxy
- [ ] Write src/shared/base.ts, types.ts, cn.ts, api.ts
- [ ] Write src/main.tsx, app.tsx with stub routes
- [ ] Run `pnpm install && pnpm exec vite build` — must compile with no errors
- [ ] Commit: `feat: scaffold project with Vite + React + Tailwind`

---

## Task 2: Event Bus

**Files:**
- Create: `src/shared/event-bus.ts`

**Interfaces:**
- Produces: `EventBus` class with `emit(event)`, `on(type, handler) → unsubscribe`

- [ ] Write `src/shared/event-bus.ts`:

```ts
type Listener<T> = (event: T) => void

export class EventBus<T extends Record<string, any>> {
  private listeners = new Map<string, Set<Listener<any>>>()

  emit<K extends keyof T & string>(type: K, event: T[K]): void {
    const set = this.listeners.get(type)
    if (set) set.forEach(fn => fn(event))
  }

  on<K extends keyof T & string>(type: K, handler: Listener<T[K]>): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(handler)
    return () => { this.listeners.get(type)?.delete(handler) }
  }
}
```

- [ ] Add `studio/types.ts` with event type definitions:

```ts
export type StudioEvent = {
  PGM_SOURCE_CHANGED: { sourceId: string }
  PVW_SOURCE_CHANGED: { sourceId: string }
  PRODUCTION_ACTIVATED: { productionId: string }
  PRODUCTION_DEACTIVATED: void
}
```

- [ ] Write simple test: instantiate EventBus, emit, verify listener called
- [ ] Run: `pnpm exec vitest src/shared/event-bus.test.ts`
- [ ] Commit: `feat: add typed EventBus for inter-module communication`

---

## Task 3: Module Registry + Types

**Files:**
- Create: `src/studio/types.ts`
- Create: `src/studio/ModuleRegistry.ts`

**Interfaces:**
- Produces: `StudioModule` interface, `ModuleCtx` interface, `MODULES` array, `getModulesForSlot(slot)` helper

- [ ] Write `src/studio/types.ts`:

```ts
import type { ReactNode, FC } from 'react'
import type { EventBus } from '@/shared/event-bus'
import type { OutboundMessage } from '@/shared/types'

export type SendFn = (msg: OutboundMessage) => void

export interface ModuleCtx {
  send: SendFn
  eventBus: EventBus<any>
  productionId: string | null
}

export interface StudioModule {
  id: string
  slot: 'top' | 'pgm' | 'bottom'
  label: string
  icon: ReactNode
  defaultVisible: boolean
  supportsPopout: boolean
  popoutSize?: { width: number; height: number }
  component: FC<{ send: SendFn; productionId: string | null }>
  standaloneComponent?: FC<{ send: SendFn; productionId: string | null }>
  onRegister?: (ctx: ModuleCtx) => () => void
  minWidth?: number
  maxWidth?: number
}
```

- [ ] Write `src/studio/ModuleRegistry.ts`:

```ts
import type { StudioModule } from './types'

export const MODULES: StudioModule[] = []
// Modules register themselves by pushing to this array.

export function getModulesForSlot(slot: string): StudioModule[] {
  return MODULES.filter(m => m.slot === slot)
}

export function getModuleById(id: string): StudioModule | undefined {
  return MODULES.find(m => m.id === id)
}
```

- [ ] Run TypeScript check: `pnpm exec tsc --noEmit` — must pass
- [ ] Commit: `feat: add module registry and type definitions`

---

## Task 4: WsProvider — Shared WebSocket Connection

**Files:**
- Create: `src/studio/WsProvider.tsx`

**Interfaces:**
- Consumes: `ModuleCtx`, `SendFn`, `EventBus` from Task 3
- Produces: `WsProvider` React component, `useWs()` hook returning `{ send, onMessage, productionId }`

- [ ] Write `src/studio/WsProvider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { OutboundMessage } from '@/shared/types'
import type { EventBus } from '@/shared/event-bus'
import type { SendFn } from './types'
import { WS_BASE } from '@/shared/base'

interface WsCtx {
  send: SendFn
  productionId: string | null
  /** Register inbound handler for a message type. Returns unsubscribe. */
  onMessage: (type: string, handler: (msg: any) => void) => () => void
}

const WsContext = createContext<WsCtx | null>(null)

export function useWs(): WsCtx {
  const ctx = useContext(WsContext)
  if (!ctx) throw new Error('useWs must be used within WsProvider')
  return ctx
}

export function WsProvider({ productionId, eventBus, children }: {
  productionId: string | null
  eventBus: EventBus<any>
  children: React.ReactNode
}) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<(msg: any) => void>>>(new Map())
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (!productionId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE}/ws/productions/${productionId}/controller`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const type = msg.type
        handlersRef.current.get(type)?.forEach(h => h(msg))
        // Also dispatch to catch-all
        handlersRef.current.get('*')?.forEach(h => h(msg))
      } catch {}
    }

    ws.onclose = () => {
      if (retryCount.current < 5 && productionId) {
        reconnectRef.current = setTimeout(() => {
          retryCount.current++
          connect()
        }, 2000)
      }
    }

    ws.onopen = () => { retryCount.current = 0 }
  }, [productionId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send: SendFn = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const onMessage = useCallback((type: string, handler: (msg: any) => void) => {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set())
    handlersRef.current.get(type)!.add(handler)
    return () => { handlersRef.current.get(type)?.delete(handler) }
  }, [])

  return (
    <WsContext.Provider value={{ send, productionId, onMessage }}>
      {children}
    </WsContext.Provider>
  )
}
```

- [ ] Add `onMessage` return from `useWs()` — allows modules to register by type
- [ ] Run: `pnpm exec tsc --noEmit` — must pass
- [ ] Commit: `feat: add WsProvider for shared WebSocket connection`

---

## Task 5: SlotLayout + StudioShell

**Files:**
- Create: `src/studio/SlotLayout.tsx`
- Create: `src/studio/StudioShell.tsx`
- Create: `src/studio/ModuleToggleBar.tsx`

**Interfaces:**
- Consumes: `ModuleRegistry` (Task 3), `WsProvider` (Task 4), `EventBus` (Task 2)
- Produces: `<SlotLayout />`, `<StudioShell />` — renders modules into named slots

- [ ] Write `src/studio/SlotLayout.tsx`:

```tsx
import { getModulesForSlot } from './ModuleRegistry'
import { useWs } from './WsProvider'
import type { StudioModule } from './types'

function ModuleRenderer({ module }: { module: StudioModule }) {
  const { send, productionId, onMessage } = useWs()
  const { eventBus } = useModuleCtx()
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (module.onRegister) {
      cleanupRef.current = module.onRegister({ send, eventBus, productionId })
    }
    return () => { cleanupRef.current?.() }
  }, [module, send, eventBus, productionId])

  const Component = module.component
  return <Component send={send} productionId={productionId} />
}

export function SlotLayout({ slot }: { slot: 'top' | 'pgm' | 'bottom' }) {
  const modules = getModulesForSlot(slot)
  const visibleModules = modules.filter(m => {
    if (typeof localStorage === 'undefined') return m.defaultVisible
    const stored = localStorage.getItem(`ol-module-${m.id}-visible`)
    return stored !== null ? stored === 'true' : m.defaultVisible
  })

  const style = slot === 'bottom'
    ? { height: 392, overflow: 'auto' }
    : { flex: 1 }

  return (
    <div style={style} className="flex gap-1">
      {visibleModules.map(m => (
        <ModuleRenderer key={m.id} module={m} />
      ))}
    </div>
  )
}
```

- [ ] Write `src/studio/StudioShell.tsx`:

```tsx
import { WsProvider } from './WsProvider'
import { SlotLayout } from './SlotLayout'
import { ModuleToggleBar } from './ModuleToggleBar'
import { eventBus } from '@/shared/event-bus'
import { useMemo } from 'react'
import { MODULES } from './ModuleRegistry'

export function StudioShell({ productionId }: { productionId: string | null }) {
  const bus = useMemo(() => eventBus, [])

  return (
    <WsProvider productionId={productionId} eventBus={bus}>
      <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
        {/* Header bar */}
        <ModuleToggleBar productionId={productionId} />

        {/* Top row: multiviewer + pgm */}
        <div className="flex-1 flex">
          <SlotLayout slot="top" />
          <SlotLayout slot="pgm" />
        </div>

        {/* Bottom row */}
        <SlotLayout slot="bottom" />
      </div>
    </WsProvider>
  )
}
```

- [ ] Write `src/studio/ModuleToggleBar.tsx` — production selector + toggle icons per module from MODULES array
- [ ] Create a test module: `src/modules/__test__/index.ts` registering as slot='top', renders a div with text "test module"
- [ ] Verify: `pnpm exec vite dev` — StudioShell renders with test module in top slot
- [ ] Commit: `feat: add SlotLayout, StudioShell, ModuleToggleBar`

---

## Task 6: Multiviewer Module

**Files:**
- Create: `src/modules/multiviewer/index.ts`
- Create: `src/modules/multiviewer/MultiviewerModule.tsx`
- Create: `src/modules/multiviewer/multiviewer.store.ts`
- Copy + adapt: `src/shared/useWebRTC.ts` (extract from existing frontend)

**Interfaces:**
- Consumes: WHEP URL from production activation
- Produces: `multiviewer` StudioModule entry

- [ ] Extract `useWebRTC` from existing `frontend/src/hooks/useWebRTC.ts` into `src/shared/useWebRTC.ts`
- [ ] Write `src/modules/multiviewer/multiviewer.store.ts` — Zustand store: whepUrl, connected, muted
- [ ] Write `src/modules/multiviewer/MultiviewerModule.tsx` — wraps existing MultiviewCell + VideoTile, uses useWebRTC
- [ ] Write `src/modules/multiviewer/index.ts` — StudioModule descriptor:

```ts
export const multiviewer: StudioModule = {
  id: 'multiviewer',
  slot: 'top',
  label: 'Multiviewer',
  icon: <MonitorIcon />,
  defaultVisible: true,
  supportsPopout: true,
  popoutSize: { width: 1920, height: 1080 },
  component: MultiviewerModule,
}
```

- [ ] Push descriptor to MODULES array
- [ ] Verify: StudioShell renders multiviewer in top slot
- [ ] Commit: `feat: add multiviewer module`

---

## Task 7: PGM Monitor Module

**Files:**
- Create: `src/modules/pgm/index.ts`
- Create: `src/modules/pgm/PgmModule.tsx`
- Create: `src/modules/pgm/pgm.store.ts`

**Interfaces:**
- Consumes: PGM WHEP URL from production activation
- Produces: `pgm` StudioModule entry

- [ ] Write `src/modules/pgm/pgm.store.ts` — whepUrl, connected, fullscreen
- [ ] Write `src/modules/pgm/PgmModule.tsx` — PGM video tile with fullscreen toggle
- [ ] Write `src/modules/pgm/index.ts` — descriptor (slot: 'pgm', supportsPopout: true)
- [ ] Push to MODULES array
- [ ] Verify: renders in pgm slot
- [ ] Commit: `feat: add pgm monitor module`

---

## Task 8: Timer Module

**Files:**
- Create: `src/modules/timer/index.ts`
- Create: `src/modules/timer/TimerModule.tsx`
- Create: `src/modules/timer/timer.store.ts`

**Interfaces:**
- Consumes: `PRODUCTION_ACTIVATED` event, clock state
- Produces: `timer` StudioModule entry

- [ ] Write simple timer component (clock + countdown, adapted from TimerBar)
- [ ] Register as slot='bottom', supportsPopout: true
- [ ] Commit: `feat: add timer module`

---

## Task 9: Controller Module (Part 1 — Vision Mixer)

**Files:**
- Create: `src/modules/controller/index.ts`
- Create: `src/modules/controller/ControllerModule.tsx`
- Create: `src/modules/controller/controller.store.ts`
- Create: `src/modules/controller/controller.messages.ts`
- Create: `src/modules/controller/TransitionPanel.tsx`
- Create: `src/modules/controller/SourceBusDual.tsx`
- Create: `src/modules/controller/DskPanel.tsx`
- Create: `src/modules/controller/MacroBar.tsx`
- Adapt from existing: `frontend/src/pages/ControllerPage/SourceBusDual.tsx` (copy + adapt)
- Adapt from existing: `frontend/src/pages/ControllerPage/TransitionPanel.tsx`
- Adapt from existing: `frontend/src/pages/ControllerPage/DskPanel.tsx`
- Adapt from existing: `frontend/src/pages/ControllerPage/MacroBar.tsx`

**Interfaces:**
- Consumes: production.store (PGM/PVW state), event bus
- Produces: `controller` StudioModule entry
- Emits: `PGM_SOURCE_CHANGED`, `PVW_SOURCE_CHANGED`

- [ ] Copy `production.store.ts` from existing frontend (PGM/PVW/DSK/FTB/OVL state)
- [ ] Write `controller.store.ts` — wraps production store, adds transition type, keyboard state
- [ ] Write `controller.messages.ts` — WS handler registration for TALLY, OVL_STATE, DSK_STATE
- [ ] Port TransitionPanel (CUT/AUTO/FTB + transition types) from existing
- [ ] Port SourceBusDual (PGM/PVW source rows) from existing — emit PGM_SOURCE_CHANGED on CUT
- [ ] Port DskPanel (downstream keyer controls) from existing
- [ ] Port MacroBar (macro execute buttons) from existing
- [ ] Write ControllerModule.tsx — composes all sub-panels, registers keyboard shortcuts via `useEffect`:

```tsx
useEffect(() => {
  // Keyboard shortcuts: Space=Cut, Enter=Auto, F=FTB, K=DSK toggle, 1-9=select, Shift+1-9=hot-cut
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    // ... handle shortcuts, call send()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [send, pgmSource])
```

- [ ] Write index.ts — descriptor (slot: 'bottom', supportsPopout: true)
- [ ] Push to MODULES array
- [ ] Commit: `feat: add controller module (vision mixer)`

---

## Task 10: Controller Module (Part 2 — Options + Source Offsets)

**Files:**
- Modify: `src/modules/controller/ControllerModule.tsx`
- Create: `src/modules/controller/ControllerOptionsModal.tsx`
- Create: `src/modules/controller/SourceOffsetPanel.tsx`

- [ ] Port controller options modal (transition types, per-source video/audio offsets) from existing ControllerPage
- [ ] Move modal state into controller.store
- [ ] Commit: `feat: add controller options and source offsets to controller module`

---

## Task 11: Audio Module

**Files:**
- Create: `src/modules/audio/index.ts`
- Create: `src/modules/audio/AudioModule.tsx`
- Create: `src/modules/audio/audio.store.ts`
- Create: `src/modules/audio/audio.messages.ts`
- Create: `src/modules/audio/components/ChannelStrip.tsx`
- Create: `src/modules/audio/components/VuMeter.tsx`
- Create: `src/modules/audio/components/EbuMeter.tsx`
- Create: `src/modules/audio/components/PeakReadout.tsx`
- Create: `src/modules/audio/components/Fader.tsx`
- Create: `src/modules/audio/components/AuxChannelStrip.tsx`
- Create: `src/modules/audio/components/AuxMasterStrip.tsx`
- Create: `src/modules/audio/components/GrpMasterStrip.tsx`
- Create: `src/modules/audio/components/MonitorMasterStrip.tsx`
- Create: `src/modules/audio/components/SectionBar.tsx`
- Create: `src/modules/audio/components/ProcessingPopup.tsx`
- Adapt from existing: `frontend/src/pages/ControllerPage/AudioPanel.tsx` (1392 lines — split into components above)
- Adapt from existing: `frontend/src/store/audio.store.ts` (347 lines — copy + adapt)
- Adapt from existing: `frontend/src/components/ProcessingPopup.tsx`

**Interfaces:**
- Consumes: `useAudioStore`, `useWs().onMessage`, `eventBus.on('PGM_SOURCE_CHANGED')`
- Produces: `audio` StudioModule entry
- Subscribes: `PGM_SOURCE_CHANGED` (AFV follow)

- [ ] Copy `audio.store.ts` from existing frontend — same data shape, keep all fields
- [ ] Split AudioPanel.tsx (1392 lines) into focused files:
  - `VuMeter.tsx` (~30 lines) — PPM bar with peak hold
  - `EbuMeter.tsx` (~65 lines) — EBU R128 LUFS bar
  - `PeakReadout.tsx` (~15 lines) — dB peak numeric display
  - `Fader.tsx` (~40 lines) — rotated range input with tick marks and broadcast log taper
  - `ChannelStrip.tsx` (~380 lines) — fader + meter + peak + ON/AFV/PFL/AFL + group assign + H/G/C/E buttons + pan
  - `AuxChannelStrip.tsx` (~120 lines) — per-channel aux send strip
  - `AuxMasterStrip.tsx` (~120 lines) — aux bus master
  - `GrpMasterStrip.tsx` (~120 lines) — group bus master
  - `MonitorMasterStrip.tsx` (~100 lines) — monitor master
  - `SectionBar.tsx` (~25 lines) — collapsible section label
  - `ProcessingPopup.tsx` — copy from existing, remove global imports, use module-local store
- [ ] Write `audio.messages.ts` — register handlers for: AUDIO_STATE, METER_DATA, LOUDNESS_DATA, AFV_STATE, PFL_STATE, AFL_STATE, AUX_SEND_STATE, GRP_STATE_RESET, MONITOR_STATE, AUDIO_DYNAMICS_STATE
- [ ] Write `AudioModule.tsx` — composes strips into tabs (MAIN, AUX 1-N), subscribes to PGM_SOURCE_CHANGED for AFV:

```tsx
export function AudioModule({ send, productionId }: { send: SendFn; productionId: string | null }) {
  const { onMessage } = useWs()
  const { eventBus } = useModuleCtx()

  useEffect(() => {
    const unsub1 = audioMessages.register({ send, onMessage })
    const unsub2 = eventBus.on('PGM_SOURCE_CHANGED', (e) => {
      // AFV: find channels matching the new PGM source, apply audio follow
      afvFollow(e.sourceId, send)
    })
    return () => { unsub1(); unsub2() }
  }, [send, onMessage, eventBus])

  // ... render tabs + strips (same layout as existing AudioPanel)
}
```

- [ ] Write index.ts — descriptor (slot: 'bottom', supportsPopout: true, minWidth: 600)
- [ ] Push to MODULES array
- [ ] Verify: channel strips render, faders work, meters animate, AFV follows PGM
- [ ] Commit: `feat: add audio module`

---

## Task 12: Looks (FX) Module

**Files:**
- Create: `src/modules/looks/index.ts`
- Create: `src/modules/looks/LooksModule.tsx`
- Adapt: `frontend/src/pages/ControllerPage/LooksPanel.tsx`

- [ ] Port LooksPanel with per-source shader controls
- [ ] Register as slot='bottom'
- [ ] Commit: `feat: add looks/fx module`

---

## Task 13: PiP Module

**Files:**
- Create: `src/modules/pip/index.ts`
- Create: `src/modules/pip/PipModule.tsx`
- Adapt: `frontend/src/pages/ControllerPage/PipPanel.tsx`

- [ ] Port PipPanel with position/size controls
- [ ] Register as slot='bottom'
- [ ] Commit: `feat: add PiP module`

---

## Task 14: Media Player Module

**Files:**
- Create: `src/modules/mediaplayer/index.ts`
- Create: `src/modules/mediaplayer/MediaPlayerModule.tsx`
- Create: `src/modules/mediaplayer/mediaplayer.messages.ts`
- Adapt: `frontend/src/components/MediaPlayerCard.tsx`

- [ ] Port MediaPlayerCard (transport, playlist, progress bar, file browser)
- [ ] Register as slot='bottom'
- [ ] Commit: `feat: add media player module`

---

## Task 15: Generic PanePage (Pop-Out Windows)

**Files:**
- Create: `src/pages/PanePage.tsx`
- Modify: `src/app.tsx` (add pane route)

**Interfaces:**
- Consumes: ModuleRegistry (Task 3), WsProvider (Task 4), EventBus (Task 2)

- [ ] Write generic PanePage:

```tsx
import { useParams } from 'react-router'
import { getModuleById, MODULES } from '@/studio/ModuleRegistry'
import { WsProvider } from '@/studio/WsProvider'
import { eventBus } from '@/shared/event-bus'
import { useMemo } from 'react'

export function PanePage({ productionId }: { productionId: string | null }) {
  const { moduleId } = useParams<{ moduleId: string }>()
  const bus = useMemo(() => eventBus, [])
  const mod = moduleId ? getModuleById(moduleId) : undefined

  if (!mod || !mod.supportsPopout) {
    return <div className="p-4 text-white">Unknown module: {moduleId}</div>
  }

  // Apply popout window size
  useEffect(() => {
    if (mod.popoutSize) {
      window.resizeTo(mod.popoutSize.width, mod.popoutSize.height)
    }
  }, [mod])

  const Component = mod.standaloneComponent ?? mod.component

  return (
    <WsProvider productionId={productionId} eventBus={bus}>
      <Component send={() => {}} productionId={productionId} />
    </WsProvider>
  )
}
```

- [ ] Add route: `/pane/:moduleId` → `<PanePage />`
- [ ] Verify: open multiviewer pop-out, renders correctly
- [ ] Commit: `feat: add generic PanePage for module pop-out windows`

---

## Task 16: Production Selector + Activation

**Files:**
- Create: `src/pages/ProductionsPage.tsx` (adapted from existing)
- Modify: `src/studio/StudioShell.tsx` (production selector in header)

- [ ] Port production list from existing frontend (productions.store already exists)
- [ ] Add production selector dropdown to StudioShell header bar:

```tsx
<select value={productionId ?? ''} onChange={e => setProductionId(e.target.value || null)}>
  <option value="">Select production</option>
  {productions.map(p => (
    <option key={p._id} value={p._id}>{p.name}</option>
  ))}
</select>
```

- [ ] On production change: emit `PRODUCTION_ACTIVATED` or `PRODUCTION_DEACTIVATED` event
- [ ] Commit: `feat: add production selector and activation`

---

## Task 17: Output Flows — Backend API

**Note:** This task modifies the existing **backend** repo, not the modular studio repo.

**Files:**
- Create: `backend/src/routes/output-flows.ts`
- Modify: `backend/src/lib/flow-generator.ts` (inter_output/inter_input helpers)
- Modify: `backend/src/routes/productions.ts` (register routes)

**Interfaces:**
- Produces: `POST /api/v1/productions/:id/outputs/:outputId/start`, `.../stop`, `.../status`

- [ ] Add `buildOutputFlow` to flow-generator — creates a flow with inter_input → encoder → sink
- [ ] Add three endpoints to output-flows.ts
- [ ] Register routes in productions.ts
- [ ] Test with curl: start an SRT stream output, verify flow is created at Strom
- [ ] Commit: `feat: add output flow backend API`

---

## Task 18: Output Modules (Streaming + Recording + NDI/SDI)

**Files:**
- Create: `src/modules/outputs/OutputStatusBar.tsx` — shared UI for output status
- Create: `src/modules/outputs/OutputCard.tsx` — compact card (name, status dot, start/stop, bitrate)
- Create: `src/modules/outputs/srt-stream/index.ts`
- Create: `src/modules/outputs/efp-stream/index.ts`
- Create: `src/modules/outputs/recording/index.ts`
- Create: `src/modules/outputs/ndi-output/index.ts`
- Create: `src/modules/outputs/sdi-output/index.ts`

- [ ] Write `OutputCard` — generic start/stop button, status indicator, error display
- [ ] Write each output module as a thin wrapper using OutputCard with backend API calls
- [ ] Register all output modules as slot='bottom'
- [ ] Verify: start SRT stream, see flow created at Strom, output status updates
- [ ] Commit: `feat: add output modules (streaming, recording, NDI, SDI)`

---

## Task 19: End-to-End Integration Test

- [ ] Start all containers: `cd open_live_local && docker compose up -d`
- [ ] Verify `/studio` (existing) still works — no regressions
- [ ] Verify `/studio-modular` works — all modules render, WS messages flow, meters animate
- [ ] Verify pop-outs work: each module opens in its own window
- [ ] Verify output flows: start stream, verify Strom has the flow, stop stream, verify flow removed
- [ ] Verify keyboard shortcuts in controller module
- [ ] Commit: `docs: add integration test checklist`

---

## Task 20: GitHub Repo Setup + CI

- [ ] Create repo `github.com/markusnygard/open-live-modular-studio`
- [ ] Push all code
- [ ] Add CI workflow: `pnpm install && pnpm typecheck && pnpm build`
- [ ] Add Docker setup (volume mount like existing frontend, `node:23-slim`, vite dev server)
- [ ] Add to dashboard as separate service
- [ ] Commit: `ci: add GitHub Actions and Docker setup`
