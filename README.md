# Open Live Workspace

Dashboard, deployment configs, and project memory for the [Open Live](https://github.com/Eyevinn/open-live) broadcast production platform.

## What It Does

- **Dashboard** — web UI that monitors Docker containers, shows live status, real version numbers, and lets you start/stop/restart services with a single click
- **Deployment configs** — ready-to-run `docker-compose.yml` for two modes:
  - **Local** — everything runs on your machine (Strom, Open-Live, Open-Live-Studio, CouchDB)
  - **Hybrid** — Strom runs locally, Open-Live and Studio run on OSC (cloud)
- **Memory agent** — `MEMORY.md` tracks architecture decisions, reference sources, and progress

## Architecture

```
[Browser] → Dashboard (:3100) → Docker API → [Containers]
[Browser] → Open Studio  (:3000) → Studio UI
[Browser] → Backend       (:8000) → Open-Live API
[Browser] → Strom         (:8080) → Strom Web UI
```

| Container | Port | Local mode | Hybrid mode |
|-----------|------|:----------:|:-----------:|
| CouchDB | 5984 | Yes | Yes |
| Strom | 8080 | Yes | Yes |
| Open-Live backend | 8000 | Yes | — (OSC) |
| Open-Live-Studio | 3000 | Yes | — (OSC) |

## Requirements

### All Platforms
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (or Docker Engine + Docker Compose on Linux)
- **[Node.js](https://nodejs.org/)** 23 or later
- **[Git](https://git-scm.com/)** 
- **pnpm** 10.33+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- The following repos cloned into sibling folders (the docker-compose mounts them as volumes):
  - [open-live](https://github.com/Eyevinn/open-live) → `../backend`
  - [open-live-studio](https://github.com/Eyevinn/open-live-studio) → `../frontend`

### Linux (Recommended)
- Ubuntu 22.04+ or equivalent
- NVIDIA GPU highly recommended for Strom (hardware encode/decode/compositing)
- For GPU support: [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

### macOS
- Docker Desktop with at least 4GB RAM allocated
- Strom runs without GPU acceleration (software fallback, fine for testing)

### Windows
- Docker Desktop (WSL2 backend recommended)
- Windows Terminal (or PowerShell/CMD)
- Strom runs without GPU acceleration

## Installation

### 1. Clone Everything

```bash
git clone https://github.com/YOUR_USERNAME/open-live-workspace.git
cd open-live-workspace

# Clone the source repos alongside (1 level up from this repo)
cd ..
git clone https://github.com/Eyevinn/open-live.git backend
git clone https://github.com/Eyevinn/open-live-studio.git frontend

cd open-live-workspace
```

Your folder structure should be:
```
├── backend/          # open-live source
├── frontend/         # open-live-studio source
└── open-live-workspace/
    ├── dashboard/
    ├── open_live_local/
    ├── open_live_hybrid/
    └── MEMORY.md
```

### 2. Start the Stack

#### Option A — Local Mode (Everything on your machine)

```bash
# macOS / Windows (Docker Desktop)
cd open_live_local
docker compose up -d

# Linux — set your LAN IP for Studio access from other machines
IP=192.168.1.100 docker compose up -d

# Linux with GPU
IP=192.168.1.100 docker compose --profile gpu up -d
```

#### Option B — Hybrid Mode (Strom local, rest on OSC)

```bash
cd open_live_hybrid
STROM_API_KEY=your-generated-api-key docker compose up -d
```

Then configure Open-Live and Studio on [OSC](https://www.osaas.io) pointing to your Strom's public URL.

### 3. Start the Dashboard

#### Windows
Double-click `dashboard/start.bat`

#### macOS / Linux
```bash
cd dashboard
node server.mjs
# or:
npm start
```

Then open **http://localhost:3100** — or use the desktop shortcut on Linux:

```bash
cp dashboard/open-live-dashboard.desktop ~/Desktop/
```

### 4. Open Studio

In the dashboard, click **Start** under LOCAL MODE. Once all containers are running, click **Open Studio** to open the production controller at port 3000.

## Docker Tags Used

| Image | Tag | Notes |
|-------|-----|-------|
| `eyevinntechnology/strom-full` | `0.6.6` | GStreamer pipeline engine with CEF/Chromium |
| `couchdb` | `3.5.2` | Document database |
| `node` | `23-slim` | Runtime for backend and studio |

## Files

```
dashboard/
├── server.mjs              # Dashboard server (zero dependencies, pure Node.js)
├── start.sh                # Launch script (Linux/macOS)
├── start.bat               # Launch script (Windows)
├── open-live-dashboard.desktop  # Linux desktop shortcut
├── icon.svg                # Desktop icon
└── package.json

open_live_local/
├── docker-compose.yml      # 4-service local stack
└── .env.example            # Configuration template

open_live_hybrid/
├── docker-compose.yml      # 2-service hybrid stack
└── .env.example            # Configuration template

MEMORY.md                   # Project memory agent
```

## Troubleshooting

**"No package.json found in /app"**
→ Make sure `backend/` and `frontend/` are cloned in the parent directory, not inside this repo.

**Strom is unhealthy**
→ The image `strom-full:0.6.6` doesn't include `curl`. The healthcheck uses Python — make sure your compose file has the Python-based healthcheck.

**Studio shows blank page from LAN**
→ Set the `IP` env var to your machine's LAN address when running `docker compose up`.

**Dashboard shows "not created" for running containers**
→ The dashboard polls Docker every 5 seconds. Wait for the next poll, or reload the page.

## License

MIT — see [Eyevinn/open-live](https://github.com/Eyevinn/open-live) and [Eyevinn/strom](https://github.com/Eyevinn/strom) for upstream licenses.
