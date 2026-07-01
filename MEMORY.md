# Open Live — Project Memory

> Auto-updated context file tracking all decisions, references, and architecture.

## Project Overview

**Open Live** is a broadcast production platform built with:
- **Strom** — GStreamer-based pipeline/media engine (Eyevinn)
- **Open-Live** (backend) — Fastify REST + WebSocket API server, manages productions, sources, templates. Persists to CouchDB.
- **Open-Live-Studio** (frontend) — React 19 + Vite + TailwindCSS v4, browser-based production controller.

### Two Deployment Modes

| Mode | Strom | Open-Live | Open-Live-Studio |
|------|-------|-----------|-----------------|
| **open_live_local** | Local (Docker) | Local (LAN) | Local (LAN) |
| **open_live_hybrid** | Local (Docker) | OSC (cloud) | OSC (cloud) |

---

## Organizations & Platforms

### Eyevinn (main GitHub org) — https://github.com/Eyevinn
- Contains: strom, open-live, open-live-studio, open-live-companion-module, intercom-manager, intercom-frontend

### EyevinnOSC (Open Source Cloud) — https://github.com/EyevinnOSC
- Platform: https://www.osaas.io
- Revenue-sharing model with open source creators
- SDKs: TypeScript (client-ts), Go (client-go)
- Tools: Terraform provider, MCP server, VSCode extension
- Community wiki: https://github.com/EyevinnOSC/community/wiki (239 pages)
- Slack: https://slack.osaas.io

---

## Reference Sources

### Core Repositories (Forked)

| Repo | Upstream | Fork (ours) | Local Path |
|------|----------|-------------|------------|
| Open-Live (backend) | https://github.com/Eyevinn/open-live | https://github.com/markusnygard/open-live | `./backend/` |
| Open-Live-Studio (frontend) | https://github.com/Eyevinn/open-live-studio | https://github.com/markusnygard/open-live-studio | `./frontend/` |
| Strom | https://github.com/Eyevinn/strom | https://github.com/markusnygard/strom | `./strom/` |

### Companion & Intercom Repos (Reference Only)

| Repo | URL | Purpose |
|------|-----|---------|
| Open-Live Companion Module | https://github.com/Eyevinn/open-live-companion-module | Stream Deck / Bitfocus Companion control for Open Live |
| Intercom Manager | https://github.com/Eyevinn/intercom-manager | Open Intercom backend |
| Intercom Frontend | https://github.com/Eyevinn/intercom-frontend | Open Intercom browser UI |
| Intercom Companion Module | https://github.com/Eyevinn/companion-module-eyevinn-intercom | Stream Deck control for Intercom |

### Key Documentation URLs

| Source | URL |
|--------|-----|
| Open Source Cloud (OSC) | https://www.osaas.io |
| OSC Token Service | https://token.svc.prod.osaas.io/servicetoken |
| OSC Community Wiki | https://github.com/EyevinnOSC/community/wiki |
| User Guide: Strom Local Setup | https://github.com/EyevinnOSC/community/wiki/User-Guide:-Strom-Local-Setup |
| User Guide: Open Live Setup | https://github.com/EyevinnOSC/community/wiki/User-Guide:-Open-Live-Setup |
| User Guide: Companion Module | https://github.com/EyevinnOSC/community/wiki/User-Guide:-Open-Live-Companion-Module |
| Service: Open Live | https://github.com/EyevinnOSC/community/wiki/Service:-Open-Live |
| Service: Open Live Studio | https://github.com/EyevinnOSC/community/wiki/Service:-Open-Live-Studio |
| Service: Strom | https://github.com/EyevinnOSC/community/wiki/Service:-Strom |
| Service: Intercom | https://github.com/EyevinnOSC/community/wiki/Service:-Intercom |
| Strom OPEN_LIVE_SETUP.md | https://github.com/Eyevinn/strom/blob/main/docs/OPEN_LIVE_SETUP.md |
| OSC Intercom Portal | https://intercom.apps.osaas.io |
| Open Live Hosted Demo | https://openlive.apps.osaas.io |

### Docker Images
| Image | Notes |
|-------|-------|
| `eyevinntechnology/strom-full:latest` | Strom pipeline engine |
| `couchdb:3.3` | CouchDB database |
| `node:23-slim` | Node.js runtime |

---

## Architecture Deep Dive

### Backend (Open-Live) — `/backend/`

- **Framework**: Fastify 5 with TypeScript (ESM, Node16)
- **Database**: CouchDB via `nano` library, single DB with discriminated document types (`type` field)
- **Strom Integration**: `StromClient` (typed HTTP client) + `flow-generator` (transforms production definitions into GStreamer pipeline flows)
- **Auth**: Two modes — `osc` (PAT→SAT exchange for OSC-hosted Strom) or `direct` (API key for self-hosted)
- **WebSocket**: `/ws/productions/:id/controller` for real-time switching, audio mixing, macros, tally
- **Port**: 3000 (default), 8000 (in docker-compose)

### Frontend (Open-Live-Studio) — `/frontend/`

- **Framework**: React 19, React Router v7, Vite, TailwindCSS v4
- **State**: Zustand v5 with immer middleware (11 stores)
- **API Client**: Custom `request()` wrapper with OSC auth token injection
- **WebRTC**: WHEP protocol for streaming video previews
- **Dev Port**: 5173, mapped to 3000 in docker-compose

### Strom

- **Role**: GStreamer pipeline engine, runs video/audio flows
- **API**: REST at port 8080, WebSocket at `/api/ws`
- **Key blocks**: `builtin.vision_mixer`, `builtin.audio_mixer`, `videoenc_`, `whep`, `srtsink`, `cefsrc`
- **Docker**: `eyevinntechnology/strom-full:latest`

### Service Architecture

```
[Browser] → (WHEP/WebRTC) → [Strom] ← (REST API) ← [Open-Live] → [CouchDB]
[Browser] → (WebSocket) → [Open-Live]
[Browser] → (REST API) → [Open-Live]
[Studio UI] → (REST/WS) → [Open-Live Backend]
```

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `COUCHDB_URL` | Full CouchDB connection URL |
| `STROM_URL` | Base URL of Strom (e.g., `http://strom:8080`) |
| `STROM_TOKEN` | OSC Personal Access Token (for OSC-hosted Strom) |
| `STROM_AUTH_MODE` | `osc` (default) or `direct` |
| `CORS_ORIGIN` | Allowed CORS origin (frontend URL) |
| `VITE_API_URL` / `OPEN_LIVE_URL` | Backend API URL for frontend |

---

## Deployment Configurations

### `open_live_local/` — Full Stack on LAN
- **docker-compose.yml**: Runs 4 services — CouchDB, Strom, Open-Live backend, Open-Live-Studio UI
- All services run in Docker on a single host or same LAN
- Backend connects to local Strom via `STROM_AUTH_MODE=direct`
- Studio builds with `VITE_OPEN_LIVE_API_URL` pointing to local backend
- Studio available at `http://<IP>:3000`, backend at `http://<IP>:8000`, Strom at `http://<IP>:8080`

### `open_live_hybrid/` — Strom Local + Cloud OSC
- **docker-compose.yml**: Runs 2 services — CouchDB, Strom (local)
- Open-Live backend and Studio UI are deployed on OSC (Open Source Cloud at osaas.io)
- Strom must be exposed to the internet (with API key auth) so OSC-hosted backend can reach it
- OSC backend configured with `STROM_URL=<public-ip>:8080` and `STROM_AUTH_MODE=direct`
- Requires `STROM_API_KEY` set on both local Strom and OSC backend

### Strom Authentication Modes
| Mode | Use Case | Config |
|------|----------|--------|
| `osc` | Strom hosted on OSC | `STROM_TOKEN=<PAT>`, exchanged for SAT |
| `direct` | Self-hosted Strom (local/hybrid) | `STROM_TOKEN=<API_KEY>` used as Bearer token |

### Strom Setup Reference
- Optimal: Linux host with NVIDIA GPU + Docker
- GPU setup: `nvidia-driver` + `nvidia-container-toolkit`
- Ice servers: Default Google STUN for demo, configure own STUN/TURN for production
- Auth: Enable `STROM_API_KEY` + `STROM_ADMIN_USER` for internet exposure
- See: [OPEN_LIVE_SETUP.md](https://github.com/Eyevinn/strom/blob/main/docs/OPEN_LIVE_SETUP.md)

### OSC Deployment (Open Live + Studio on Cloud)

The platform can be fully deployed on OSC at osaas.io:

1. **CouchDB** — Create instance, set alphanumeric password, create `open-live` database, construct connection string: `https://admin:<password>@<hostname>/open-live`
2. **Open Live** — Create instance with `DatabaseUrl`, `StromUrl`, `StromAccessToken`
3. **Open Live Studio** — Create instance with `OpenLiveUrl` pointing to Open Live from step 2

> Password must be alphanumeric only — `@`, `:`, `/`, `#` break URL parsing.
> Do NOT double-prefix `https://` in the DatabaseUrl hostname portion.

### Open-Live Companion Module (Stream Deck)

- **Bitfocus Companion** v3.0+ module for Open Live
- **4-page default layout** (shipped as `.companionconfig`):
  - Page 1: Productions — list all active productions, tap to select
  - Page 2: Video Control (M/E) — PGM bus (red), PVW bus (green), TAKE, AUTO, FTB, DSK, OVL alpha
  - Page 3: Audio Mixer — per-channel mute, vol up/down, rotary faders
  - Page 4: Audio X — shared action buttons for one channel at a time
- **Actions**: Cut, Auto/Take, FTB, Graphics on/off, DSK toggle, macros, overlay alpha, Go Live/Cut Stream
- **Feedbacks**: PGM/PVW tally, On Air, FTB active, Graphic active, DSK visible
- **Variables**: production_name, pgm_source, pvw_source, on_air, ftb_active, ovl_alpha, source_names
- Connects to Open Live API URL (local or OSC-hosted). Supports OSC PAT for auth.

### Open Intercom (Optional Add-on — WebRTC Voice)

- Browser-based voice intercom for broadcast production teams
- Built on WebRTC with Symphony Media Bridge (SMB)
- Uses CouchDB for state (separate from Open Live's CouchDB)
- **Productions** = communication sessions (one per show)
- **Lines** = audio channels within a production; participants on same line hear each other
- **Audio Feed lines** = listen-only monitoring (e.g., program output from mixer)
- Supports WHIP/WHEP external audio sources, push-to-talk, hotkeys, external sharing
- Stream Deck integration via companion-module-eyevinn-intercom
- Easy install: https://intercom.apps.osaas.io

---

## Progress Log

| Date | Event |
|------|-------|
| 2026-06-27 | Project initialized. `open_live_local/` and `open_live_hybrid/` folders created (empty). |
| 2026-06-27 | GitHub CLI `gh` v2.64.0 installed at ~/.local/bin/gh. Auth pending. |
| 2026-06-27 | MEMORY.md created as project memory agent. |
| 2026-06-27 | Explored backend (`/backend/src/`) and frontend (`/frontend/src/`) source structure in detail. |
| 2026-06-27 | Fetched Strom README and OPEN_LIVE_SETUP.md for deployment reference. |
| 2026-06-27 | Created `open_live_local/docker-compose.yml` — 4-service full local stack. |
| 2026-06-27 | Created `open_live_hybrid/docker-compose.yml` — 2-service (Strom+CouchDB) for hybrid mode. |
| 2026-06-27 | GitHub authenticated as **markusnygard**. Forked all 3 repos. Cloned Strom locally. |
| 2026-06-27 | Added `fork` remotes to backend (`markusnygard/open-live`) and frontend (`markusnygard/open-live-studio`). |
| 2026-06-27 | Read and ingested all reference docs: OSC community wiki (Strom Setup, Open Live Setup, Companion Module, Intercom), EyevinnOSC org page, companion module README. |
| 2026-06-27 | Added comprehensive reference links for OSC deployment, Companion module, and Intercom to MEMORY.md. |
| 2026-06-27 | Created `dashboard/` — Node.js status server with web UI on port 3100. Monitors Docker containers for both modes. Start/stop buttons per mode. |
| 2026-06-27 | Dashboard: Added "Show Containers" (docker compose ps modal) and "Stop All Containers" (docker compose down --volumes) features. |
| 2026-06-27 | Dashboard: Created desktop shortcut (~/Desktop/open-live-dashboard.desktop) with hidden terminal, one-click launch. |
| 2026-06-27 | Dashboard: Added per-container restart buttons, "Start" and "Stop All" mode buttons, `/api/start/:mode` and `/api/restart/:mode/:name` endpoints. |
| 2026-06-27 | Created `markusnygard/open-live-workspace` repo. Pushed dashboard, MEMORY.md, deployment configs. |
| 2026-06-27 | Pinned versions: Strom `0.6.6`, CouchDB `3.5.2`. All 3 repos use single `main` branch. |
| 2026-06-27 | Started local stack: Strom :8080, Backend :8000, Studio :3000, CouchDB :5984. |
| 2026-06-27 | Dashboard: Real version display via HTTP probes (Strom, CouchDB) + git tags (Open-Live v0.4.0, Studio v0.4.0). |
| 2026-06-27 | Dashboard: Made cross-platform (Linux/macOS/Windows). Replaced curl with Node.js HTTP, removed all POSIX shell deps. Added start.bat. |
| 2026-06-27 | Dashboard: Added "Open Studio" button (only when studio is running), uses `window.location.hostname` for LAN access. |
| 2026-06-27 | Docker-compose fixes: healthcheck (curl→python3), volume paths (../../→../), STROM_AUTH_MODE=direct, image tag delimiter (':'→'|'). |
| 2026-06-27 | Dashboard: Added container uptime display (e.g., "up: 6h 10m"). |
| 2026-06-27 | **NDI integration**: Built custom `open-live-strom-ndi:0.6.6` Docker image with NDI SDK + GStreamer NDI plugin. NDI blocks verified working. |
| 2026-06-27 | Added NDI (`ndi`) and SDI (`sdi`) output types to Open Live backend + frontend. Flow-generator injects `builtin.ndi_output` and `builtin.decklink_output`. |
| 2026-06-27 | Added NDI (`ndi`) source type to Open Live. Backend: `/api/v1/ndi/sources` proxy endpoint, `builtin.ndi_input` in flow-generator (uses `url_address` for direct TCP, `ndi_name` for mDNS fallback). Frontend: NDI discovery dropdown in SourcesPanel auto-fills IP:port. |
| 2026-06-27 | Created `/api/v1/capabilities` endpoint — checks Strom's device discovery to dynamically show/hide NDI/SDI options in UI. SourcesPanel and OutputsPanel adapt. |
| 2026-06-27 | **WHEP fix**: Split STROM_URL (backend API) from STROM_PUBLIC_URL (browser WHEP). Frontend skips WHEP proxy for localhost URLs. Enables WHEP + NDI simultaneously in host networking mode. |
| 2026-06-27 | Docker networking: `network_mode` defaults to compose network (bridge → `strom` DNS); host mode for NDI requires `STROM_NETWORK_MODE=host` + `STROM_HOST=host.docker.internal`. Persistent `.env` file created. |
| 2026-06-27 | Fixed Studio API base URL doubling (`/api/v1/api/v1/...`) — `OPEN_LIVE_URL` no longer includes `/api/v1`. Vite proxy targets `http://open-live:8000`. |
| 2026-06-27 | NDI discovery: 5 vMix sources on LAN confirmed working in host mode. NDI inputs use direct IP:port for bridge-mode compatibility. |
| 2026-06-28 | **End of session**: All containers stopped. Persistent `.env` preserves all settings. Tomorrow: `docker compose up -d` restores full stack. |
| 2026-06-28 | **Session 2**: Dashboard started, all 4 containers verified running with host mode + NDI discovery (4 sources). |
| 2026-06-28 | **SDI source type** added: `'sdi'` in StreamType, `builtin.decklink_input` in flow-generator. Device number dropdown in SourcesPanel (0-N). |
| 2026-06-28 | **SDI output device selection**: OutputsPanel now shows Device Number dropdown instead of fixed '0'. Flow-generator reads from `outputDoc.url`. |
| 2026-06-28 | **Dynamic DeckLink count**: `/api/v1/capabilities` now returns `sdiDevices` from Strom's device discovery (counts `decklinkdeviceprovider` entries). UI adapts dynamically. |
| 2026-06-28 | **No-hardware message**: When `sdiDevices=0`, SourcesPanel and OutputsPanel show "No DeckLink hardware detected" instead of device dropdowns. |
| 2026-06-28 | **DeckLink status**: No DeckLink hardware found on this machine (`/dev/blackmagic/` absent, `decklinkvideosrc` not in GStreamer). Driver installation + reboots likely needed. |
| 2026-06-28 | Stopped containers. All changes committed + pushed to 3 forks. |
| 2026-06-28 | **Session 3**: Dashboard started, containers verified. GPU (Quadro P6000) detected and enabled via nvidia-container-toolkit. |
| 2026-06-28 | **SDI debugging**: DeckLink driver reinstalled, desktopvideo 15.3.1a4. `/dev/blackmagic/io0-4` mounted. GPU-accelerated encoding working (NVENC). |
| 2026-06-28 | DeckLink block fails: `decklinkvideosrc ! videoconvert` succeeds raw but fails through Strom's block (GStreamer 1.22.12 plugin incompatible with Desktop Video 15.3). SDI deferred. |
| 2026-06-28 | **NDI working**: 5 vMix sources + NDI Tools Test Pattern. Flow plays at 1920x1080 with GPU. WHEP working (multiview + PGM). |
| 2026-06-28 | **Vision mixer control fixed**: `selectPreview` API changed to `PUT {source: {input: N}}` (was `POST {input: N}`). Transition `POST` with `from_input`/`to_input` works. CUT/TAKE functional. |
| 2026-06-28 | **Frontend updated from upstream**: Pulled latest Eyevinn/open-live-studio (PiP, data:text/html sources, etc). Resolved merge conflicts. Backend kept at our fork version (too many upstream conflicts). |
| 2026-06-28 | **PGM WHEP fix**: PGM preview had hardcoded `proxyUrl` — added conditional bypass for localhost URLs, matching multiview behavior. |
| 2026-06-28 | **LAN WHEP rewrite**: WHEP URLs rewrite `localhost` → `window.location.hostname` for remote LAN access. |
| 2026-06-28 | **Dashboard fixes**: "Show Containers" now parses newline-delimited JSON from `docker compose ps`. LAN Studio access via `IP=192.168.1.11` in `.env`. |
| 2026-06-28 | **Strom networking**: Host mode for WHEP + NDI. Bridge mode WHEP broken (ICE/UDP ports not exposed). Compose: `network_mode: host`, `privileged: true`, NVIDIA GPU deploy config, DeckLink mounts. |
| 2026-06-28 | **NIDI Test Pattern**: Vizrt NDI Tools produces audio-only stream initially; video (still image, 1920x1080@25, UYVY, BT.709) appears after ~20s. vMix NDI works immediately. |
| 2026-06-28 | **End of session**: Containers stopped. All changes committed. `.env` preserves IP=192.168.1.11, GPU, host networking. |
| 2026-06-29 | **DeckLink plugin fix found**: Root cause is GStreamer decklink plugin version mismatch. Working image `dev-70d0ad4` has plugin 1.26.5 (built from gst-plugins-bad 1.26.5, Aug 2025). Current `strom-full:0.6.6` bundles old plugin 1.22.12 (Apr 2024) incompatible with Desktop Video 15.3.1a4. |
| 2026-06-29 | Rebuilt `open-live-strom-ndi:0.6.6` with working decklink .so from `dev-70d0ad4`. Raw GStreamer tests all pass: `decklinkvideosrc ! videoconvert ! x264enc/nvh264enc → PAUSED`. Strom block still fails (separate audio/video mode issue). |
| 2026-06-29 | **DeckLink root cause**: Patched decklink plugin (1.22.12 from `patched-plugins-v1.0-gst1.22.12`) bundled in `strom-full` is incompatible with Desktop Video 15.3. System gst-plugins-bad 1.26.5 (reinstalled via apt) works. Dockerfile updated to reinstall system package. |
| 2026-06-29 | Rebuilt Strom from source twice (queue fix, capsfilter+queue fix) — raw GStreamer works but Strom block system has pipeline construction bug at READY state. SDI deferred; Strom issue filed. |
| 2026-06-29 | Flow-generator improvements: NV12 videoformat block between mixer and encoders, auto-assign default template (tmpl-default-vision-mixer) when production has none. |
| 2026-06-29 | Companion module: Added `/api/v1/productions/:id/controllers` endpoint, added `id` field mapping to list endpoint. |
| 2026-06-30 | **DeckLink fully resolved**: Root cause was mount path mismatch — DeckLink API RUNPATH `$ORIGIN/blackmagic/DesktopVideo` looks for `libc++.so.1` relative to the API library. Changed mounts to `/lib/` paths per Strom docs. Cards: 1× DeckLink 4K Extreme (replaced), 1× Quad 2 (8 sub-devices, 0-7), 1× Duo 2 (4 sub-devices, 8-11) = 12 live SDI inputs. |
| 2026-06-30 | **Strom Web UI**: Accessible at http://192.168.1.11:8080/ with login `admin` / `strom` (STROM_ADMIN_USER + bcrypt hash, escape `$` as `$$` in .env for Docker Compose). |
| 2026-06-30 | Companion module rebuilt: page navigation via `set_page` action + `navigate_page` variable, all productions shown (active=green idle, inactive=grey), `production_slot_active` feedback. |
| 2026-06-30 | Backend fixes: production creation now accepts `sources` array in initial POST, `ProductionPatch` schema accepts booleans, SDI device count via `SDI_DEVICE_COUNT` env var fallback (set to 12), SDI audio routing uses `audio_out` pad (not `audio_out_0`). |
| 2026-06-30 | **SDI+NDI hybrid production**: Tested successfully — 1× DeckLink SDI input + 2× NDI sources running simultaneously with video + audio. |

---

## Future Features

> Design specs for features planned but not yet implemented.
> Each feature is self-contained and can be built independently.

---

### Feature: Media Player Input

**Goal:** Add `mediaplayer` as a new source/input type in Open Live Studio, using Strom's `builtin.media_player` block. Each media player instance acts as a separate video+audio input source with independent transport controls, playlist management, and clip trimming (mark in/out).

**Why:** Broadcast productions need clip playback — bumpers, advertisements, video wall loops, audio jingles, background music. Multiple simultaneous media players let the operator, e.g., play a bumper from one player while a video loop runs on another and background audio plays from a third — all routed as separate mixer channels.

**Architecture:**

- New `streamType: 'mediaplayer'` in DB types, zod schemas, and frontend types
- Source document stores per-instance config: `path` (folder/URL), `playlist` (clip list), `inMarker`/`outMarker` per clip, `loop` boolean
- Flow-generator creates `builtin.media_player` block per media player source. On activation, the playlist is set via `POST /api/flows/{flow_id}/blocks/{block_id}/player/playlist`. Video output routes to the vision mixer via the standard offset block chain; audio output routes to the audio mixer on a separate channel strip.
- Media player controls (play, pause, stop, skip next, skip prev, loop toggle, seek, goto) execute through Strom's `player.control()`, `player.seek()`, `player.goto()` API methods (already implemented in `strom.ts:700`). State polling via `player.getState()`.
- Multiple media players can be added to a production — each gets a independent Strom block instance and independent controls.

**Strom API already available:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/flows/{flow_id}/blocks/{block_id}/player/control` | POST | play, pause, stop, next, previous |
| `/api/flows/{flow_id}/blocks/{block_id}/player/seek` | POST | Seek to position (ns) |
| `/api/flows/{flow_id}/blocks/{block_id}/player/goto` | POST | Go to playlist index |
| `/api/flows/{flow_id}/blocks/{block_id}/player/playlist` | POST | Set full playlist (file URIs) |
| `/api/flows/{flow_id}/blocks/{block_id}/player/state` | GET | Get position, duration, state, current file |

**UI Components (frontend):**

- **SourcesPanel:** `mediaplayer` shown as a creatable type when Strom capabilities confirm block availability. Form fields: name + browse-button for clip folder (local disk, network share, or S3 URL — manual text entry as fallback).
- **Media Browser modal:** File picker showing clips in the configured folder. Supports selecting multiple clips to create a playlist. Right-click to group selected clips.
- **Clip Editor window:** Timeline-like thumbnail strip for a single clip, with draggable in/out markers. Shown when clicking a clip in the playlist.
- **Media Controls bar (bottom or side panel):** Transport buttons (play/pause, stop, skip, loop toggle), clip name display, position/timecode counter. Shown when the production has at least one media player.
- **Multiple players:** If >1 media player exists in production, a dropdown or tab selector switches between players. Each player keeps its own playlist, transport state, and marks independently.

**Format recommendations (by storage type):**

| Storage | Recommended | Works (caution) | Avoid |
|---------|-------------|-----------------|-------|
| Local SSD | Any format | — | — |
| Network 1 Gbps | MP4/H.264 ≤50 Mbps, MP3, WAV 48kHz | ProRes 422, DNxHD | ProRes 4444 (>200 Mbps) |
| Network 10 Gbps | Any format | — | — |
| S3 | MP4/H.264 "fast-start" ≤50 Mbps, MP3, WAV (small) | Large WAV | MXF (index at end), >100 Mbps, files >2 GB |

- **Video default:** MP4/H.264 (High@L4.1, 25-50 Mbps) + AAC audio — universal, GPU-decodable via NVENC
- **Audio default:** WAV 48kHz/16-bit for quality; MP3 320kbps for small footprint (ideal for S3)
- **Lossless recorders:** WAV 48kHz/24-bit PCM (see Recorder feature)
- UI shows soft warnings for formats tagged "caution" based on selected storage type — never hard blocks

**Backend changes:**
1. `backend/src/db/types.ts` — add `'mediaplayer'` to `StreamType` union
2. `backend/src/routes/sources.ts` — add `'mediaplayer'` to zod enum, extend SourceInput with playlist fields (optional on create, set via dedicated endpoint)
3. `backend/src/lib/flow-generator.ts` — add new `else if` branch for `mediaplayer` stream type creating `builtin.media_player` block, routing video_out → offset → mixer, audio_out → mixer
4. `backend/src/ws/controller.ts` — add new WS message types: `MEDIAPLAYER_CONTROL`, `MEDIAPLAYER_SEEK`, `MEDIAPLAYER_GOTO`, `MEDIAPLAYER_STATE` (periodic polling broadcast)
5. `backend/src/routes/` — add `/api/v1/productions/:id/mediaplayers/:playerId/state` and `/control` proxy endpoints

**Frontend changes:**
1. `frontend/src/lib/api.ts` — add `'mediaplayer'` to `StreamType`, add `ApiMediaPlayer` interface, add `mediaPlayerApi` methods
2. `frontend/src/pages/SetupPage/SourcesPanel.tsx` — add mediaplayer to `CREATABLE_STREAM_TYPES` (when capabilities allow), add folder browse + playlist fields
3. `frontend/src/pages/production/` — new `MediaPlayerPanel.tsx` with transport controls, playlist editor, clip trimmer

**Configuration is per-production** — playlist, marks, and loop settings live inside the production document's source assignments. To reuse a media player setup, duplicate the production (see Production Duplication feature).

---

### Feature: Recorder Output

**Goal:** Add `recorder` as a new output type. Record programme output, clean feed (without DSK), or individual inputs to disk/network/S3. Supports PCM lossless format for post-production.

**Architecture:**

- New `outputType: 'recorder'` in output type enum
- Each recorder output has a configured storage path (local folder, SMB/NFS share, or S3 bucket) and a file format
- Flow-generator adds `splitmuxsink` (for compressed) or `filesink` (for raw PCM) elements to the flow
- Audio source selection: PGM audio mix, or pre-fader audio from a specific input channel
- Autonaming pattern: `{name}_{YYYY-MM-DD_HHmmss}.{ext}`

**File formats:**
| Format | Container | Video Codec | Audio Codec | Use Case |
|--------|-----------|-------------|-------------|----------|
| PCM (lossless) | WAV | none (audio only) | PCM 48kHz/24-bit | Post-production audio |
| H.264+AAC | MP4 | H.264 | AAC 256kbps | General recording |
| H.265+AAC | MP4 | H.265 | AAC 256kbps | 4K/UHD recording |

**Backend changes:**
1. `backend/src/db/types.ts` — add `'recorder'` to `OutputType` union
2. `backend/src/routes/outputs.ts` — add `'recorder'` to zod enum, extend with recorder-specific fields
3. `backend/src/lib/flow-generator.ts` — add `builtin.recorder` or raw `splitmuxsink`/`filesink` element for recorder outputs, wire audio/video from selected source
4. `backend/src/ws/controller.ts` — add `RECORDER_CONTROL` WS message (start/stop/pause recording)

**Frontend changes:**
1. `frontend/src/lib/api.ts` — add `'recorder'` to OutputType, add recorder API methods
2. `frontend/src/pages/SetupPage/OutputsPanel.tsx` — add recorder type with path browse, format select, audio source select

---

### Feature: Companion Module — Media Player & Recorder Sections

**Goal:** Add "Media Player" and "Recorder" sections to the companion module for Stream Deck control.

**Media Player section:**
| Button | Action | Feedback |
|--------|--------|----------|
| PLAY | Send `MEDIAPLAYER_CONTROL {action:'play'}` | Green when playing |
| PAUSE | Send `MEDIAPLAYER_CONTROL {action:'pause'}` | Yellow when paused |
| STOP | Send `MEDIAPLAYER_CONTROL {action:'stop'}` | — |
| SKIP NEXT | Send `MEDIAPLAYER_CONTROL {action:'next'}` | — |
| SKIP PREV | Send `MEDIAPLAYER_CONTROL {action:'previous'}` | — |
| LOOP TOGGLE | Toggle loop_playlist property | Green when looping |
| CLIP 1-8 | Send `MEDIAPLAYER_GOTO {index:N}` | Green when clip at index is loaded |

- When multiple media players exist, a dropdown or slot-based selector picks which player the buttons control.
- Position counter shown as a companion variable: `$(OpenLive:mediaplayer_position)` formatted as `HH:MM:SS`.

**Recorder section:**
| Button | Action | Feedback |
|--------|--------|----------|
| RECORD | Send `RECORDER_CONTROL {action:'start'}` | Red when recording |
| STOP | Send `RECORDER_CONTROL {action:'stop'}` | — |
| PAUSE | Send `RECORDER_CONTROL {action:'pause'}` | Yellow when paused |

**Companion module changes:**
1. `src/actions.ts` — add media player transport actions (`mediaplayer_control`, `mediaplayer_goto`, `mediaplayer_loop_toggle`), recorder actions (`recorder_control`)
2. `src/feedbacks.ts` — add media player state feedbacks (`mediaplayer_playing`, `mediaplayer_paused`, `mediaplayer_clip_active`), recorder feedbacks (`recorder_recording`)
3. `src/variables.ts` — add `mediaplayer_position`, `mediaplayer_clip_name`, `mediaplayer_clip_total`
4. `src/presets.ts` — add Media Player and Recorder presets with category groupings

---

### Feature: Production Duplication

**Goal:** Deep-copy an existing production with all its sources, outputs, graphics, macros, and media player playlists. The duplicate gets a new ID and a user-chosen name.

**Backend:** New endpoint `POST /api/v1/productions/:id/duplicate` with `{ name: string }` body. Creates a deep copy of the production document with new `_id`, copies all linked source assignments, output assignments, graphic assignments, macros, and template values. The new production starts in `inactive` state.

**Frontend:** "Duplicate" button in the production row or edit modal.

---

### Feature: Per-Channel Audio Dynamics (Gain, HPF, Gate, Compressor, EQ)

**Goal:** Expose the Strom mixer block's per-channel dynamics controls in the Studio mixer panel. Each channel strip gets a "Processing" button that opens a popup with gain, high-pass filter, gate, compressor, and 4-band parametric EQ.

**Why:** The Strom `builtin.mixer` block already has all these as live properties — values change instantly with no flow restart. The Stream Deck companion module already shows H/G/C/E buttons that open processing windows in Strom's own UI. Studio needs its own version.

**Already available in Strom (block-level properties):**
| Property | Range | Type |
|----------|-------|------|
| `chN_gain` | -20 to +20 dB | Float |
| `chN_hpf_enabled` | true/false | Bool |
| `chN_hpf_freq` | Hz | Float |
| `chN_gate_enabled` | true/false | Bool |
| `chN_gate_threshold` | dB | Float |
| `chN_gate_attack` | ms | Float |
| `chN_gate_release` | ms | Float |
| `chN_comp_enabled` | true/false | Bool |
| `chN_comp_threshold` | dB | Float |
| `chN_comp_ratio` | 1:1 to 20:1 | Float |
| `chN_comp_attack` | ms (0-200) | Float |
| `chN_comp_release` | ms (10-1000) | Float |
| `chN_comp_makeup` | 0 to 24 dB | Float |
| `chN_comp_knee` | -24 to 0 dB | Float |
| `chN_eq_enabled` | true/false | Bool |
| `chN_eq1-4_freq` | Hz | Float |
| `chN_eq1-4_gain` | -15 to +15 dB | Float |
| `chN_eq1-4_q` | 0.1 to 10 | Float |

All properties above have `live: true` — updates take effect immediately via `PATCH /api/flows/{flow_id}/blocks/{block_id}/properties`. Same API the WS controller already uses for volume/mute.

**UI Design:**
- Each channel strip in the mixer panel gets a "Proc" or gear icon button
- Clicking opens a **Processing popup** specific to that channel, with tabbed sections:
  - **Gain:** single knob (-20 to +20 dB)
  - **HPF:** enable toggle + frequency knob (20Hz-20kHz, log scale)
  - **Gate:** enable toggle + threshold/attack/release knobs
  - **Comp:** enable toggle + threshold/ratio/attack/release/makeup/knee
  - **EQ:** enable toggle + 4-band parametric (freq/gain/Q per band)
- Each enable toggle grays out its section when off
- Values are sent to the backend via WS `AUDIO_DYNAMICS` message type

**Backend changes:**
1. `backend/src/ws/controller.ts` — new WS message type `AUDIO_DYNAMICS` with `{ channelIndex, propertyName, value }`, routes to `strom.properties.updateBlock(flowId, audioMixerBlockId, { properties: { [name]: value } })`
2. No new API endpoints needed — uses existing block property update mechanism

**Frontend changes:**
1. New component `ProcessingPopup.tsx` with knob/slider controls per section
2. Mixer panel: add "Proc" button per channel, opens popup for that channel's index
3. Store current dynamics state in Zustand (synced via WS on connect)

---

### Feature: Audio Router (Channel Shuffling)

**Goal:** Add channel routing/shuffling via Strom's `builtin.audiorouter` block. A checkered routing matrix in the mixer panel lets operators remap which input channels feed which mixer strips.

**Why:** Broadcast mixers routinely need to reorder channels — e.g., when a multi-channel SDI source has languages on channels 1-4 but the operator wants channel 3 on strip 1, channel 1 on strip 2, etc. The audiorouter handles both 1:1 routing and fan-out (one input to multiple outputs).

**Constraint:** All audiorouter properties are `live: false` — routing is static, set at flow construction time. Changing the matrix requires deactivating and reactivating the production (~5s flow restart). This is a Strom limitation — the audiorouter builds its internal GStreamer pipeline once and cannot reconfigure at runtime.

**Architecture (Approach A — recommended):**
- The flow-generator inserts a `builtin.audiorouter` block between audio sources and the mixer when a production has a routing matrix configured
- Default state: 1:1 passthrough (input 0 → output 0, input 1 → output 1, etc.)
- When the operator edits the matrix in Studio, changes are stored in the production document but NOT applied until the flow is rebuilt
- "Apply & Restart" button in the router popup deactivates → rebuilds flow with new matrix → activates
- Warning displayed: "Routing changes require flow restart (~5s)."

**UI Design:**
- "Audio Router" button in the mixer panel header
- Opens a **Routing Matrix popup** with a checkered grid:
  - **Rows** = input channels (labeled with source names)
  - **Columns** = output channels / mixer strips (labeled ch1-ch16)
  - **Checkboxes** on each intersection: checked = route this input channel to this output
  - Helper: "1:1 Auto-fill", "Clear All", "Flip Layout" buttons
- Shows current (active) vs pending (unsaved) matrix side by side
- "Apply & Restart" commits and triggers flow rebuild

**Routing matrix format (JSON):**
```json
{
  "i0c0": ["o0c0", "o1c0"],
  "i0c1": ["o0c1"],
  "i1c0": ["o2c0"]
}
```
Where `iXcY` = input X channel Y, `oXcY` = output X channel Y.

**Backend changes:**
1. `backend/src/db/types.ts` — add optional `audioRoutingMatrix` to production document
2. `backend/src/lib/flow-generator.ts` — if `audioRoutingMatrix` exists, insert `builtin.audiorouter` block between source audio outputs and mixer inputs with `num_inputs`/`num_outputs`/`routing_matrix` properties. Wire: source → audiorouter → mixer
3. `backend/src/ws/controller.ts` — new WS message `AUDIO_ROUTER_UPDATE` stores matrix in production doc, triggers flow restart

**Frontend changes:**
1. New component `AudioRouterPanel.tsx` with checkered grid matrix editor
2. Mixer panel: add "Router" button, opens popup
3. Show pending/active state with restart warning

---

### Feature: AES67 Audio-Only Input/Output

**Goal:** Add `aes67` as an audio-only source/output type using Strom's built-in AES67 blocks. Enables network-based multichannel audio — microphones, stage boxes, intercom feeds, external audio consoles — arriving as AES67 multicast streams.

**Why AES67 specifically:**
- **Industry standard** — interoperability layer for Dante, Ravenna, Livewire, Q-LAN, WheatNet
- **Low latency** — 1ms packet time, PTP clock sync
- **Multicast** — one sender, many receivers, no per-stream bandwidth scaling
- **Both directions** — `builtin.aes67_input` (receive) and `builtin.aes67_output` (send)
- **Up to 8 channels per stream**, 48kHz, 16 or 24-bit

**Strom blocks available:**
| Block | Pads | Key Properties |
|-------|------|---------------|
| `builtin.aes67_input` | 1× audio_out | SDP (session description), decode (bool), latency_ms (default 20), interface |
| `builtin.aes67_output` | 1× audio_in | session_name, sample_rate (32-192kHz), bit_depth (16/24), channels (1-8), host (multicast IP), port, QoS DSCP |

**Prerequisites (not enforced by software — operator responsibility):**
- Multicast-capable network
- PTP clock synchronization (OS/hardware level)
- QoS/DSCP marking (default: EF 0x2E)

**Architecture:**
- New `streamType: 'aes67'` for audio-only inputs
- New `outputType: 'aes67'` for audio-only outputs
- AES67 inputs appear in a separate "Audio Sources" section (alongside video sources) — they route directly to the audio mixer without touching the vision mixer
- AES67 inputs have no video path in the flow — no video_out link, no offset block
- Multi-channel AES67 streams auto-split into individual mixer strips (channels 1-N)

**Backend changes:**
1. `backend/src/db/types.ts` — add `'aes67'` to `StreamType` and `OutputType` unions
2. `backend/src/routes/sources.ts` — add `'aes67'` to zod enum, extend with SDP field (for inputs) and AES67 config fields
3. `backend/src/routes/outputs.ts` — add `'aes67'` to zod enum, extend with AES67 output config
4. `backend/src/lib/flow-generator.ts` — for `aes67` input: create `builtin.aes67_input` block, route `audio_out` directly to mixer (no video path). For `aes67` output: create `builtin.aes67_output` block, route selected audio source to its `audio_in`
5. `backend/src/ws/controller.ts` — no new messages needed (AES67 is static at flow construction)

**Frontend changes:**
1. `frontend/src/lib/api.ts` — add `'aes67'` to `StreamType`/`OutputType`
2. `frontend/src/pages/SetupPage/SourcesPanel.tsx` — add AES67 source form with SDP textarea + decode/latency/interface fields
3. `frontend/src/pages/SetupPage/OutputsPanel.tsx` — add AES67 output form with multicast address, port, sample rate, bit depth, channels

**Comparison with other audio-only options:**
| Format | Use Case | Strengths | Weaknesses |
|--------|----------|-----------|------------|
| AES67 | Networked live audio | Industry standard, multi-channel, multicast, PTP | Network setup required |
| SRT | Internet/wireless audio | Works over WAN, encrypted | Not designed for local LAN audio |
| Local file (WAV) | Playback only (media player) | Simple, no network | No live input capability |

AES67 is the recommended audio-only format for networked live production. SRT can be added later for remote audio contribution. Local file playback is covered by the Media Player feature.

---

### Feature: USB Fader Control (MIDI Bridge)

**Goal:** Connect any USB MIDI fader controller (motorized fader banks, compact controllers, or full audio consoles in MIDI mode) to Open Live for hands-on audio mixing. A lightweight Node.js bridge translates MIDI events to WebSocket `AUDIO_SET` messages, reusing the existing controller infrastructure.

**Why:** Keyboard/mouse mixing is slow. Physical faders give the operator fast access to volume, mute, and channel selection. The bridge is a stateless translator — it doesn't duplicate the mixer, it just pipes MIDI events to where they're already handled.

**Architecture:**

```
[USB Fader] → USB MIDI → [Bridge (Node.js)] → WS {AUDIO_SET} → [Open Live Backend] → Strom mixer
                ↑ feedback (motor faders, LED mutes) ← WS {AUDIO_STATE} ←
```

- Bridge is a ~200-line Node.js script using the `midi` npm package (or `easymidi`)
- Runs on the machine where the fader is plugged in (same machine as Companion, typically)
- On startup: reads production ID → fetches production doc → loads fader config
- Translates MIDI CC fader moves → `AUDIO_SET {elementId, property:'volume', value:0.0-1.0}`
- Translates MIDI note/CC mute presses → `AUDIO_SET {elementId, property:'mute', value:true/false}`
- Subscribes to WS `AUDIO_STATE` for motorized fader feedback (position) and mute LED state
- Stateless — no database, no GUI, no Docker. Just `node midi-bridge.js --open-live-url http://192.168.1.11:8000 --production prod-xxx`

**Two-tier preset system:**

1. **Protocol handler** — translates wire format into standard events:
   - `midi` — CC, Note, PitchBend, NRPN, Sysex. Covers 95% of controllers.
   - Add more handlers as needed (OSC for Waves SoundGrid, TCP RAW for Skaarhoj)

2. **Mapping preset** — maps protocol events to Open Live channel operations:

| Preset | Protocol | Faders | Motorized | Special notes |
|--------|----------|--------|-----------|---------------|
| `behringer-xtouch` | MCU (PitchBend) | 8+1 | Yes | 14-bit faders, VPots, scribble strips |
| `behringer-xtouch-compact` | MCU | 8+1 | No | Same layout, no motors |
| `behringer-xtouch-mini` | CC 0-7, ch 11 | 8 | No | Layer A/B switch |
| `icon-platform-m-plus` | MCU | 8+1 | Yes | Jog wheel, transport |
| `icon-platform-nano` | CC 70-77 | 1 | No | Single fader, compact |
| `korg-nanokontrol2` | CC 0-7 | 8 | No | Pocket-sized, cheap |
| `presonus-faderport` | MCU-like | 1 | Yes | Single motorized fader |
| `akai-midimix` | CC 16-23 | 8+1 | No | 9 faders, 24 knobs, mute/rec buttons |
| `makepro-x` | MIDI CC | varies | varies | Generic MIDI class-compliant |
| `allenheath-qu16` | MIDI CC + Notes via USB-B | 16+1 | Yes | QU-16 in MIDI DAW mode. CC for faders, notes for mutes, receives CC for motor feedback. QU's own processing and mixing bypassed — Strom handles all EQ/dynamics/mixing. QU preamps feed audio via USB-B interface or optional AES67 output. |
| `allenheath-sq5` | MIDI via USB-B | 16+1 | Yes | SQ-5 in MIDI DAW mode. 16 motorized faders (6 layers), scribble strips, soft keys. SQ preamps → USB audio or AES67 to Strom. Motor faders follow Open Live mixer state bidirectionally. |
| `waves-lv1` | MIDI or OSC (via SoundGrid driver) | varies | Yes | LV1 bridges MIDI/OSC through SoundGrid. Configure LV1 MIDI out → bridge host. |
| `skaarhoj` | RAW TCP (proprietary) or configurable to MIDI | varies | Yes | Simpler: configure Skaarhoj panel to speak MIDI via USB. TCP RAW handler added later if needed. |

**Per-production fader config** — stored in the production document:

```json
{
  "faderConfig": {
    "model": "allenheath-qu16",
    "channelMap": {
      "fader_0": "ch1",
      "fader_1": "ch2",
      "fader_2": "ch3",
      "fader_3": "main"
    },
    "midiInput": "QU-16 MIDI 1",
    "midiOutput": "QU-16 MIDI 1"
  }
}
```

**Operator workflow (room switch / next day):**
1. Plug in same fader model
2. Start bridge: `node midi-bridge.js --production prod-xxx`
3. Bridge fetches production doc, finds `faderConfig`, loads preset + channel map
4. MIDI events flow — operator doesn't touch keyboard

**Backend changes:** None. Uses existing WS `AUDIO_SET` / `AUDIO_STATE` messages. The bridge is a separate tool, not part of Open Live's codebase.

**Bridge implementation:**
1. New repo or directory: `open-live-tools/midi-bridge/`
2. Package: `midi` or `easymidi` (npm), `ws` (npm)
3. CLI flags: `--open-live-url`, `--production`, `--model` (override preset), `--list-midi` (list available MIDI ports)
4. Reads production document from Open Live API for `faderConfig`
5. Opens WS to `/ws/productions/{id}/controller` for bidirectional communication

**Controllers acting as both mixer AND fader surface (QU-16, SQ-5, etc.):**
- Audio path: Console preamps → USB audio interface or AES67 output → Strom (via AES67 input block)
- Control path: Console MIDI OUT → bridge → Open Live WS → Strom mixer block properties
- Console's internal EQ/dynamics/mixing bypassed — Strom handles all processing
- Motor faders on console follow Open Live's state via MIDI feedback
- Mute buttons on console light up matching Open Live's mute state

---

### Design Decisions (2026-06-30)

- **Media player configuration is per-production** — operators reuse by duplicating productions. No separate "media player source" presets.
- **Recorder autonaming** — `{recorder_name}_{YYYY-MM-DD_HHmmss}.{format_ext}`. Configurable pattern for advanced use cases.
- **Recorder PCM support** — WAV 48kHz/24-bit for lossless audio post-production.
- **Storage path entry** — browse button (local/NAS) + manual text input fallback (SMB URL, S3 URL).
- **File format gating is advisory** — UI shows warnings for format/storage mismatches, never hard blocks.
- **Jog wheel / shuttle excluded** — Companion now supports DaVinci Speed Editor and Contour shuttle via native HID; transport controls use standard button presses.
- **All formats local-friendly, network/S3 restricted** — MXF unusable over S3 (index at end). MP3 ideal for all storage backends.
- **Per-channel dynamics use Strom block properties API** — all dynamics properties are `live: true` (instant), no flow restart needed. Property names follow pattern `chN_<section>_<parameter>`.
- **Audio router requires flow restart** — Strom's `builtin.audiorouter` has `live: false`. Matrix edits are staged, then applied via deactivate → rebuild → activate (~5s). Default is 1:1 passthrough (no router in flow) until operator configures routing.
- **AES67 is the audio-only network format** — industry standard, multicast, PTP-synced, up to 8 channels/stream. Requires multicast network + PTP clock (OS-level, not enforced by software). SRT for remote/WAN audio can be added later.
- **Fader bridge is a separate tool** — not part of Open Live backend or frontend. Reuses existing WS `AUDIO_SET`/`AUDIO_STATE` protocol. No new backend endpoints needed.
- **MIDI is the universal protocol** — 95% of controllers speak MIDI CC/Note/PitchBend. Additional protocol handlers (OSC, TCP RAW) added as needed.
- **Per-production fader config survives room changes** — same production, different room, same fader model: plug in, start bridge, works. Channel mapping stored in production document.

---

### Feature: Hybrid Production Rig (Headscale/WireGuard + OSC)

**Goal:** Design the networking architecture for a hybrid deployment where the production rack (Strom, CouchDB, audio interface, DeckLink cards, networking switch) sits on-site behind NAT with outbound-only internet, and the control plane (Open Live backend, Studio UI) runs on OSC in the cloud.

**Rack hardware (on-prem):**
- Strom server with GPU, 16× SDI (Quad 2 + Duo 2 or similar)
- Netgear AV-line switch (multicast-capable, IGMP snooping)
- Ubiquiti EdgeRouter — eth0 to internet (WAN), eth1 to Netgear switch (production LAN, DHCP server)
- Audio interface (e.g., RME Fireface UFX III, Behringer XR18 for testing)
- CouchDB (Docker) on the Strom machine or a separate small server

**OSC cloud:**
- Open Live backend service
- Open Live Studio service
- CouchDB (optional — on-prem preferred for resilience)

**Networking — Headscale/WireGuard VPN approach (recommended):**

```
                          ┌─────────────────────────────────────────┐
                          │                 INTERNET                │
                          └─────┬───────────────────────┬───────────┘
                                │                       │
                         ┌──────▼──────┐        ┌───────▼────────┐
                         │ Headscale   │        │ OSC Cloud      │
                         │ VPS ($5/mo) │        │ (osaas.io)     │
                         │ WG:10.0.0.1 │        │                │
                         │ pub:x.x.x.x │        │ Open Live      │
                         │             │        │ Open Live Stu.  │
                         │ iptables:   │        │                │
                         │ :8080→10.0. │        └───────┬────────┘
                         │  0.100:8080 │                │
                         │ :5000→10.0. │    REST API    │
                         │  0.100:5000 │◄───────────────┘
                         └──────▲──────┘   STROM_URL=http://x.x.x.x:8080
                                │                 STROM_ACCESS_TOKEN=dev-key-local
                          ┌─────┴──────┐
                          │  EdgeRouter│──────── SRT PGM caller ────► Cloud SRT ingest
                          │            │──────── WHEP/WebRTC ───────► DERP relay → Browser
                          │  Production│
                          │  LAN (DHCP)│
                          └─────┬──────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────▼─────┐ ┌──▼──┐ ┌──────▼──────┐
              │  Strom    │ │CouchDB│ │Netgear AV   │
              │  WG:10.0. │ │      │ │Switch       │
              │  0.100    │ │      │ │(multicast)  │
              └─────┬─────┘ └──────┘ └──────┬──────┘
                    │                       │
              ┌─────▼─────┐           ┌─────▼─────┐
              │Audio I/F  │           │DeckLink   │
              │(USB/ALSA) │           │Quad2+Duo2 │
              └───────────┘           └───────────┘
```

**Why Headscale over plain WireGuard:**
- **DERP relays solve WHEP NAT traversal for free** — browsers don't need to join the mesh. DERP relays WebRTC traffic through the Headscale infrastructure automatically.
- **MagicDNS** — `strom.example.ts.net` instead of remembering IPs
- **ACLs** — lock down which mesh nodes can reach Strom's API port
- **Single binary client** — `tailscale up --login-server=https://headscale.example.com` on the Strom machine

**Only Strom needs the Headscale client.** Open Live and Studio on OSC see it as a normal HTTP server at the VPS public IP. The VPS runs iptables to forward ports 8080 (REST API) and 5000/udp (WHEP) to Strom's mesh IP.

**CouchDB placement — on-prem.** Keeps the rack self-sufficient for show-critical data. If internet drops, productions keep running. OSC's Open Live reconnects when the link comes back.

**PGM output — SRT caller from Strom.** Strom initiates the SRT connection outbound to a cloud SRT ingest server. No inbound NAT hole needed.

**Audio — USB interface (testing: XR18/18i20, production: RME Fireface UFX III).** Appears as multi-channel ALSA device. GStreamer sees all channels individually. Strom routes audio between sources, mixer, and output buses. For networked audio expansion, add AES67 output blocks to Strom (the Netgear AV-line switch is already multicast-capable).

**Next steps (when implementing):**
1. Provision Headscale VPS, install `headscale`, configure ACLs
2. Add Tailscale client to `open_live_hybrid/docker-compose.yml` as a sidecar service
3. Set iptables port forwarding on VPS
4. Create Open Live + Studio instances on OSC with `STROM_URL=http://<vps-ip>:8080`
5. Verify: WHEP monitoring works through DERP, PGM SRT streams outbound, REST API functional through VPS
