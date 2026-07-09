# Session Handoff: Media Player Audio + Transport Buttons Fix

> Date: 2026-07-06 — continued 2026-07-07. Session state document.
> Companion to `MEMORY.md` (long-term project memory). Delete or fold into
> MEMORY.md when this work is finished.

## STATUS: MODULAR STUDIO BUILT — PiP and sources need polish

The modular studio (`open-live-modular-studio`) is functional. 20 tasks completed via
subagent-driven development. Repo at https://github.com/markusnygard/open-live-modular-studio.

---

## 1. Problems addressed (user-reported)

1. **Audio + channel meter dies on clip change** — first clip plays fine (audio
   audible, ch1 strip moving), after switching clips video works but audio/meter
   dead for ALL clips until reactivation.
2. **Audiometer freezes at last value** (~-20 dB) when a clip stops — never
   resets to zero.
3. **Transport buttons** don't follow spec (see §3).

## 2. Root causes found (all verified with evidence)

### 2a. Audio death on clip change: sample-rate renegotiation failure
- `Big-Buck-Bunny-080p60.mp4` = AAC **44100 Hz**; `go1080p25.mp4` = MP3 **48000 Hz**.
- Mediaplayer bridges decoded samples (internal pipeline `uridecodebin →
  clocksync → appsink`) into the outer flow pipeline's `appsrc_audio`,
  forwarding **whatever caps the file has**.
- Outer mixer channel chain (`strom/backend/src/blocks/builtin/mixer/builder.rs:662`)
  is `audioconvert → capsfilter(F32LE/2ch) → …` — **no `audioresample`**, and the
  running `audiomixer`'s output rate is locked. Rate change ⇒ renegotiation fails ⇒
  `not-negotiated (-4)` on `appsrc_audio` ⇒ its streaming task stops permanently.
- Evidence: Strom log 11:21:21 `gst_base_src_loop … appsrc_audio … not-negotiated`;
  also `Failed to resume playback: StateChangeError` afterwards.
- NOTE: an earlier session "verified" the PAUSED→PLAYING cycle fix with GOTO(0)
  on the **same clip** (same caps) — invalid test. Different-rate clips are the trigger.

### 2b. Frozen meter: GStreamer `level` elements only post while buffers flow
- Bus meters (main/monitor/aux/group) emit continuously (audiomixer generates
  silence); channel meters (`level_0` → `:meter:1`) go silent when input stops.
- Old mitigation in `controller.ts` broadcast zeros to elementId **`ch0`** but
  strips are keyed **`ch1`** (metering.rs broadcasts `channel_num = index + 1`),
  and only fired on explicit stop/pause — never on natural EOS.

### 2c. Buttons
- Strom `state()` **never reported "stopped"**: after `stop()` (= pause+seek 0,
  `is_paused=true`) it reported "paused"; after EOS it reported "playing" forever
  (observed: `17.8/17.8s "playing"`). Broke STOP highlight and the frontend
  software loop (which waited for `state==='stopped'`).
- Backend `MEDIAPLAYER_TOGGLE_LOOP` was a **no-op** (`loop_playlist` block property
  is non-live). BUT: `MediaPlayerState.loop_playlist` is an `AtomicBool` checked
  at every EOS ⇒ runtime-mutable, only needed a live API.
- PAUSE button never resumed (no toggle); PLAY always did GOTO(0) (jumps to clip
  1 even mid-playlist).
- NEXT "did nothing" because every clip change died on 2a.

### 2d. Found during verification: replay-after-EOS bug (**FIXED AND DEPLOYED**)
- When `stop()` ran with index already 0 (single clip, or EOS-stop), it did only
  pause+seek(0) on an **EOS'd stream**. Flushing seek doesn't reliably clear EOS
  ⇒ next `play()` re-EOSes instantly ⇒ EOS handler stops it again (player stuck
  "stopped" at pos ~0.7s, meter silent even though state briefly said playing).
- Fix: `stop()` **always** reloads; `play()` from Stopped reloads.
- **VERIFIED** after 2nd rebuild: stop→play→advancing (2.3s, 4.4s), repeated twice. ✅

### 2e. Found during verification: meter-relay stale after reactivation
- Meter-relay connects to Strom WS with a specific `flow_id`. On production
  reactivation, the flow ID changes, but the relay stayed connected to the old
  flow (refCount prevented restart, `startMeterRelay` didn't check for flow
  mismatch). Channel meters silently died until a controller WS reconnect.
- Fix in `meter-relay.ts`: `startMeterRelay` now checks if `flowId` or
  `mixerBlockId` changed vs. the existing relay; if so, stops old relay and
  creates a new one. `RelayEntry` stores `flowId`/`mixerBlockId` for comparison.

## 3. Button spec (user-defined, authoritative)

- **PLAY**: always start current clip from beginning; highlighted while playing.
- **PAUSE**: 1st push pauses (playhead stays, amber highlight); 2nd push resumes
  from the pause point (then PLAY highlights).
- **STOP**: stop + playhead to beginning of **clip 1** (always, incl. during
  loop); highlighted when stopped at beginning.
- **NEXT**: jump to next clip if >1 clip; 1 clip ⇒ do nothing.
- **LOOP**: live toggle. 1 clip: repeat until STOP. >1 clips: play in order, wrap
  after last. Loop OFF multi-clip: play in order, then full stop (back to clip 1).
- Clicking a playlist row plays that clip immediately (existing GOTO behavior — keep).

## 4. All edits made this session

### Strom (repo `strom/`, custom fork; image `open-live-strom-ndi:0.6.6-mpfixed`)
- `backend/src/blocks/builtin/mediaplayer/bridge.rs`
  - `link_pad_through_clocksync`: for `media_type == "audio"`, chain is now
    `clocksync → audioconvert → audioresample → capsfilter(audio/x-raw, F32LE,
    48000 Hz, 2ch, interleaved) → appsink` (names `{clocksync_name}_norm_convert/
    _norm_resample/_norm_caps`). Outer pipeline never sees caps changes.
    Elements set to PLAYING before upstream link (same discipline as clocksync).
    Cleanup is automatic — `load_current_file_inner` removes all non-source elements.
  - EOS handler: end-of-playlist now calls `state_for_bus.stop()` (full stop
    semantics) before broadcasting Stopped.
- `backend/src/blocks/builtin/mediaplayer/state.rs`
  - New field `is_stopped: AtomicBool` (doc comment explains precedence).
  - `state()`: is_stopped → Stopped, else is_paused → Paused, else empty playlist
    → Stopped, else Playing.
  - `stop()`: index→0, **always `load_current_file()`**, pause, seek(0),
    `is_stopped=true`. (Always-reload added after the §2d discovery.)
  - `play()`: if `is_stopped` → `load_current_file()` (fresh start); else resume.
    Clears `is_stopped`.
  - `load_current_file_inner()`: clears `is_stopped` (covers goto/next/previous).
- `backend/src/blocks/builtin/mediaplayer/builder.rs` + `mod.rs` (test helper):
  `is_stopped: AtomicBool::new(false)` in both construction sites.
- `types/src/mediaplayer.rs`: new `SetLoopRequest { enabled: bool }`.
- `backend/src/api/mediaplayer.rs`: new handler `set_loop` —
  `POST /api/flows/{flow_id}/blocks/{block_id}/player/loop`, stores into the
  `loop_playlist` atomic. utoipa-annotated.
- `backend/src/lib.rs`: route registered (after player/goto).
- `backend/src/openapi.rs`: `set_loop` path + `SetLoopRequest` schema registered.
- OUTSTANDING (repo convention): `openapi.json` snapshot not regenerated
  (`cargo test --test openapi_test` needs toolchain; do before upstreaming).

### Open Live backend (repo `backend/`, runs via tsx + volume mount — restart container to apply)
- `src/lib/strom.ts`: `player.setLoop(flowId, blockId, { enabled })` →
  POST `…/player/loop`.
- `src/ws/controller.ts`:
  - `MEDIAPLAYER_TOGGLE_LOOP`: real handler calling `strom.player.setLoop`
    (with the usual `non-JSON response` catch).
  - Removed broken `ch0` meter-zero broadcast from `MEDIAPLAYER_CONTROL`
    (superseded by watchdog).
- `src/services/meter-relay.ts`: **channel meter watchdog** — tracks
  `chLastSeen` per relayed `chN`; every 300 ms, any channel silent >500 ms that
  previously reported gets ONE zero broadcast (`peak/rms [-100,-100]`); cleared
  when data resumes; `clearInterval` in relay stop.
- Pre-existing tsc errors (9 lines: productions.ts address/values, controller.ts
  SeekRequest position_ms-vs-ns type def) — NOT from this session, runtime OK via tsx.

### Open Live frontend (repo `frontend/`, vite dev server + volume mount — hot reloads)
- `src/components/MediaPlayerCard.tsx`:
  - `playlistDirty` ref: set on "Add clips to playlist"; PLAY sends
    SET_PLAYLIST+GOTO(0) only when dirty, else `SEEK(0)`+PLAY (restart current clip).
  - PAUSE toggles: `paused ? send play : send pause` (resume without seek).
  - Removed the software-loop `useEffect`.
  - `loopOn` synced from polled `playerState.loopPlaylist` via `useEffect`
    (LOOP button already sent `MEDIAPLAYER_TOGGLE_LOOP` — now it works).
  - STOP button unchanged (server handles reset-to-clip-1); highlight uses the
    now-correct `stopped` state.

## 5. Verification already performed (against previously deployed image)

All at Strom API level, flow `9b97b5aa…` (production `prod-f026e158-…`,
player block `b-input-2-f026e158`):

- ✅ 6× goto alternating 44.1k/48k clips: **0 not-negotiated**, position advancing.
- ✅ `:meter:1` emitting 10 Hz with real levels (rms ≈ -22 dB) while playing —
  channel meter data alive end-to-end at Strom.
- ✅ STOP from clip 1 → `stopped idx:0 pos≈0`; PLAY → playing idx 0.
- ✅ PAUSE mid-clip → paused, position preserved; resume via play → continues (not reset).
- ✅ `POST /player/loop` live: loop:True immediately.
- ✅ EOS loop ON: clip 0 → advance to clip 1; last clip → wrap to clip 0.
- ✅ EOS loop OFF at last clip → `stopped idx:0 pos≈0`.
- ✅ Single-clip loop ON: EOS restarts same clip; STOP during loop works;
  loop OFF single clip EOS → stopped.
- ✅ Replay after EOS-stop at index 0: stop→play 2.3s→4.4s, repeated twice (state.rs fix).
- ✅ Meter watchdog: 51 live ch1 msgs while playing, zero broadcast 734ms after stop.
- ✅ Reactivation relay restart: meter-relay switches to new flow automatically.
- ✅ Full button matrix: PLAY/Pause-toggle/STOP at clip 1/NEXT EOS/LOOP multi+single.
- ✅ Backend WS test: 51 ch1 live msgs → zero at +734ms.

---

## 6. HOW TO CONTINUE (exact steps)

```bash
# 1. Rebuild the Strom image (source already contains all fixes) — ~5 min
docker build --no-cache -t open-live-strom-ndi:0.6.6-mpfixed \
  -f /home/nygard/open-live/docker/strom-fix/Dockerfile /home/nygard/open-live/strom/

# 2. Redeploy strom (backend/frontend already have their changes via mounts;
#    backend was already restarted this session)
cd /home/nygard/open-live/open_live_local && docker compose up -d --force-recreate strom

# 3. Reactivate the production
curl -s -X POST http://192.168.1.11:8000/api/v1/productions/prod-f026e158-72b0-4952-8c9f-046eb34aa2e0/deactivate
sleep 3
curl -s -X POST http://192.168.1.11:8000/api/v1/productions/prod-f026e158-72b0-4952-8c9f-046eb34aa2e0/activate
# fetch new stromFlowId from GET /api/v1/productions/<id>
```

Then verify, in order:
1. **§2d regression**: single-clip playlist, loop OFF, let it EOS (or seek near
   end), confirm `stopped`; then `play` → must actually play from 0 (this was
   the aborted fix). Repeat stop→play twice.
2. **Meter watchdog**: connect WS
   `ws://192.168.1.11:8000/ws/productions/<prodid>/controller`, play (expect
   `METER_DATA elementId:'ch1'` with real values), stop → expect one zero
   broadcast (`peak [-100,-100]`) within ~800 ms.
3. **Full clip-change matrix** (the original complaint): alternate BBB ↔
   go1080p25 several times via UI, audio + meter alive each time, 0
   `not-negotiated` in `docker logs open-live-local-strom`.
4. **UI button matrix** (user in browser, hard-refresh): PLAY/PAUSE-toggle/STOP
   highlight/NEXT/LOOP single + multi clip per spec §3.
5. Update `MEMORY.md` (mediaplayer TODO section + session log) and remove this file.

Useful test snippets (bash): seek near end to force EOS quickly:
`dur=$(curl -s -H "Authorization: Bearer dev-key-local" $base/state | python3 -c "import json,sys;print(json.load(sys.stdin)['duration_ns'])")`
then POST `$base/seek` with `{"position_ns": $((dur-2000000000))}`.

## 7. Constraints / conventions (do not violate)

- **Nothing is committed or pushed** — 3 repos dirty (strom, backend, frontend).
  User approves pushes explicitly; audio dynamics work stays local.
- Rollback image exists: `open-live-strom-ndi:0.6.6-mpfixed-bak` (pre-session).
- `STROM_IMAGE=open-live-strom-ndi:0.6.6-mpfixed` in `open_live_local/.env`.
- Strom repo has its own `CLAUDE.md` (English-only, no emojis in logs, weak refs
  in GStreamer closures, openapi snapshot test, etc.) — follow it for strom edits.
- Backend runs via tsx (volume mount) — container restart applies changes.
  Frontend is vite dev server — hot reload, browser hard-refresh recommended.
- Verifying custom binary in image: `docker exec open-live-local-strom grep -c
  "cfilter" /app/strom` (≥4). `strings` gives false negatives; unused `static`
  markers get eliminated in release builds — verify by BEHAVIOR, not strings.
- 44.1 kHz files now get resampled once to 48 kHz inside the mediaplayer (user-approved).
