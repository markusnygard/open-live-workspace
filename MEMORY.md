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
| 2026-07-01 | **Hybrid rig networking**: Headscale/WireGuard VPS gateway setup — Strom+CouchDB on-prem behind NAT → VPS iptables port forwarding → OSC cloud Open Live + Studio. `setup-vps.sh` script written. Tailscale client installed on VPS to join mesh. |
| 2026-07-01 | **OSC hybrid deployment**: Created `openlivehybrid` (Open Live) and `hybridstudioz8` (Studio) instances on OSC at osaas.io. Backend connects to on-prem CouchDB+Strom through VPS tunnel. |
| 2026-07-01 | **CORS fix**: OSC backend must have `CORS_ORIGIN` set to the Studio's full URL (`https://<studio-name>.eyevinn-open-live-studio.auto.prod-se.osaas.io`), not `*` and not its own URL. |
| 2026-07-01 | Dashboard simplified: single MODE section with dynamic title (LOCAL/HYBRID/MODE STOPPED), "Start Local" (all 4) and "Start Hybrid" (CouchDB+Strom only) buttons. UI scaled up ~10%. |
| 2026-07-03 | **Other software hardware analysis**: Studied other software's browser-based MIDI/Xkeys integration via WebMIDI + WebHID. Documented architecture, message protocol, in-flight tracking pattern. Recommendation: replace planned `midi-bridge.js` Node.js process with browser WebMIDI directly in Studio. Added ## Research section above Future Features. |
| 2026-07-03 | **Other software media player analysis**: Studied other software's A/B dual player architecture — two independent WHEP-based players with individual queues, per-clip trimming, autoshow automation, and transition crossfades. Created COPY.md with full reference material. Added ## Research section, updated Media Player feature spec to recommend A/B pattern. |
| 2026-07-09 | **Output flow lifecycle refactor**: Output flows now created (stopped) during production activation instead of on-demand. Start/stop buttons just toggle state — no create/delete cycles, no SRT port conflicts. Deactivation cleans up all flows. Determined by deterministic `outputFlowName(productionId, outputId)`. |
| 2026-07-09 | **Per-source video routing**: `buildOutputFlow` + `findSourceInterChannel` resolve per-source inter_output channels. Output creation form has Production dropdown + Source dropdown (PGM, PGM Clean, all production inputs). `videoSource` stored on OutputDoc. |
| 2026-07-09 | **Per-source audio routing**: Per-source audio inter_outputs (`b-inter-audio-src-{slug}`) created in `activateStromFlow`, connected to source's `audio_out_0` (SRT/EFP) or `audio_out` (WHIP/NDI/SDI). `findSourceAudioInterChannel` resolves channels. Output flow receives per-source audio when `audioSource` is set. |
| 2026-07-09 | **SRT output health monitoring**: Backend in-memory health tracking (`healthy`/`stopped`/`error`/`no_clients`). Systemd timer runs `scripts/srt-health-check.py` every 15s — reads `/proc/net/udp` from Strom container via docker exec, reports SRT client connection status to `POST /api/v1/outputs/:id/srt-check`. Status endpoint returns `health` field. |
| 2026-07-09 | **OutputSelector amber indicators**: Frontend shows amber "No SRT client" when receiver disconnects from listener-mode SRT output, amber "Pipeline failed" on flow crash, green "healthy" when running with client, grey "stopped" when intentionally stopped. |
| 2026-07-09 | **`fmtId` → `fmtBlockId` rename**: Fixed esbuild "already declared" error in `buildOutputFlow` by renaming `fmtId` to `fmtBlockId` to avoid shadowing in same module. |
| 2026-07-09 | **Modular studio OutputsPanel**: Production dropdown + Source dropdown (PGM/PGM Clean/inputs) available for ALL output types (not just recorder). `videoSource`/`audioSource` saved to OutputDoc for all types. "Input audio" option in Audio Source dropdown when specific source selected. |

---

## Research: Hardware Control via Web APIs — Other Software Analysis

> 2026-07-03: Studied how other software (cloud-based vision mixer) integrates MIDI faders and Xkeys controllers. The pattern is directly applicable to Open Live Studio.

### Architecture

The software is a vision mixer running in the cloud. Its UI opens in a browser window (Opera/Chrome). Hardware controllers — MIDI fader banks and Xkeys panels — connect directly through the browser using standard web APIs. No native drivers, no separate bridge process.

```
[USB MIDI Fader] → WebMIDI (Browser iframe) → WS → [Backend (cloud)]
[USB Xkeys]     → WebHID  (Browser iframe) → WS → [Backend (cloud)]
```

**Key insight:** The browser acts purely as a hardware bridge — just forwards raw bytes. All control logic (what a fader move means, how to handle feedback, what an Xkeys button press triggers) lives server-side. The browser knows nothing about mixing, channels, or presets.

### WebMIDI API

- W3C standard: `navigator.requestMIDIAccess({sysex: true})`
- Browser support: Chrome, Edge, Opera (not Firefox/Safari)
- Returns `MIDIAccess` object with `.inputs` (MIDIInputMap) and `.outputs` (MIDIOutputMap)
- Input: `input.onmidimessage = (event) => { event.data }` — raw Uint8Array bytes
- Output: `output.send([0x90, 0x45, 0x7f])` — send bytes to hardware
- SysEx: supported for advanced device configuration (e.g., scribble strip text)
- Hot-plug: `midi.onstatechange` event for connect/disconnect
- **This is NOT RTP-MIDI (AppleMIDI).** RTP-MIDI transports MIDI over UDP network. WebMIDI gives the browser local access to USB/Bluetooth MIDI devices.

### WebHID API (Xkeys)

- W3C standard: `navigator.hid.getDevices()` / `navigator.hid.requestDevice()`
- Browser support: Chrome, Edge, Opera
- Xkeys vendorId: `1523` (PI Engineering). Other controller: `4057`.
- Filter by usage page (usage = 1 = Generic Desktop Control)
- Three report directions:
  - `inputreport` event — device → browser (button press/encoder turn)
  - `device.sendReport(reportId, data)` — browser → device (LED on/off, backlight)
  - `device.sendFeatureReport(reportId, data)` — browser → device (config/init)
- Xkeys data padded to 36 bytes
- On init: reset controllers, close all, re-scan fresh

### Message Protocol (Shared by MIDI and HID)

Both iframes use the same message format over the existing application WebSocket:

| Action | Direction | Purpose |
|--------|-----------|---------|
| `{type:"webdev", action:"add", path, name}` | JS → Backend | Register newly connected device |
| `{type:"webdev", action:"del", path}` | JS → Backend | Remove disconnected device |
| `{type:"webdev", action:"data", path, data, sender_id}` | JS → Backend | Raw bytes from hardware input |
| `{type:"webdev", action:"data_response", path, sender_id}` | Backend → JS | Acknowledge processed message |
| `{type:"webdev", action:"data", path, data}` | Backend → JS | Send control data to device (motor fader position, LED state) |
| `{type:"webdev", action:"rawdata", path, data}` | Backend → JS | HID raw report (Xkeys) |
| `{type:"webdev", action:"featuredata", path, data}` | Backend → JS | HID feature report (Xkeys config) |

### In-Flight Message Tracking (Critical for Motorized Faders)

**Problem:** User moves a motorized fader → JS sends position to backend → backend responds with updated position → fader motor fights user's hand (feedback loop).

**The solution — per-control queuing with 500ms window:**

Each MIDI controller gets a `sender_id` (first 2 bytes as hex: `cc-channel`). A `message_senders` map tracks in-flight state:

```
1. User moves fader → JS forwards bytes, marks sender as "in-flight" (start timestamp)
2. If new data arrives for same sender before response (< 500ms) → queue callback
3. Backend processes → sends "data_response" → JS unblocks queue
4. Queued callback fires → sends next messages → marks in-flight again
5. If no new data and no response → clear sender (avoids stale queue buildup)
```

This prevents position feedback oscillation without adding perceptible latency. The code comment (in Finnish) suggests they plan to move this logic from Python to JS for lower latency.

### Device Lifecycle Management

- UUID-based path per device (not MIDI id — handles multiple identical controllers)
- Hot-plug: automatic via `onstatechange` (MIDI) and `connect`/`disconnect` (HID)
- `beforeunload` cleanup: remove all devices and close connections on tab close
- Settings popup: auto-opens for unconfigured devices (uid < 1)
- Device config stored server-side, survives browser restarts

### Implementation: Thin JS Bridge Pattern

Both iframes are deliberately tiny (280×28 and 240×28 pixels) — they exist only to hold the hardware API session. The Vue.js app has:

- **No UI** aside from status dots
- **No knowledge** of what MIDI CC numbers or Xkeys buttons mean
- **No configuration** stored client-side
- **Just:** open hardware → forward bytes → receive commands → forward back

### Comparison: WebMIDI vs. Planned Node.js Bridge

Open Live's current plan for fader control uses a separate Node.js process with the `midi` npm package.

| | Planned (Node.js Bridge) | WebMIDI Approach |
|---|---|---|
| Process | Separate `node midi-bridge.js` | Inside browser (no extra process) |
| Dependencies | `midi` npm (native C bindings) | Browser built-in API |
| Installation | `npm install`, platform-specific compilation | None — browser handles it |
| Cross-platform | C binding issues (Windows/macOS/Linux) | All Chrome/Edge platforms |
| Xkeys support | Not covered | WebHID in same iframe |
| WS Protocol | Reuses existing `AUDIO_SET`/`AUDIO_STATE` | Same WebSocket, same message stream |
| Hot-plug | Must restart bridge when devices change | Browser events, automatic detection |
| Motor fader feedback | Would need to build same queuing logic | Proven in-flight tracking pattern from other software |
| Operator workflow | `node midi-bridge.js --production prod-xxx` | Open Studio, grant MIDI permission, done |

### Recommendation: Replace Node.js Bridge with Browser WebMIDI

The WebMIDI approach is strictly simpler. Open Live Studio is already a browser app (React + Vite). Adding a `<MidiBridge>` component that runs `navigator.requestMIDIAccess()` and forwards bytes over the existing WS connection:

1. **Eliminates the external process entirely** — no CLI, no npm, no C bindings
2. **Expands hardware support** — MIDI faders + HID controllers (Xkeys) in one surface
3. **Zero installation** — operator opens Studio, clicks "Allow MIDI", done
4. **Reuses existing infrastructure** — same WebSocket, same `AUDIO_SET`/`AUDIO_STATE` backend
5. **Proven pattern** — other software uses exactly this in production for broadcast workflows

**What stays the same from the existing spec:**
- All fader presets (Behringer X-Touch, Icon, Korg, Allen & Heath, etc.) — just different transport layer
- Per-production fader config in production document
- Mapping MIDI CC → `AUDIO_SET {elementId, property, value}`
- Motorized fader feedback via `AUDIO_STATE` subscription

**What changes:**
- `midi-bridge.js` (Node.js process) replaced by `<MidiBridge>` React component
- `midi` npm package replaced by `navigator.requestMIDIAccess()`
- MIDI port selection moves from CLI args to browser permission dialog
- Add in-flight message tracking for motorized faders

### Implementation Plan

**Frontend (`frontend/src/components/MidiBridge.tsx`):**
- Hidden component, runs on Studio mount
- Requests `navigator.requestMIDIAccess({sysex: true})` — browser shows permission dialog
- Scans `navigator.hid.getDevices()` for Xkeys (vendorId 1523, 4057)
- Maps incoming MIDI bytes → `AUDIO_SET` WS messages using fader config from production doc
- Subscribes to `AUDIO_STATE` for motorized fader position feedback
- Implements in-flight tracking (500ms per-control) from other software pattern
- Cleanup on component unmount / `beforeunload`

**Backend:**
- No new endpoints needed — existing WS controller message types suffice
- Optional: new `webdev` message type for raw MIDI passthrough (for unmapped/advanced controllers)
- `data_response` mechanism for motorized fader flow control

**HID/Xkeys:** Same component handles Xkeys via WebHID. Xkeys button presses map to Studio actions (Cut, Auto, FTB, etc.) via existing WS message types. Xkeys LED feedback via `sendReport`.

---

## Research: Media Player Architecture — Other Software Analysis

> 2026-07-03: Studied how other software implements its media player as an A/B dual-player system with independent queues, clip trimming, autoshow automation, and transition crossfades. Full reference material in [COPY.md](./COPY.md).

### Architecture: Three-Iframe System

The media player consists of 3 iframes communicating with a shared backend via message passing:

| Iframe | Size | Stack | Role |
|--------|------|-------|------|
| Media Editor C | Dynamic | WHEPClient (vanilla JS) | Video preview — receives composed WHEP stream, renders in `<video>` |
| PlayerA | 325×240 px | Vue.js 2 | Full playback controls + queue + settings |
| PlayerB | 325×240 px | Vue.js 2 (identical code) | Independent second player |

### A/B Dual Player Pattern

Two fully independent players. Typical broadcast workflow:

1. **PlayerA** plays a clip on air (PGM), **PlayerB** is cued and ready
2. Operator queues next clip into PlayerB, sets marks, previews the WHEP stream
3. CUT/MIX to PlayerB — now PlayerB is PGM, PlayerA is free for next cue
4. Each player has its own **independent** queue, rate setting, loop mode, and audio state

This is significant because Open Live Studio's current Media Player spec plans a single player with dropdown for multiple instances. A single player forces either gapless-only mode or dead air between clips. Two players give the operator full control.

### WHEP Streaming (not browser playback)

Clips are NOT decoded locally. The media engine server-side renders the clip and delivers it as a WebRTC WHEP stream. The `WHEPClient` class in the editor iframe handles:

- **ICE negotiation:** OPTIONS → POST (offer/answer SDP exchange) → PATCH (trickle-ICE candidates)
- **Auto-restart:** On connection loss (`disconnected` / `failed`), waits 2000ms, deletes old session, reconnects
- **Stereo Opus:** Injects `stereo=1;sprop-stereo=1` into audio `a=fmtp:` line during SDP offer edit
- **Audio gain:** Web Audio API `GainNode` on the audio track, settable volume 0.0–1.0
- **Session cleanup:** DELETE request on WHEP session URL before restart or stop

For Open Live Studio: the WHEPClient is not needed — Strom already delivers video through the vision mixer to WHEP outputs, and the Studio UI receives PGM/MV streams. The player UI only needs to issue control commands to Strom's `player.*()` API.

### Queue System

Each player maintains an independent queue. Each item:

```json
{
  "name": "clip_name.mp4",
  "type": "media | youtube | ring-replay",
  "uri": "file:///path/to/clip",
  "start_position": 0,       // trim-in (ms)
  "end_position": 5000,      // trim-out (ms), -1 = play to end
  "rate": 1.0,               // speed multiplier per clip
  "seek": 0,                 // initial seek offset
  "identifier": "abc123",    // unique ID for backend
  "removable": true,
  "transition-length": 500   // crossfade overlap between clips (ms)
}
```

**Queue duration** sums all items: `(end_position - start_position) / rate - transition_length`. The display shows both total queue duration and real-time remaining (accounting for current playback rate).

**Outgoing item mechanism:** When operator presses NEXT, the playing clip becomes `outgoing_item` (flagged `{outgoing: true}` in render) while the next clip becomes `current_item`. Both appear side-by-side during crossfade. The media engine handles the actual audio/video dissolve.

### Control Inventory

**Transport:** Play/Pause, Seek Start (jump to beginning), Next, Position scrubber slider, Rate buttons (0.5×, 1×, 2×, 4×, 8×)

**Clip controls:** Loop current clip toggle, Loop entire queue toggle, Audio mute toggle, Clear player, Clear queue

**Queue:** URI text input + Add button, per-item display (name, duration, remove, move up/down), queue duration counter, items count

**Time display:** Current position / Duration (MM:SS or HH:MM:SS), time remaining countdown, clock time for ring-replay clips

**Settings:** Autoshow toggle (auto-take to PGM), Autoshow stinger toggle, Autoplay toggle, Autoshow return source selector, Frame interpolation toggle (if supported), Clear confirmation setting

### Autoshow Automation

The player drives vision mixer operation. Key behaviors:

| Mode | When clip starts | When clip ends |
|------|-----------------|----------------|
| Autoshow OFF | Operator manually cuts | Clip stops, stays on air |
| Autoshow ON | Auto CUT/AUTO to player's mixer input | Clip stops |
| Autoshow + Return | Auto CUT/AUTO to player | Auto CUT/AUTO back to saved source |
| Autoshow + Stinger | Same as ON but with stinger transition | Per return setting |

In Open Live Studio terms: `MIXER_CUT` / `MIXER_AUTO` WS messages triggered by player state transitions on the backend.

### Message Protocol (shared pattern with hardware control — see earlier research)

All communication is `gui.send_message({type, value, ...})` and `gui.on_message(callback)`.

**Player → Backend sent types:** `pause_play_toggle`, `seek`, `seek_start`, `next`, `rate`, `toggle_current_item_loop`, `toggle_loop_queue`, `toggle_audio`, `clear_player`, `clear_queue`, `add_item`, `remove_item`, `move_item`, `autoplay`, `autoshow`, `autoshow_stinger`, `autoshow_return`, `clear_confirmation_setting`, `frame_interpolation_enabled`

**Backend → Player received types:** `init` (full state), `state`, `current_item`, `outgoing_item`, `queue`, `position_duration` (throttled 40ms), `rate`, `autoplay`, `autoshow`, `autoshow_stinger`, `autoshow_return`, `clear_confirmation_setting`, `loop_queue`, `frame_interpolation_enabled`, `reload`

**Position streaming:** Backend sends `position_duration` updates, iframe throttles render with `_.throttle(40)` (~25fps).

### Other Software → Strom Mapping

| Concept | Strom API | Status |
|---------|-----------|--------|
| Play/Pause/Stop | `player.control('play'/'pause'/'stop')` | Direct match |
| Next/Prev | `player.control('next'/'previous')` | Direct match |
| Seek | `player.seek(position_ns)` | Direct match |
| Goto index | `player.goto(index)` | Direct match |
| Playlist/queue | `POST player/playlist` with file URIs | Direct match |
| State polling | `GET player/state` | Direct match |
| Loop clip/queue | Strom playlist supports loop | Verify |
| Per-clip speed | Strom player likely supports rate per item | Verify |
| Per-clip trim marks | NOT in playlist API | Workaround: seek + position monitoring |
| Transition crossfade | NOT in player API | Use two players + mixer dissolve |
| Autoshow automation | NOT in player | Build on backend: state → mixer commands |
| Frame interpolation | Strom may have property | Verify |
| A/B dual player | Two media_player blocks per flow | Doable |
| Ring-replay | NOT supported | Out of scope for v1 |

### Recommendations for Open Live Studio Media Player

1. **Upgrade to A/B dual player.** The current spec's single player + dropdown should become two independent player panels. In Strom terms: two `media_player` blocks per production, each routed to different mixer inputs for crossfade-capable transitions.

2. **Add per-clip head/tail trimming.** Store `start_position`/`end_position` per queue item. Since Strom's playlist API may lack per-clip marks, implement via seek-on-load + position monitoring for auto-next.

3. **Add autoshow semantics.** Player state transitions should drive vision mixer automation. The backend monitors player state and fires `MIXER_CUT`/`MIXER_AUTO` WS messages.

4. **Add queue duration display.** Real-time countdown of remaining queue time (HH:MM:SS) with ending warning (last 5 seconds).

5. **Throttled position streaming.** 40ms throttle pattern prevents over-rendering at full polling rate.

6. **Full state init.** On player connect, backend pushes complete state (settings + queue + current item + position) — not incremental. This ensures reconnect-safe behavior.

---

## Future Features

> Design specs for features planned but not yet implemented.
> Each feature is self-contained and can be built independently.

---

### Feature: Media Player Input

> **2026-07-03 update:** After studying other software's A/B dual player approach (see ## Research section above and [COPY.md](./COPY.md)), the recommended design is **two independent players** instead of a single player with dropdown. See recommendations at end of this section.

**Goal:** Add `mediaplayer` as a new source/input type in Open Live Studio, using Strom's `builtin.media_player` block. Two independent media player instances (A and B) form a dual-player system with individual transport controls, per-player playlists, clip trimming (mark in/out), autoshow automation, and crossfade-capable transitions between players.

**Why:** Broadcast productions need clip playback — bumpers, advertisements, video wall loops, audio jingles, background music. A dual player system lets the operator cue the next clip in Player B while Player A is on air, then transition between them without dead air.

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
- **Still images:** PNG and JPEG supported via GStreamer pngdec/jpegdec. Single frame decoded, loop mode holds as static. Use for logos, lower-thirds, slates.
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

### A/B Dual Player Upgrade (Recommended)

Based on other software research, the single-player + dropdown design should be upgraded to:

1. **Two media_player blocks per production** instead of one — PlayerA and PlayerB.
2. **Two independent player panels** in the production UI (side-by-side or tabbed).
3. **Each player routed to separate mixer inputs** — enables crossfade transitions between players.
4. **Independent per-player queues** — each player has its own playlist, rate, loop, and audio settings.
5. **Autoshow settings per player** — `autoshow` (auto-take to PGM), `autoshow_stinger`, `autoshow_return`.
6. **Per-clip head/tail trimming** — `start_position`/`end_position` per queue item. Implement via seek-on-load + position monitoring if Strom playlist API lacks per-clip marks.
7. **Outgoing item display** — show transitioning-out clip alongside current clip during crossfade.
8. **Queue duration counter** — real-time countdown (HH:MM:SS) with 5-second ending warning.
9. **Throttled position updates** — 40ms throttle on `position_duration` streaming (~25fps).
10. **Full state init on connect** — backend pushes complete player state on WS connect for reconnect safety.

See [COPY.md](./COPY.md) for complete reference material including message protocol, queue data model, control inventory, layout, and WHEP client patterns.

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

### Feature: USB Fader Control (MIDI Bridge → WebMIDI)

> **2026-07-03 update:** After studying other software's WebMIDI approach (see ## Research section above), the recommended implementation is **browser-based WebMIDI** instead of a separate Node.js process. The preset mapping system and backend protocol remain identical — only the transport layer changes. The Node.js bridge is retained as a fallback for non-Chrome browsers.

**Goal:** Connect any USB MIDI fader controller (motorized fader banks, compact controllers, or full audio consoles in MIDI mode) to Open Live for hands-on audio mixing. A lightweight bridge translates MIDI events to WebSocket `AUDIO_SET` messages, reusing the existing controller infrastructure.

**Why:** Keyboard/mouse mixing is slow. Physical faders give the operator fast access to volume, mute, and channel selection. The bridge is a stateless translator — it doesn't duplicate the mixer, it just pipes MIDI events to where they're already handled.

**Architecture (recommended — browser WebMIDI):**

```
[USB Fader] → WebMIDI (Browser/Studio UI) → WS {AUDIO_SET} → [Open Live Backend] → Strom mixer
                   ↑ feedback (motor faders, LED mutes) ← WS {AUDIO_STATE} ←
```

**Architecture (fallback — Node.js bridge, for non-Chrome browsers):**

```
[USB Fader] → USB MIDI → [Bridge (Node.js)] → WS {AUDIO_SET} → [Open Live Backend] → Strom mixer
                ↑ feedback (motor faders, LED mutes) ← WS {AUDIO_STATE} ←
```

- **Recommended:** WebMIDI in browser (see ## Research: other software). Works in Chrome/Edge/Opera. Zero install, automatic hot-plug, proven in-flight tracking for motorized faders.
- **Fallback:** Node.js bridge using `midi` npm package (or `easymidi`). Runs on the machine where the fader is plugged in. Works in any browser, requires `npm install`. Same protocol.
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

**Bridge implementation (recommended — WebMIDI in Studio):**
1. New React component: `frontend/src/components/MidiBridge.tsx`
2. API: `navigator.requestMIDIAccess({sysex: true})` (no npm packages)
3. Maps MIDI events → WS `AUDIO_SET` using fader config from production document
4. Subscribes to WS `AUDIO_STATE` for motorized fader feedback with in-flight tracking
5. Implements 500ms per-control queuing pattern (from other software research) to prevent feedback loops
6. Hidden/mounted component — no user-visible UI beyond permission prompt

**Bridge implementation (fallback — Node.js for non-Chrome browsers):**
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
- **Recorder UI bar added to MEMORY.md spec (2026-07-02)** — mockup at `~/.superpowers-brainstorm-recorder-mockup.html`, served on port 8765. Same badge pattern (PLAY=green, REC=orange) to be reused for Media Player panel.

---

### Feature: Recorder UI — Production View Panel

**Goal:** Orange REC badge icon in the production top bar. Only visible when the active production has recorder outputs assigned. Clicking toggles a floating bar in the lower right corner with per-recorder controls and status.

**Design (finalized 2026-07-02):**
- **Badge:** Orange rounded rect (44×20px) with red dot + "REC" text, matching existing SVG icon style in the top bar
- **Bar position:** Fixed lower-right, floating above production content. Not a docked panel like audio/controller.
- **Per-recorder column:** Name (editable), format tag (MP4/MKV), directory path, free disk space, duration counter (HH:MM:SS, only when recording), current filename
- **States:** Red dot = recording, grey dot = stopped, orange dot = paused
- **Buttons (recording):** STOP (solid red bg, white text) — SPLIT (blue outline)
- **Buttons (stopped):** REC (red outline)

**Backend:** No new API needed — `RECORDER_SPLIT` WS message already implemented in controller.ts. Recorders start/stop with flow lifecycle (production activate/deactivate).

**Frontend (ControllerPage/index.tsx):**
1. Add `recorder` to `Panels` type
2. Add REC badge SVG icon component
3. Conditionally include in `PANEL_ICONS` when `outputAssignments.some(a → output.outputType === 'recorder')`
4. Add `RecorderBar` floating component (position: absolute, bottom/right)
5. Wire REC/STOP/SPLIT buttons to WS messages
- **Storage path entry** — browse button (local/NAS) + manual text input fallback (SMB URL, S3 URL).
- **File format gating is advisory** — UI shows warnings for format/storage mismatches, never hard blocks.
- **Jog wheel / shuttle excluded** — Companion now supports DaVinci Speed Editor and Contour shuttle via native HID; transport controls use standard button presses.
- **All formats local-friendly, network/S3 restricted** — MXF unusable over S3 (index at end). MP3 ideal for all storage backends.
- **Per-channel dynamics use Strom block properties API** — all dynamics properties are `live: true` (instant), no flow restart needed. Property names follow pattern `chN_<section>_<parameter>`.
- **Audio router requires flow restart** — Strom's `builtin.audiorouter` has `live: false`. Matrix edits are staged, then applied via deactivate → rebuild → activate (~5s). Default is 1:1 passthrough (no router in flow) until operator configures routing.
- **AES67 is the audio-only network format** — industry standard, multicast, PTP-synced, up to 8 channels/stream. Requires multicast network + PTP clock (OS-level, not enforced by software). SRT for remote/WAN audio can be added later.
- **Fader bridge: WebMIDI in browser (primary), Node.js fallback** — recommended approach embeds WebMIDI in Studio frontend (zero install, automatic hot-plug, proven in-flight tracking from other software). Node.js `midi-bridge.js` retained as fallback for non-Chrome browsers. Both reuse existing WS `AUDIO_SET`/`AUDIO_STATE` protocol. No new backend endpoints needed for the primary approach.
- **MIDI is the universal protocol** — 95% of controllers speak MIDI CC/Note/PitchBend. Additional protocol handlers (OSC, TCP RAW) added as needed.
- **Per-production fader config survives room changes** — same production, different room, same fader model: plug in, start bridge, works. Channel mapping stored in production document.

---

## Media Player Implementation History (2026-07-03, WIP — local only, not pushed)

**Status: In progress. File browser + playlist selection functional. Transport buttons need WS wiring.**

### Built today:

**Backend:**
- `'mediaplayer'` in `StreamType`, routes/sources.ts zod schemas
- Flow-generator creates `builtin.media_player` block (video_out→offset→mixer, audio_out→mixer)
- WS: `MEDIAPLAYER_CONTROL`, `MEDIAPLAYER_SEEK`, `MEDIAPLAYER_GOTO` — handled via Strom player API
- `playlist` field on `SourceDoc`, auto-set on blocks after flow activation via `strom.player.setPlaylist()`
- `GET /api/v1/recorder/dirs?files=1` — lists directories + media files
- Mount: `~/media/` → `/data/media/` in Strom + backend containers

**Frontend (SourcesPanel):** mediaplayer source type with folder path address, always available

**Frontend (ControllerPage):**
- PLAY badge (green circle+triangle) in top bar — shown when production has media player sources
- Docked bottom-row panel with SectionLabel header (icon, name, tooltip, close)
- `MediaPlayerCard.tsx` (extracted component): transport buttons (▶⏸⏹⏭), 📁 file browser with directory nav + file selection, playlist display, "Add N clips" saves to source doc
- `useMemo` for mediaPlayers array prevents re-renders
- Panel defaults to closed (`loadPanels: false`)

### Design decisions:
- Docked panel pattern (not floating) — avoids z-index/popup issues
- SectionLabel header matches Audio/Controller/PiP convention
- File browser inline in panel content — no popup positioning bugs
- Playlist saved per-source, auto-loaded into Strom on activation

### Still needed:
- Wire transport buttons when production active + WS connected
- Position/timecode display, loop toggle, mark in/out
- Multiple players stacked, reorderable playlist
- Pop-out to separate window (`/pane/mediaplayer`)

### Files changed (local only, NOT pushed):
- backend: types.ts, sources.ts, outputs.ts, productions.ts, flow-generator.ts, controller.ts
- frontend: api.ts, SourcesPanel.tsx, ControllerPage/index.tsx, MediaPlayerCard.tsx, useControllerWs.ts
- compose: open_live_local/docker-compose.yml, open_live_hybrid/docker-compose.yml

---

## Recorder Implementation History (2026-07-01 to 2026-07-03)

**Status: Hidden for now. Partially complete — backend APIs ready, frontend UI built and then hidden.**

### What was built:

**Backend (`recorder` output type):**
- `builtin.recorder` block in flow-generator — wired to PGM encoder output (video) + audio mixer main_out (audio). Supports per-source recording via `videoSource` field.
- Output type fields: `outputDir`, `container` (mp4/mkv/mpegts), `audioSource`, `videoSource`
- WS messages: `RECORDER_TOGGLE` (logical active/inactive per-recorder), `RECORDER_SPLIT` (triggers `split-now` on splitmuxsink)
- `POST /api/v1/recorder/dirs` — filesystem directory browsing for output directory picker
- Strom media volume mounted in backend container at `/data/`

**Frontend (OutputsPanel):**
- Recorder option in OutputsPanel with: container format picker, directory picker (filesystem browse + custom path), video source (production selector → cascading source dropdown with PGM/Clean PGM/individual sources), audio source
- Browse button with recursive folder navigation starting from `/data/media`
- Edit modal extended with recorder-specific fields
- Host `~/media/rec/` mounted at `/data/media/rec` for recorder output accessible outside Docker

**Frontend (ControllerPage — production view, now hidden):**
- RecorderIcon (headphones SVG) in top bar — conditional on recorder outputs existing
- Floating recorder bar in lower-right corner per production
- Per-recorder columns: name, format, status dot, SPLIT button
- REC/STOP buttons (logical state tracking — REC arms recorder, STOP disarms)
- Master REC ALL / STOP ALL button (activate/deactivate production)

### What didn't work / why it was hidden:

1. **Valve approach for per-recorder start/stop** — GStreamer `valve` element `drop` property changes at runtime destabilized the pipeline. After opening then closing a valve, WHEP video preview broke (pipeline corruption from live property updates).

2. **splitmuxsink location toggle** — Cannot change `location` property on splitmuxsink in PLAYING state (returns 400: "cannot be changed in Paused state"). `/dev/null` redirect impossible at runtime.

3. **Logical-only state** — REVERTED TO THIS. Recorders always write files while flow runs (splitmuxsink creates empty containers at flow start). REC/STOP track logical state in backend registry. SPLIT only works when REC is active. No GStreamer manipulation.

4. **0-byte files** — splitmuxsink creates empty container files at flow start regardless of data. With valves closed or no source signal, files stay empty. With working PGM video and no valves, files should fill with data. SRT/NDI/test pattern sources all work — the architecture supports any source type.

5. **WHEP instability** — GStreamer property updates on live pads (valves) caused pipeline instability. Removing valves fixed this.

### How it was hidden (2026-07-03):

**Frontend changes to revert:**
1. `OutputsPanel.tsx`: Removed `'recorder'` from `creatableTypes` state and `useEffect` callback. Kept in `OUTPUT_TYPE_LABELS` only.
2. `ControllerPage/index.tsx`: Removed `recorder` from `Panels` type, removed `RecorderIcon` component, removed `hasRecorders`/`recorderActive` state, removed recorder from `PANEL_ICONS`, removed recorder icon color logic, removed entire floating recorder bar JSX, removed `updateProductionStatus` usage.
3. `useControllerWs.ts`: Kept `RECORDER_SPLIT` and `RECORDER_TOGGLE` types (no harm).

**Backend kept intact** — `'recorder'` in OutputType, flow-generator code, controller WS handlers, directory listing endpoint, recorder API methods in strom.ts. All ready to re-enable.

**To re-enable:** Put `'recorder'` back in `creatableTypes`, recreate the `RecorderIcon` component, add back to `PANEL_ICONS`, restore the floating bar. Backend needs no changes.

---

## Documentation To-Do

> Installation guides and small feature enhancements to write when ready.

### Upstream PR Preparation
- **Backend (7 commits):** Need PR to Eyevinn/open-live. Key changes: NDI/SDI source+output types, capabilities endpoint (NDI/SDI/AES67 detection), SDI audio routing fix, production creation with sources, companion module /controllers endpoint, NV12 videoformat in flow-generator, validation accepting booleans. PR description should cover: what was added (new stream types, capabilities), why (broadcast hardware integration), breaking changes (none — backward compatible).
- **Frontend (3 commits):** Need PR to Eyevinn/open-live-studio. Key changes: NDI discovery dropdown, SDI device picker, LAN WHEP hostname rewrite, PGM proxy bypass, API base URL doubling fix, capabilities-driven show/hide of hardware-dependent types. PR description: UX additions for NDI/SDI hardware, network access fixes.
- **PR hygiene:** Rebase on upstream main, squash related commits into logical groups if needed, test locally before submitting, link to companion module PR if submitted separately.
### Quick Implementation
- **AES67 capability detection** — add `aes67: boolean` to capabilities endpoint (check Strom `/api/blocks` for `builtin.aes67_input`). Add `aes67` to `StreamType` union, frontend `Capabilities` interface, and SourcesPanel useEffect (hide AES67 button when no AES67 blocks). ~15 lines across 3 files.

### Local Setup Guide
- Hardware requirements (GPU, DeckLink cards, audio interface)
- Desktop Video driver installation
- docker compose up — first run
- Dashboard usage
- Creating first production with SDI/NDI sources
- Companion module setup

### Hybrid Setup Guide
- Prerequisites: Headscale VPS, OSC account with PAT
- VPS setup — `setup-vps.sh` walkthrough
- Tailscale client on Strom machine
- OSC instance creation (CouchDB, Open Live, Studio)
- CORS_ORIGIN configuration
- Testing the end-to-end flow: source creation → production activation → WHEP monitoring

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

---

## Media Player — Remaining Issues (2026-07-05)

### What works:
- Video reaches multiviewer and PGM via WHEP
- Player state polling (progress bar, timer, status dot)
- Playlist sync to Strom when clips are added
- Loop default set to `false` (software loop in frontend)
- Auto-stop after production activation (doesn't auto-play)
- Clip change via GOTO(0) before PLAY

### Strom fixes deployed (custom image `open-live-strom-ndi:0.6.6-mpfixed`):
- `is_live(true)` + `capsfilter` (video/x-raw, audio/x-raw) between appsrc and queue in builder.rs
- PAUSED→PLAYING cycle on appsrc elements during `load_current_file_inner` in state.rs
- GPU decode disabled via `GST_PLUGIN_FEATURE_RANK` env var in docker-compose.yml

### Remaining TODO:

1. **Audio meter not working** — No channel-level meter data reaching the frontend. Strom emits `MeterData` events for main/monitor/aux/group but not `ch0`/`ch1`. Root cause: audio `not-negotiated` error on appsrc_audio prevents audio data from reaching the audio mixer's level elements. The capsfilter fix should resolve this but may need verification.

2. **Logic of mediaplayer buttons not working** — Transport button borders should show colored when active (green=playing, amber=paused, red=stopped) and zinc when inactive. Fix applied in code but frontend container may need rebuild. Also: play button sends GOTO(0) to force loading new playlist file before PLAY.

3. **Loop-button not working** — `loop_playlist` is a non-live Strom property (can only be set at flow creation time). Implemented software loop in frontend: when `loopOn` is true and playerState reaches `stopped` near duration end, auto-sends PLAY. Fix applied in code but frontend container may need rebuild.

4. **Audio channel routing (audiorouter) — Strom feature request** — `builtin.audiorouter` has all properties `live: false`. Live channel remapping not possible without a Strom architecture change. See Feature Request section below. Stereo linking (ganging two adjacent mixer strips) is a separate Studio-level feature that can be implemented independently.

5. **Studio audio panel enhancements** — Per-strip H/G/C/E processing buttons, pan knob, input gain, 4-band EQ, gate, compressor, and stereo linking. All backend-ready (Strom properties are `live: true`) but require frontend build. See Strom Audiomixer UI reference above.

---

## Feature Request: Independent Output Flows via Inter-Pipeline

> Design spec for decoupling output flows from the main production flow. Not yet implemented.

### Problem

Currently all outputs (SRT, NDI, SDI, recorder) are wired into a single Strom flow alongside the vision mixer and sources. This means every output starts/stops with the production — you can't start recording without the stream running, or stop SDI output without killing the whole production.

### Solution

Use Strom's `builtin.inter_output` / `builtin.inter_input` blocks to split outputs into their own flows:

```
Production "Live Show" activated:

  ┌─ Main Flow (always running) ──────────────────────────────┐
  │                                                           │
  │  Sources → Mixer → inter_output("srt_out_prod-a1b2c3d4")  │
  │                   inter_output("ndi_out_prod-a1b2c3d4")   │
  │                   inter_output("rec_main_prod-a1b2c3d4")  │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
              │              │              │
              ▼              ▼              ▼
  ┌─ SRT Flow ───┐  ┌─ NDI Flow ───┐  ┌─ Rec Flow ───┐
  │ inter_input  │  │ inter_input  │  │ inter_input  │
  │    → srt_out │  │    → ndi_out │  │    → recorder │
  └──────────────┘  └──────────────┘  └──────────────┘
    stopped            stopped            stopped
   (start on click)   (start on click)   (start on click)
```

### Channel Naming

`{outputName}_{productionIdFirst8}` — e.g. `srt_main_feed_prod-a1b2c3d4`

Unique, traceable, survives output name changes.

### Lifecycle

1. **Production activated** → main flow created + started. Output flows created (stopped).
2. **Click "Stream"** → SRT flow started. Click again → stopped.
3. **Click "SDI Out"** → SDI flow started. Click again → stopped.
4. **Click "Rec"** → Recorder flow started. Click again → stopped.
5. **Production deactivated** → all flows stopped + deleted.

WHEP outputs (multiviewer, PGM preview) stay in the main flow — always needed.

### Resource Cost

| | One flow (current) | Separate flows |
|---|---|---|
| GPU memory | 1× NVENC session per output | Same |
| System RAM | ~500MB | +~100MB per output flow |
| CPU threads | ~8-15 | +~2-5 per output flow |
| GPU encode | 1 encoder instance | 1 per flow (NVENC supports 2-3 on P6000) |
| Inter-flow transport | N/A | Shared memory, zero-copy, negligible CPU |

### Backend Changes

- `flow-generator.ts`: split into main flow (sources + mixer + inter_outputs) and output flows (inter_input → output block type)
- `productions.ts`: manage multiple flows per production (create all, start main, start/stop outputs on demand)
- New WS messages: `OUTPUT_START`, `OUTPUT_STOP` per `outputId`
- `db/types.ts`: add `outputFlowIds: Record<string, string>` to `ProductionDoc`
- Activate creates all flows at once; main starts immediately, outputs start on-demand
- Deactivate stops + deletes all flows

### Frontend Changes

- Start/stop buttons per output in production view (stream, SDI, recorder)
- Visual state indicator per output (running = green dot, stopped = grey dot, error = red)
- New WS message types `OUTPUT_START` / `OUTPUT_STOP` added to `useControllerWs.ts`

---

## Feature Request: Live Audio Routing Matrix (Strom-level change)

> **Target: Eyevinn/strom** — requires a Strom architecture change, not possible from Open-Live side.

### Problem

Strom's `builtin.audiorouter` block has all properties set to `live: false`. The routing matrix is built once at flow construction time and cannot be changed while the pipeline is running. This means:

- Channel remapping across multi-channel sources (SDI, NDI, AES67) requires stopping the production
- No real-time repatching during a live show — everything must be pre-configured
- Can't reassign channels on the fly when sources change or new audio feeds arrive

### Root Cause

The audiorouter builds its entire internal GStreamer audio wiring at construction time — it analyzes which outputs need mixers, creates direct or mixed paths, and instantiates the right elements. Once built, the pipeline is static. Changing the matrix would require tearing down and rebuilding audio paths, which can't be done while GStreamer is in PLAYING state.

### Proposed Solution

Rebuild the audiorouter using a valve-based architecture:

- **Pre-allocate all possible routes** at construction time with `valve` elements on each path
- The routing matrix becomes a set of valve open/close operations instead of pipeline construction
- `routing_matrix` property becomes `live: true` — changes apply instantly
- Fan-out (one input → multiple outputs) handled by tee elements
- Mixing (multiple inputs → one output) pre-routed through `audiomixer` with per-input gain control

Alternatively, use `audiomixer` everywhere with per-input gain:

- All inputs always connected to all outputs via mixer elements
- "Routing" is simply setting gain to 0 (disconnect) or 1.0 (connect) per input on each output mixer
- Even simpler implementation, no valve complexity
- Slightly higher CPU usage (all mixers running even with gain=0)

### Use Case

The primary use case is multi-channel source remapping. For example, an SDI source with 4 audio channels where the operator needs:

- Ch1 → Mixer strip 1 (mono)
- Ch2 → Mixer strip 2 (mono)
- Ch3 + Ch4 → Mixer strip 3 (stereo pair, left/right)

Without live routing, this must be configured before showtime and cannot be changed mid-show. With a live matrix, the operator could repatch channels in real-time as sources change.

---

## Feature Request: Merge Transition (Strom-level change)

> **Target: Eyevinn/strom** — requires layer-aware transition support in `builtin.vision_mixer`.

### What is Merge?

In vMix, the **Merge** transition is an automated animation that seamlessly transitions between two inputs sharing common layers. Instead of a hard cut or fade, it compares the layer structure of Preview and Program, finds matching sources, and animates their position/size changes while fading out non-matching layers.

**Example:** A two-person split-screen → full-screen zoom on one person. The matching person's layer smoothly zooms from the small box to full-screen, while the other person's layer fades out.

### Problem

The current `builtin.vision_mixer` treats all inputs as flat video frames. Transitions operate on the final composited frame — there is no concept of individual layers within the mixer that can be compared or animated independently. Merge requires:

1. Layer enumeration — the mixer must expose which sources/layers are on each input
2. Layer matching — identify layers that exist in both Preview and Program with the same source
3. Per-layer animation — animate matching layers' position/size from source state to destination state over the transition duration
4. Per-layer fade — non-matching layers fade out (or use a standard fade transition as fallback)

None of this is currently possible with the flat-frame transition model.

### Proposed Solution

Extend `builtin.vision_mixer` with a `merge` transition type:

- **At transition start**: snapshot the layer stack of both PGM and PVW inputs
- **Identify matching layers**: same source channel → same layer in both stacks
- **Build animation paths**: for each matching layer, compute the interpolated position/size from PVW state to PGM state
- **Animate during transition**: update each matching layer's x/y/width/height per frame over the transition duration
- **Handle non-matching layers**: fade out PVW-only layers, fade in PGM-only layers
- **Smart Merge** (optional): reorder layers in PVW to match PGM layer order before animating, to ensure the cleanest possible transition

This is a significant architectural change — the vision mixer currently composites all layers into a single frame before transitions run. Merge needs access to the pre-composited layer stack, which requires refactoring the video pipeline.

### Use Case

Multi-box interview setups, PiP transitions, graphics overlays — any scenario where the operator wants a polished, "news broadcast" style transition where elements glide to new positions instead of cut/fade.

### Frontend Impact

Once Strom supports `merge`, the Studio UI would need:
- A "MERGE" chip in the TransitionPanel (alongside FADE, DIP, etc.)
- A "Merge" entry in TRANSITION_TYPES + TRANSITION_LABELS
- No additional UI changes — it's just another transition type, selected like any other

---

## Audio Panel Dynamics — Implementation (2026-07-05, local only, NOT pushed)

### What was built

**Backend:**
- `AUDIO_DYNAMICS_SET` WS message type + handler in `controller.ts`
  - Maps logical property names (gain, pan, hpf_freq, gate_threshold, comp_ratio, eq1_freq, etc.) to Strom's internal element IDs and property names using a `DYNAMICS_MAP` lookup table
  - Channel indexing: channel 1 → `gain_0`, `hpf_0`, `gate_0`, `comp_0`, `eq_0`
  - Property mappings discovered from Strom's block definition API:
    - `ch1_gain` → element `gain_0`, property `volume`
    - `ch1_pan` → element `pan_0`, property `panorama`
    - `ch1_hpf_enabled` → element `_block`, property `ch1_hpf_enabled` (block-level, non-live)
    - `ch1_hpf_freq` → element `hpf_0`, property `cutoff`
    - `ch1_gate_enabled` → element `gate_0`, property `enabled`
    - `ch1_gate_threshold` → element `gate_0`, property `gt`
    - `ch1_gate_attack` → element `gate_0`, property `at`
    - `ch1_gate_release` → element `gate_0`, property `rt`
    - `ch1_comp_enabled` → element `comp_0`, property `enabled`
    - `ch1_comp_threshold` → element `comp_0`, property `al`
    - `ch1_comp_ratio` → element `comp_0`, property `cr`
    - `ch1_comp_attack` → element `comp_0`, property `at`
    - `ch1_comp_release` → element `comp_0`, property `rt`
    - `ch1_comp_makeup` → element `comp_0`, property `mk`
    - `ch1_comp_knee` → element `comp_0`, property `kn`
    - `ch1_eq_enabled` → element `eq_0`, property `enabled`
    - `ch1_eq1-4_freq/gain/q` → element `eq_0`, properties `f-0`/`g-0`/`q-0` through `f-3`/`g-3`/`q-3`
  - Block-level properties (hpf_enabled) use `strom.updateBlockProperties()`
  - Element-level properties use `strom.properties.updateElement()`
  - Broadcasts `AUDIO_DYNAMICS_STATE` to all connected clients after each update
- `updateBlockProperties()` method added to `StromClient` (PATCH `/api/flows/{flowId}/blocks/{blockId}/properties`)
- `AUDIO_DYNAMICS_STATE` received by frontend → updates `audio.store.ts` `dynamics` map

**Frontend:**
- `ProcessingPopup.tsx` — new component (dark overlay, modal)
  - Sections: Gain (knob, -20 to +20 dB), HPF (freq knob + enable toggle), Gate (threshold/attack/release knobs + enable), Compressor (threshold/ratio/attack/release/makeup/knee knobs + enable), EQ (4-band: freq/gain/Q per band + enable)
  - Knob component: vertical range slider with label + value readout
  - Toggle component: checkbox for enable/disable
  - Section component: colored header button that toggles enable state
- `AudioPanel.tsx` — channel strip enhancements:
  - H/G/C/E buttons below channel name: 4 tiny colored squares (purple/green/orange/blue when active, dark gray when off)
  - Click any H/G/C/E button → opens ProcessingPopup for that channel
  - Pan slider (L/R range input) below ON/AFV buttons on input channels
  - `chNum` prop added to `ChannelStrip` — derived from `elementId` (e.g., `ch1` → 1)
- `audio.store.ts` — new `dynamics` state field (`chN_property → value`) and `applyDynamics` action
- `useControllerWs.ts` — `AUDIO_DYNAMICS_SET` outbound message type, `AUDIO_DYNAMICS_STATE` inbound handler, `applyDynamics` wired into `actionsRef`

**Strom property live status (verified from API):**
All dynamics properties are `live: true` EXCEPT `hpf_enabled`. The `live=False` in the earlier MEMORY.md spec was a bug in my analysis script (I was reading the wrong field).

| Property | Live |
|----------|------|
| `chN_gain` | ✓ |
| `chN_pan` | ✓ |
| `chN_hpf_enabled` | ✗ (block-level, non-live) |
| `chN_hpf_freq` | ✓ |
| `chN_gate_*` (4 params) | ✓ all |
| `chN_comp_*` (6 params) | ✓ all |
| `chN_eq1-4_*` (12 params) | ✓ all |

### Files changed (local only, NOT pushed):
- backend: `lib/strom.ts`, `ws/controller.ts`
- frontend: `components/ProcessingPopup.tsx` (new), `pages/ControllerPage/AudioPanel.tsx`, `store/audio.store.ts`, `hooks/useControllerWs.ts`

### Known issues:
- `gain_0.volume` (ch1_gain) property PATCH reports success in Strom logs but value doesn't persist in the element. The `pan_0.panorama` property works correctly via the same element-level PATCH mechanism. This may be a Strom bug with the `volume` element used as a gain stage — the `volume` GStreamer element might clamp or override values set via property PATCH.
- `hpf_enabled` is non-live (block-level property). The toggle works but requires deactivate → reactivate to apply.

## SRT Gateway — Architecture (2026-08-29, committed)

The dashboard's SRT GATEWAY section drives a dedicated **Strom** instance that captures
DeckLink SDI and sends **MPEG-TS or EFP** over SRT (as callers) to a Haivision relay.

### Topology
- **SRT Gateway Strom** — `open-live-srt-gateway` (docker compose in `open_live_srt/`),
  port **8081**, `privileged` with DeckLink + GPU mounts. Runs independently of
  local/hybrid mode. The DeckLink cards are exclusively owned by this container.
- **Hybrid Strom + CouchDB** (`open_live_hybrid/`, port 8080/5984) — serves the
  **OSC Open Live** backend via the VPS gateway (`93.115.23.149:8080/5984 → 100.64.0.1`).
  VPS gateway watchdog (`scripts/openlive-gateway-check.sh`, systemd timer on VPS)
  keeps the chain healthy.
- **Relay** (Haivision SRT): publish ports `23001–23005` (`streamid=publish:srt_01…05`),
  read ports `23101+` (`streamid=read:srt_01…`). SRT Gateway dials out (caller) to publish;
  receivers (VLC, Open Live Strom, EFP receivers) dial out to read.

### Flows (per configured SDI port)
- **Sender, MPEG-TS**: `decklink_input → videoenc → mpegtssrt_output (caller)`
- **Sender, EFP**:      `decklink_input → videoenc → efpsrt_output (caller)`
- **Receiver, MPEG-TS**: `mpegtssrt_input (caller) → decklink_output`
- **Receiver, EFP**:     `efpsrt_input (caller) → decklink_output`
- Device number = **SDI index** (SDI1=0 … SDI12=11) — not user-configurable.
- videoenc: `codec` h264/h265, `bitrate`, `tune=zerolatency`, `keyframe_interval=50`.
- Audio is fixed by container: MPEG-TS = **AAC**, EFP = **Opus**. Both carry audio.

### DeckLink driver / card notes
- Cards are **Quad 2 (`a13f`) + Duo 2 (`a140`)** — io-only; the classic SDK/ffmpeg
  `-f decklink` cannot enumerate them (ffmpeg shows 0 devices). Strom's GStreamer
  `decklinkvideosrc` works via `device-number` **after** configuring the card profile +
  connector mapping in `BlackmagicDesktopVideoSetup` (GUI, Desktop Video 15.3.1a4).
- Device 0 has no input; signals are on devices 1–11 (SDI feeds via videohub).
- The decklink input must be locked to the signal format (e.g. `mode=1080p50`); auto
  fell back to 480i which broke the GPU encoder negotiation.

### Dashboard SRT GATEWAY
- Traffic-light chips (green=running, red=stopped/error, grey=off), per-port tooltip
  shows role/container/audio/address.
- Settings (cog): global Codec/Bitrate/Video Mode; per-port Container (mpegts/efp),
  Role (off/sender/receiver), SRT Address. Device number is automatic.
- Start = (re)create + start all flows; Stop = delete all; config save restarts streams.
- SRT addresses live only in gitignored `open_live_srt/srt-config.json`.

### Verified
- EFP end-to-end with a local `efpsrt_input` receiver: video H.264→NV12 1920×1080,
  audio Opus→S16LE 48k. (Cloud-Strom receiver check is the user's.)
- MPEG-TS: ffmpeg-confirmed H.264 + AAC.
- Hybrid Strom pulls the relay read URL (H.265+AAC) — the on-prem side of OSC Open Live.
