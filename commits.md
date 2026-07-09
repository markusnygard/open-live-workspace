# Pending Commits & PRs

> Date: 2026-07-07. Lists all changes across repos that need to be submitted.
> Generated after the modular studio build session.

---

## Repo: Eyevinn/open-live (backend)

**Status:** 10 commits ahead of origin, push blocked (no permission).
**Action:** Fork repo and submit as PR, or request push access.

| Commit | Description |
|--------|-------------|
| `8236a42` | PiP support: SET_PIP / SELECT_PVW_PIP handlers, PIP_STATE broadcast on connect, num_pips passed to flow-generator, StromClient PiP methods (mixer.getState, updatePip, selectPreviewPip), TAKE tally swap with PiP state, output-flows routes |
| `a2d0c96` | ⚠️ **Audio dynamics WS handler** (AUDIO_DYNAMICS_SET/STATE), block property update method, per-channel element mapping — **KEEP LOCAL until tested** |
| `93f991a` | docs: final media player state, remaining TODOs in MEMORY.md |
| `3d0e01e` | fix: WHEP endpoint URLs use `/api/whep/` path instead of `/whep/` |
| `6c14bb2` | fix: catch non-JSON responses inline, fix db.get -> getSourcesDb, simplify meter zeroing to ch0 |
| `f2a4a08` | fix: software loop via frontend, audio meter zeroing on stop/pause, loop_playlist default false |
| `0fa94b6` | fix: stop media player after activation, default loop_playlist to true |
| `0ef2a34` | fix: media player playlist sync, state polling, loop fix |
| `c4642fe` | fix: handle setPlaylist non-JSON 200 response, add playlist debug logs |
| `9e14656` | fix: media player block matching by padIndex, path construction, mount at /host/media |

**Key files changed:**
- `src/ws/controller.ts` — PiP handlers, TAKE swap, tally improvements, AUDIO_DYNAMICS_SET
- `src/lib/flow-generator.ts` — num_pips support, output flow builder
- `src/lib/strom.ts` — mixer.getState, updatePip, selectPreviewPip, player.setLoop
- `src/routes/output-flows.ts` — new file: output flow start/stop/status endpoints
- `src/services/meter-relay.ts` — meter watchdog, flow change detection
- `src/server.ts` — output flows route registration

---

## Repo: Eyevinn/open-live-studio (frontend)

**Status:** 10 commits ahead of origin, push blocked (no permission).
**Action:** Fork repo and submit as PR, or request push access.

| Commit | Description |
|--------|-------------|
| `45ab550` | fix: pan slider L/R at edges with value overlay on hover, fader height 220px for pan room, mediaplayer button logic improvements |
| `fffe21c` | ⚠️ **Audio processing** — H/G/C/E buttons, pan slider, ProcessingPopup with gain/hpf/gate/comp/EQ — **KEEP LOCAL until tested** |
| `b9c84d3` | fix: send GOTO(0) before PLAY to force loading updated playlist |
| `3933b1e` | fix: software loop — restart playback when loopOn and state==stopped |
| `5ceed3f` | fix: button border styling reflects player state, clean zinc borders |
| `87120a6` | fix: media player playlist sync, state polling, loop fix |
| `2ae9de1` | fix: media player browser defaults to /host/media path |
| `465c6c8` | feat: media player redesign — progress bar overlay, loop button, PopOutIcon, grid layout, GOTO on click |
| `a608f70` | fix: wire media player transport buttons to MEDIAPLAYER_CONTROL WS messages |
| `b684022` | fix: extract MediaPlayerCard to separate file — prevents React remount on re-render |

**Key files changed:**
- `src/pages/ControllerPage/AudioPanel.tsx` — pan slider (L/R layout, value overlay, fader height)
- `src/components/MediaPlayerCard.tsx` — transport buttons, playlist, loop, progress bar

---

## Repo: markusnygard/strom (local fork)

**Status:** Pushed ✅

| Commit | Description |
|--------|-------------|
| `2b67e99` | feat: mediaplayer audio normalization (resample to 48kHz in bridge), is_stopped flag for state reporting, live loop endpoint, pre-emptive EOS guard, appsrc cycling after Playing |

**Key files changed:**
- `backend/src/blocks/builtin/mediaplayer/bridge.rs` — audio normalize chain (audioconvert → audioresample → capsfilter at 48kHz/2ch/F32LE), EOS handler pre-emptive guard
- `backend/src/blocks/builtin/mediaplayer/state.rs` — is_stopped flag, stop() always reloads, play() reloads from stopped, appsrc PAUSED→PLAYING cycle
- `backend/src/api/mediaplayer.rs` — set_loop endpoint (POST /player/loop)
- `types/src/mediaplayer.rs` — SetLoopRequest type

**Note:** This fork is also deployed as the custom Docker image `open-live-strom-ndi:0.6.6-mpfixed`. Building it requires the base image `eyevinntechnology/strom-full:0.6.6` (Dockerfile at `docker/strom-fix/Dockerfile`).

---

## Repo: open-live-modular-studio (new)

**Status:** Pushed ✅ — https://github.com/markusnygard/open-live-modular-studio

Full modular studio with all 20 tasks completed. See `docs/superpowers/plans/2026-07-07-modular-studio.md` for implementation details.

---

## Repo: open-live-workspace (root)

**Status:** Pushed ✅ — https://github.com/markusnygard/open-live-workspace

| Content | Description |
|---------|-------------|
| `MEMORY.md` | Merge transition feature request, modular studio documentation |
| `CLAUDE.md` | Session handoff document |
| `docs/superpowers/specs/` | Modular studio design spec |
| `docs/superpowers/plans/` | Modular studio implementation plan |
| `docker/strom-fix/Dockerfile` | Fixed Dockerfile pointing to strom-full base |
| `dashboard/server.mjs` | Modular studio start/stop/open buttons |

---

## ⚠️ Items to KEEP LOCAL (do not push upstream)

1. **Audio dynamics** — `AUDIO_DYNAMICS_SET/STATE` WS handler in backend, H/G/C/E buttons + ProcessingPopup in frontend. Needs testing at scale before submitting. Marked with ⚠️ above.
2. **ProcessingPopup component** — `frontend/src/components/ProcessingPopup.tsx` is local-only.

---

## Recommended PR Strategy

1. **First PR (backend):** All commits EXCEPT `a2d0c96` (audio dynamics). Cherry-pick or rebase to exclude.
2. **First PR (frontend):** All commits EXCEPT `fffe21c` (audio processing). Cherry-pick or rebase to exclude.
3. **Later PR (both):** Audio dynamics when tested and ready.

To cherry-pick without the audio commits:
```bash
# Backend
cd backend
git log --oneline origin/main..HEAD
# Pick commits except a2d0c96
git checkout -b pr/piP-mediaplayer origin/main
git cherry-pick 9e14656 c4642fe 0ef2a34 0fa94b6 f2a4a08 6c14bb2 3d0e01e 93f991a 8236a42

# Frontend
cd frontend
git log --oneline origin/main..HEAD
# Pick commits except fffe21c
git checkout -b pr/pan-mediaplayer origin/main
git cherry-pick b684022 a608f70 465c6c8 2ae9de1 87120a6 5ceed3f 3933b1e b9c84d3 45ab550
```
