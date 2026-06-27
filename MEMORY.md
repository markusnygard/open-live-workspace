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
