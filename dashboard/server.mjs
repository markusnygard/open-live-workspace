import { createServer, get as httpGet } from "node:http";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = parseInt(process.env.PORT || "3100");

const CONTAINERS = {
  local: {
    couchdb:   "open-live-local-db",
    strom:     "open-live-local-strom",
    "open-live": "open-live-local-backend",
    studio:     "open-live-local-studio",
    modular:    "open-live-modular-studio",
  },
  hybrid: {
    couchdb:    "open-live-hybrid-db",
    strom:      "open-live-hybrid-strom",
  },
};

const VERSION_PROBES = {
  strom:     { port: 8080, path: "/api/version", field: "version" },
  couchdb:   { port: 5984, path: "/", field: "version" },
};

const GIT_REPOS = {
  "open-live": "backend",
  studio:       "frontend",
  modular:      "../open-live-modular-studio",
};

function sh(cmd, opts) {
  return execSync(cmd, { timeout: opts?.timeout || 5000, encoding: "utf8", stdio: ["pipe","pipe","ignore"], ...opts }).trim();
}

function dockerPs(name) {
  try {
    const out = sh("docker inspect \"" + name + "\" --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Config.Image}}|{{.State.StartedAt}}'", { timeout: 5000 });
    if (!out) return null;
    const parts = out.split("|");
    const startedAt = parts[3] || "";
    const uptimeMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
    return { status: parts[0], health: parts[1] || "none", image: parts[2] || "", uptimeMs: uptimeMs > 0 ? uptimeMs : 0 };
  } catch {
    return null;
  }
}

function gitVersion(relPath) {
  try {
    const out = sh("git tag --sort=-v:refname", { cwd: join(ROOT, relPath), timeout: 3000 });
    if (!out) return null;
    return out.split("\n")[0];
  } catch {
    return null;
  }
}

function imageVersion(info) {
  if (!info || !info.image) return null;
  const m = info.image.match(/:(\d[\d.]*)/);
  return m ? m[1] : null;
}

function httpGetJson(port, path) {
  return new Promise((resolve) => {
    const req = httpGet("http://localhost:" + port + path, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data.trim()));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

// ── SRT Gateway (drives Strom EFP-SRT flows; SRT addresses stay local/gitignored) ──
const SRT_DIR = join(ROOT, "open_live_srt");
const SRT_CONFIG_FILE = join(SRT_DIR, "srt-config.json");
const SRT_FLOW_PREFIX = "srt-gw-";
const SRT_STROM_URL = process.env.SRT_STROM_URL || "http://localhost:8081";
const SRT_STROM_KEY = process.env.SRT_STROM_KEY || "dev-key-local";
const SRT_CODECS = ["h264", "h265"];
const SRT_BITRATES = [4, 6, 8, 12, 25];

function defaultSrtConfig() {
  return {
    stream: { codec: "h264", bitrate: 6 },
    ports: Array.from({ length: 12 }, (_, i) => ({ id: "SDI" + (i + 1), role: "off", address: "", device: i })),
  };
}

function loadSrtConfig() {
  let cfg = null;
  try { cfg = JSON.parse(readFileSync(SRT_CONFIG_FILE, "utf8")); } catch {}
  if (!cfg || !Array.isArray(cfg.ports)) { cfg = defaultSrtConfig(); saveSrtConfig(cfg); return cfg; }
  cfg.stream = {
    codec: SRT_CODECS.includes(cfg.stream && cfg.stream.codec) ? cfg.stream.codec : "h264",
    bitrate: SRT_BITRATES.includes(Number(cfg.stream && cfg.stream.bitrate)) ? Number(cfg.stream.bitrate) : 6,
  };
  cfg.ports = cfg.ports.map((p, i) => ({
    id: (p.id || "SDI" + (i + 1)).replace(/^SDI (\d+)$/, "SDI$1"),
    role: ["off", "sender", "receiver"].includes(p.role) ? p.role : "off",
    address: p.address || "",
    device: Number.isInteger(p.device) ? p.device : i,
  }));
  return cfg;
}

function saveSrtConfig(cfg) {
  const normalized = {
    stream: {
      codec: SRT_CODECS.includes(cfg.stream && cfg.stream.codec) ? cfg.stream.codec : "h264",
      bitrate: SRT_BITRATES.includes(Number(cfg.stream && cfg.stream.bitrate)) ? Number(cfg.stream.bitrate) : 6,
    },
    ports: (cfg.ports || []).map((p, i) => ({
      id: (p.id || "SDI" + (i + 1)).replace(/^SDI (\d+)$/, "SDI$1"),
      role: ["off", "sender", "receiver"].includes(p.role) ? p.role : "off",
      address: p.address || "",
      device: Number.isInteger(p.device) ? p.device : i,
    })),
  };
  writeFileSync(SRT_CONFIG_FILE, JSON.stringify(normalized, null, 2));
}

function ensureCaller(url) {
  if (!url) return url;
  if (/mode=[a-z]+/.test(url)) return url.replace(/mode=[a-z]+/, "mode=caller");
  return url + (url.includes("?") ? "&" : "?") + "mode=caller";
}

async function stromReq(method, path, body) {
  try {
    const opts = { method, headers: { "Authorization": "Bearer " + SRT_STROM_KEY } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(SRT_STROM_URL + path, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

async function listSrtFlows() {
  const r = await stromReq("GET", "/api/flows");
  if (!r.ok) return [];
  return (r.data && r.data.flows || []).filter((f) => (f.name || "").startsWith(SRT_FLOW_PREFIX));
}

async function deleteSrtFlows() {
  const flows = await listSrtFlows();
  for (const f of flows) {
    await stromReq("POST", "/api/flows/" + f.id + "/stop");
    await stromReq("DELETE", "/api/flows/" + f.id);
  }
  return flows.length;
}

function buildSrtFlow(port, index, stream) {
  const addr = ensureCaller(port.address);
  const device = Number.isInteger(port.device) ? port.device : index;
  const blocks = [];
  const links = [];
  if (port.role === "sender") {
    blocks.push(
      { id: "dl", block_definition_id: "builtin.decklink_input", name: port.id + " In",
        properties: { device_number: index, stream_mode: "audio_video" }, position: { x: 0, y: 0 } },
      { id: "enc", block_definition_id: "builtin.videoenc", name: port.id + " Enc",
        properties: { codec: stream.codec, bitrate: stream.bitrate * 1000 }, position: { x: 160, y: 0 } },
      { id: "efp", block_definition_id: "builtin.efpsrt_output", name: port.id + " EFP",
        properties: { srt_uri: addr, num_video_tracks: 1, num_audio_tracks: 1, latency: 120, wait_for_connection: false },
        position: { x: 320, y: 0 } },
    );
    links.push(
      { from: "dl:video_out", to: "enc:video_in" },
      { from: "enc:encoded_out", to: "efp:video_in" },
      { from: "dl:audio_out", to: "efp:audio_in_0" },
    );
  } else if (port.role === "receiver") {
    blocks.push(
      { id: "efpi", block_definition_id: "builtin.efpsrt_input", name: port.id + " EFP",
        properties: { srt_uri: addr, decode: true, num_video_tracks: 1, latency: 120 }, position: { x: 0, y: 0 } },
      { id: "dlo", block_definition_id: "builtin.decklink_output", name: port.id + " Out",
        properties: { device_number: index, stream_mode: "audio_video" }, position: { x: 200, y: 0 } },
    );
    links.push(
      { from: "efpi:video_out", to: "dlo:video_in" },
      { from: "efpi:audio_out_0", to: "dlo:audio_in" },
    );
  } else {
    return null;
  }
  return { id: "00000000-0000-0000-0000-000000000000", name: SRT_FLOW_PREFIX + port.id, blocks, links, properties: {} };
}

async function srtApply() {
  const cfg = loadSrtConfig();
  const removed = await deleteSrtFlows();
  let created = 0, failed = 0;
  for (let i = 0; i < cfg.ports.length; i++) {
    const p = cfg.ports[i];
    if (p.role === "off" || !p.address) continue;
    const flow = buildSrtFlow(p, i, cfg.stream);
    if (!flow) continue;
    const r = await stromReq("POST", "/api/flows", flow);
    if (r.ok && r.data && r.data.flow && r.data.flow.id) {
      await stromReq("POST", "/api/flows/" + r.data.flow.id + "/start");
      created++;
    } else {
      failed++;
    }
  }
  return { removed, created, failed };
}

async function srtStatus() {
  const flows = await listSrtFlows();
  const map = {};
  for (const f of flows) {
    map[f.name.replace(SRT_FLOW_PREFIX, "")] = f;
  }
  const cfg = loadSrtConfig();
  const channels = cfg.ports.map((p) => {
    const f = map[p.id];
    return {
      sdi: p.id,
      role: p.role,
      address: p.address || "",
      device: p.device,
      running: !!(f && f.running),
      color: p.role === "off" ? "off" : (f && f.running) ? "green" : "red",
    };
  });
  return { flows: flows.length, channels };
}

async function probeVersion(svc, ctr) {
  if (!ctr || ctr.status !== "running") return ctr;
  const probe = VERSION_PROBES[svc];
  const repo = GIT_REPOS[svc];
  if (probe) {
    try {
      const out = await httpGetJson(probe.port, probe.path);
      if (out && probe.field) {
        try { const json = JSON.parse(out); const ver = json[probe.field]; if (ver) return { ...ctr, version: ver }; } catch {}
      }
      return { ...ctr, version: (out && !probe.field ? out.slice(0, 80) : null) || imageVersion(ctr) };
    } catch {
      return { ...ctr, version: imageVersion(ctr) };
    }
  }
  if (repo) {
    const gv = gitVersion(repo);
    if (gv) return { ...ctr, version: gv };
  }
  return { ...ctr, version: imageVersion(ctr) };
}

async function allStatus() {
  const result = {};
  for (const [mode, containers] of Object.entries(CONTAINERS)) {
    result[mode] = {};
    for (const [name, cid] of Object.entries(containers)) {
      const info = dockerPs(cid);
      result[mode][name] = await probeVersion(name, info);
    }
  }
  result.srt = await srtStatus();
  return result;
}

function runCompose(mode, action) {
  const dir = join(ROOT, "open_live_" + mode);
  const file = join(dir, "docker-compose.yml");
  let args;
  if (action === "down") args = "down";
  else if (action === "ps-json") args = "ps --format json";
  else args = action + " -d";
  const cmd = "docker compose -f \"" + file + "\" " + args;
  try {
    const out = sh(cmd, { timeout: 60000, cwd: dir });
    return { ok: true, command: action, output: out, mode };
  } catch (e) {
    return { ok: false, command: action, error: e.stderr || e.message, mode };
  }
}

function sendJson(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/api/status" && req.method === "GET") {
    sendJson(res, 200, await allStatus());
    return;
  }

  if (path.startsWith("/api/ps/") && req.method === "GET") {
    const mode = path.split("/")[3];
    if (!["local", "hybrid"].includes(mode)) {
      sendJson(res, 400, { ok: false, error: "Invalid mode: " + mode });
      return;
    }
    const result = runCompose(mode, "ps-json");
    try {
      const containers = (result.output || "").split("\n").filter(Boolean).map(function(line) {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      sendJson(res, 200, { ok: true, mode, containers });
    } catch {
      sendJson(res, 200, { ok: false, mode, error: result.error || "Failed to parse container list", raw: result.output });
    }
    return;
  }

  if (path.startsWith("/api/stop/") && req.method === "POST") {
    const mode = path.split("/")[3];
    if (!["local", "hybrid"].includes(mode)) {
      sendJson(res, 400, { ok: false, error: "Invalid mode: " + mode });
      return;
    }
    const result = runCompose(mode, "down");
    sendJson(res, result.ok ? 200 : 500, result);
    return;
  }

  if (path.startsWith("/api/start/") && req.method === "POST") {
    const mode = path.split("/")[3];
    if (!["local", "hybrid"].includes(mode)) {
      sendJson(res, 400, { ok: false, error: "Invalid mode: " + mode });
      return;
    }
    const result = runCompose(mode, "up");
    // Force-start any containers stuck in "Created" state
    try {
      const containers = CONTAINERS[mode];
      if (containers) {
        for (const cid of Object.values(containers)) {
          const state = sh("docker inspect --format '{{.State.Status}}' \"" + cid + "\"", { timeout: 3000 });
          if (state === 'created') {
            sh("docker start \"" + cid + "\"", { timeout: 30000 });
          }
        }
      }
    } catch { /* best effort */ }
    sendJson(res, result.ok ? 200 : 500, result);
    return;
  }

  if (path === "/api/dashboard/autostart") {
    const autostartDir = join(process.env.HOME || "/root", ".config/autostart");
    const autostartFile = join(autostartDir, "open-live-dashboard.desktop");
    const desktopFile = join(ROOT, "dashboard", "open-live-dashboard.desktop");
    if (req.method === "GET") {
      try {
        const fs = await import("node:fs");
        return sendJson(res, 200, { autoStart: fs.existsSync(autostartFile) });
      } catch {
        return sendJson(res, 200, { autoStart: false });
      }
    }
    if (req.method === "POST") {
      try {
        const fs = await import("node:fs");
        if (fs.existsSync(autostartFile)) {
          fs.unlinkSync(autostartFile);
          return sendJson(res, 200, { autoStart: false });
        } else {
          fs.mkdirSync(autostartDir, { recursive: true });
          // Copy desktop file to autostart (or create symlink)
          try { fs.copyFileSync(desktopFile, autostartFile); } catch {
            // If copy fails, create a minimal entry
            fs.writeFileSync(autostartFile, `[Desktop Entry]\nType=Application\nName=Open Live Dashboard\nExec=node ${join(ROOT, "dashboard", "server.mjs")}\nTerminal=false\n`);
          }
          return sendJson(res, 200, { autoStart: true });
        }
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }
    return;
  }

  if (path === "/api/hybrid/autostart") {
    if (req.method === "GET") {
      try {
        const current = sh("docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' \"" + CONTAINERS.hybrid.strom + "\"", { timeout: 3000 });
        return sendJson(res, 200, { autoStart: current === "unless-stopped" || current === "always" });
      } catch {
        return sendJson(res, 200, { autoStart: false });
      }
    }
    if (req.method === "POST") {
    // Toggle whether hybrid containers auto-start on boot
    try {
      const current = sh("docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' \"" + CONTAINERS.hybrid.strom + "\"", { timeout: 3000 });
      const enabled = current === "unless-stopped" || current === "always";
      const newPolicy = enabled ? "no" : "unless-stopped";
      for (const [, cid] of Object.entries(CONTAINERS.hybrid)) {
        sh("docker update --restart=" + newPolicy + " \"" + cid + "\"", { timeout: 5000 });
      }
      sendJson(res, 200, { ok: true, autoStart: !enabled });
    } catch (e) {
              sendJson(res, 500, { ok: false, error: e.stderr || e.message });
      }
      return;
    }
  }

  if (path.startsWith("/api/restart/") && req.method === "POST") {
    const parts = path.split("/");
    const mode = parts[3];
    const name = parts[4];
    if (!["local", "hybrid"].includes(mode)) {
      sendJson(res, 400, { ok: false, error: "Invalid mode: " + mode });
      return;
    }
    const cid = CONTAINERS[mode] && CONTAINERS[mode][name];
    if (!cid) {
      sendJson(res, 400, { ok: false, error: "Unknown container: " + name });
      return;
    }
    try {
      sh("docker restart \"" + cid + "\"", { timeout: 30000 });
      sendJson(res, 200, { ok: true, container: name });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.stderr || e.message });
    }
    return;
  }

  if (path === "/api/srt/config" && req.method === "GET") {
    sendJson(res, 200, loadSrtConfig());
    return;
  }
  if (path === "/api/srt/config" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        saveSrtConfig(JSON.parse(body));
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }
  if (path === "/api/srt/start" && req.method === "POST") {
    const r = await srtApply();
    sendJson(res, r.created > 0 || r.removed >= 0 ? 200 : 500, r);
    return;
  }
  if (path === "/api/srt/stop" && req.method === "POST") {
    const removed = await deleteSrtFlows();
    sendJson(res, 200, { ok: true, removed });
    return;
  }

  if (path === "/api/modular/start" && req.method === "POST") {
    try {
      const modularDir = join(ROOT, "..", "open-live-modular-studio");
      // Stop and remove if already exists (could be stopped)
      try { sh("docker rm -f open-live-modular-studio", { timeout: 5000 }); } catch {}
      sh(
        "docker run -d --name open-live-modular-studio" +
        " --network open_live_local_default" +
        " -v \"" + modularDir + ":/app\"" +
        " -e OPEN_LIVE_URL=http://open-live:8000" +
        " -e CI=true" +
        " -e COREPACK_ENABLE_STRICT=0" +
        " -w /app" +
        " -p 3200:3200" +
        " node:lts-slim" +
        " sh -c \"corepack enable && pnpm install && pnpm exec vite --host 0.0.0.0 --port 3200 --strictPort\"",
        { timeout: 30000 }
      );
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.stderr || e.message });
    }
    return;
  }

  if (path === "/api/modular/stop" && req.method === "POST") {
    try {
      sh("docker rm -f open-live-modular-studio", { timeout: 20000 });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.stderr || e.message });
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(PAGE);
});

server.listen(PORT, () => {
  console.log("Dashboard: http://localhost:" + PORT);
});

// ── Page (built with string concat to avoid template-literal escaping) ─────

const PAGE = [
"<!DOCTYPE html>",
"<html lang=\"en\">",
"<head>",
"<meta charset=\"UTF-8\">",
"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
"<title>Open Live Dashboard</title>",
"<style>",
":root{--bg:#0b0f14;--card:#141a21;--border:#222a33;--green:#00e676;--red:#ff5252;--amber:#ffc107;--text:#c9d1d9;--muted:#6e7681;--accent:#58a6ff}",
"*{margin:0;padding:0;box-sizing:border-box}",
"body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}",
"header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border)}",
"header h1{font-size:22px;font-weight:600}",
"header .meta{font-size:13px;color:var(--muted);display:flex;gap:12px}",
".dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}",
".dot.on{background:var(--green)}.dot.off{background:var(--red)}.dot.warn{background:var(--amber)}.dot.unknown{background:var(--muted)}",
"main{max-width:900px;margin:24px auto;padding:0 24px}",
".mode-section{margin-bottom:28px}",
".mode-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}",
".mode-header h2{font-size:18px;font-weight:600;text-transform:uppercase}",
".mode-badge{font-size:12px;padding:3px 9px;border-radius:10px;font-weight:600}",
".mode-badge.active{background:#1a3524;color:var(--green)}",
".mode-badge.inactive{background:#252525;color:var(--muted)}",
".cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}",
".card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px}",
".card .name{font-weight:600;font-size:14px;margin-bottom:7px}",
".card .info{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}",
".card .status{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;font-weight:600}",
".card .status.running{color:var(--green)}.card .status.stopped{color:var(--red)}.card .status.unknown{color:var(--muted)}",
".actions{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}",
".srt-lights{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}",
".srt-light{display:inline-flex;align-items:center;gap:5px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:2px 10px;font-size:12px;font-weight:600;color:var(--text);cursor:default}",
".srt-light:before{content:'';width:9px;height:9px;border-radius:50%;background:var(--muted)}",
".srt-light.green:before{background:var(--green);box-shadow:0 0 4px var(--green)}",
".srt-light.red:before{background:var(--red);box-shadow:0 0 4px var(--red)}",
".srt-light.off{color:var(--muted)}",
".srt-light.off:before{background:var(--muted);opacity:.35}",
".srt-meta{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;font-size:12px;color:var(--muted)}",
".srt-ctr{display:inline-flex;align-items:center;gap:6px;margin-right:auto}",
".btn{padding:9px 18px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600;cursor:pointer;transition:.15s;letter-spacing:.3px}",
".btn:hover{background:#1c2530;border-color:var(--accent)}",
".btn.show{border-color:var(--accent);color:var(--accent)}.btn.show:hover{background:#0d1a2a}",
".btn.stop{border-color:var(--red);color:var(--red)}.btn.stop:hover{background:#2a1515}",
".btn.start{border-color:var(--green);color:var(--green)}.btn.start:hover{background:#152a1a}",
".btn.studio-btn{border-color:var(--accent);color:var(--accent)}.btn.studio-btn:hover{background:#0d1a2a}",
".btn.autostart-on{border-color:var(--green);color:var(--green)}.btn.autostart-on:hover{background:#152a1a}",
".btn.autostart-off{border-color:var(--amber);color:var(--amber)}.btn.autostart-off:hover{background:#2a2015}",
".card .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}",
".card .row .status{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}",
".card .row .status.running{color:var(--green)}.card .row .status.stopped{color:var(--red)}.card .row .status.unknown{color:var(--muted)}",
".btn.restart{padding:4px 11px;font-size:12px;border-color:var(--amber);color:var(--amber);border-radius:4px}",
".btn.restart:hover{background:#2a2015}",
".overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:50;align-items:center;justify-content:center}",
".overlay.open{display:flex}",
".modal{background:var(--card);border:1px solid var(--border);border-radius:10px;width:580px;max-height:80vh;overflow-y:auto;padding:0}",
".modal.wide{width:820px;max-width:94vw}",
".modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}",
".modal-header h3{font-size:15px;font-weight:600;text-transform:uppercase}",
".modal .close-btn{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0 6px;line-height:1}",
".modal .close-btn:hover{color:var(--red)}",
".ps-table{width:100%;border-collapse:collapse;font-size:12px}",
".ps-table th{text-align:left;padding:8px 20px;color:var(--muted);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px;border-bottom:1px solid var(--border)}",
".ps-table td{padding:10px 20px;border-bottom:1px solid #1a1f27;font-family:monospace;font-size:12px}",
".ps-table tr:hover td{background:#1a1f27}",
".modal-footer{padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}",
".empty-state{text-align:center;padding:32px 20px;color:var(--muted)}",
".toast{position:fixed;bottom:20px;right:20px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 18px;font-size:13px;z-index:100;animation:fadeIn .2s}",
".toast.ok{border-color:var(--green)}.toast.err{border-color:var(--red)}",
"@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
"</style>",
"</head>",
"<body>",
"<header><h1>Open Live Dashboard</h1><div class=\"meta\"><span id=\"clock\">--</span><span id=\"poll-count\">Poll #0</span><button id=\"dash-autostart-btn\" class=\"btn\" style=\"font-size:11px;padding:4px 10px\" onclick=\"toggleDashAutoStart()\">Dashboard autostart: --</button></div></header>",
"<main id=\"app\"><p style=\"color:var(--muted);text-align:center;padding:40px;\">Loading...</p></main>",
"<div class=\"overlay\" id=\"overlay\" onclick=\"if(event.target===this)closeModal()\"><div class=\"modal\" id=\"modal\"></div></div>",
"<script>",
"var API='/api';var pc=0;var autoStart=false;var lastStatus={};",
"function cls(s){if(!s)return'unknown';if(s==='running'||s==='healthy'||s==='starting')return'running';return'stopped'}",
"function dot(s){return'<span class=\"dot '+cls(s)+'\"></span>'}",
"function fmtUptime(ms){if(ms<=0)return'';var s=Math.floor(ms/1000);var m=Math.floor(s/60);s%=60;var h=Math.floor(m/60);m%=60;if(h>0)return h+'h '+m+'m';if(m>0)return m+'m';return s+'s'}",
"function render(d){",
" lastStatus=d;",
" var h='';",
" for(var mode in d){",
"  var ctr=d[mode];",
"  if(mode==='srt'){h+=renderSrt(ctr);continue;}",
"  var total=Object.keys(ctr).length;",
"  var running=Object.values(ctr).filter(function(c){return c&&c.status==='running'}).length;",
"  var active=running>0;",
"  h+='<div class=\"mode-section\">';",
"  h+='<div class=\"mode-header\"><h2>'+mode.toUpperCase()+' MODE</h2>';",
"  h+='<span class=\"mode-badge '+(active?'active':'inactive')+'\">'+(active?running+'/'+total+' running':'inactive')+'</span></div>';",
"  h+='<div class=\"cards\">';",
"  for(var name in ctr){",
"   var c=ctr[name];",
"   var st=c?c.status:'not created';",
"   var hl=c?c.health:'N/A';",
"   var img=c?c.image:'-';",
"   var ver=c&&c.version?c.version:'-';",
"   var up=c&&c.uptimeMs?fmtUptime(c.uptimeMs):'';",
"   h+='<div class=\"card\"><div class=\"name\">'+name+'</div>';",
"   h+='<div class=\"info\"><span>ver: '+ver+'</span><span>img: '+img+'</span><span>health: '+hl+'</span>'+(up?'<span>up: '+up+'</span>':'')+'</div>';",
"   h+='<div class=\"row\">';",
"   h+='<span class=\"status '+cls(st)+'\">'+dot(st)+' '+st.toUpperCase()+'</span>';",
"   if(st==='running'&&(mode==='local'||mode==='hybrid'))h+='<button class=\"btn restart\" onclick=\"event.stopPropagation();restartOne(\\''+mode+'\\',\\''+name+'\\')\">restart</button>';",
"   h+='</div></div>'",
"  }",
"  h+='</div>';",
"  if(mode==='local'||mode==='hybrid'){",
"  h+='<div class=\"actions\">';",
"  h+='<button class=\"btn start\" onclick=\"startMode(\\''+mode+'\\')\">Start</button>';",
"  h+='<button class=\"btn show\" onclick=\"showContainers(\\''+mode+'\\')\">Show Containers</button>';",
"  if(running>0)h+='<button class=\"btn stop\" onclick=\"stopMode(\\''+mode+'\\')\">Stop All</button>';",
"  if(mode==='hybrid')h+='<button class=\"btn '+(autoStart?'autostart-on':'autostart-off')+'\" onclick=\"toggleAutoStart()\">'+(autoStart?'Hybrid autostart: ON':'Hybrid autostart: OFF')+'</button>';",
"  if(mode==='local'&&ctr.studio&&ctr.studio.status==='running')h+='<button class=\"btn studio-btn\" onclick=\"window.open(\\'http://'+window.location.hostname+':3000\\',\\'_blank\\')\">Open Studio</button>';",
"  if(mode==='local')h+='<button class=\"btn '+(ctr.modular&&ctr.modular.status==='running'?'stop':'start')+'\" onclick=\"toggleModular()\">'+(ctr.modular&&ctr.modular.status==='running'?'Stop modular':'Start modular')+'</button>';",
"  if(mode==='local'&&ctr.modular&&ctr.modular.status==='running')h+='<button class=\"btn studio-btn\" onclick=\"window.open(\\'http://'+window.location.hostname+':3200\\',\\'_blank\\')\">Open modular</button>';",
"  h+='</div></div>';}else{h+='</div>';}",
" }",
" document.getElementById('app').innerHTML=h;",
" document.getElementById('clock').textContent=new Date().toLocaleTimeString();",
" document.getElementById('poll-count').textContent='Poll #'+(++pc)",
"}",
"async function poll(){",
" try{var r=await fetch(API+'/status');var d=await r.json();render(d)}",
" catch(e){document.getElementById('app').innerHTML='<p style=\"color:var(--red);text-align:center;padding:40px;\">Connection lost - retrying...</p>'}",
" setTimeout(poll,5000)",
"}",
"async function checkAutoStart(){",
" try{var r=await fetch(API+'/hybrid/autostart');var d=await r.json();autoStart=d.autoStart}",
" catch(e){autoStart=false}",
"}",
"async function showContainers(mode){",
" var modal=document.getElementById('modal');",
" var overlay=document.getElementById('overlay');",
" modal.innerHTML='<div class=\"modal-header\"><h3>'+mode.toUpperCase()+' MODE</h3><button class=\"close-btn\" onclick=\"closeModal()\">x</button></div><div class=\"empty-state\">Loading...</div>';",
" overlay.classList.add('open');",
" try{",
"  var r=await fetch(API+'/ps/'+mode);",
"  var d=await r.json();",
"  var c='<div class=\"modal-header\"><h3>'+mode.toUpperCase()+' MODE - docker compose ps</h3><button class=\"close-btn\" onclick=\"closeModal()\">x</button></div>';",
"  if(d.ok&&d.containers&&d.containers.length>0){",
"   c+='<table class=\"ps-table\"><thead><tr><th>Container Name</th><th>Image</th><th>Status</th></tr></thead><tbody>';",
"   for(var i=0;i<d.containers.length;i++){var cn=d.containers[i];c+='<tr><td>'+cn.Name+'</td><td>'+cn.Image+'</td><td>'+cn.Status+'</td></tr>'}",
"   c+='</tbody></table>';",
"   c+='<div class=\"modal-footer\"><button class=\"btn\" onclick=\"closeModal()\">Close</button><button class=\"btn stop\" onclick=\"stopMode(\\''+mode+'\\')\">Stop All</button></div>'",
"  }else{",
"   c+='<div class=\"empty-state\">No containers running in '+mode.toUpperCase()+' mode.</div>';",
"   if(d.error)c+='<div class=\"empty-state\" style=\"color:var(--red)\">Error: '+d.error+'</div>';",
"   c+='<div class=\"modal-footer\"><button class=\"btn\" onclick=\"closeModal()\">Close</button></div>'",
"  }",
"  modal.innerHTML=c",
" }catch(e){modal.innerHTML='<div class=\"modal-header\"><h3>Error</h3><button class=\"close-btn\" onclick=\"closeModal()\">x</button></div><div class=\"empty-state\" style=\"color:var(--red)\">Failed to fetch: '+e.message+'</div>'}", 
"}",
"async function stopMode(mode){",
" if(!confirm('Stop and remove ALL containers in '+mode.toUpperCase()+' mode?'))return;",
" toast('Stopping '+mode.toUpperCase()+' containers...',true);",
" try{",
"  var r=await fetch(API+'/stop/'+mode,{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){toast(mode.toUpperCase()+' containers stopped and removed.',true);poll()}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function startMode(mode){",
" toast('Starting '+mode.toUpperCase()+' containers...',true);",
" try{",
"  var r=await fetch(API+'/start/'+mode,{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){toast(mode.toUpperCase()+' containers starting.',true);setTimeout(poll,2000)}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function toggleModular(){\n var ctr=(lastStatus&&lastStatus.local&&lastStatus.local.modular)||{status:'unknown'};\n var running=ctr.status==='running';\n if(running){\n  toast('Stopping modular...',true);\n  try{\n   var r=await fetch(API+'/modular/stop',{method:'POST'});\n   var d=await r.json();\n   if(d.ok){toast('Modular studio stopped.',true);setTimeout(poll,2000)}\n   else{toast('Error: '+(d.error||'unknown'),false)}\n  }catch(e){toast('Request failed: '+e.message,false)}\n } else {\n  toast('Starting modular...',true);\n  try{\n   var r=await fetch(API+'/modular/start',{method:'POST'});\n   var d=await r.json();\n   if(d.ok){toast('Modular studio starting...',true);setTimeout(poll,3000)}\n   else{toast('Error: '+(d.error||'unknown'),false)}\n  }catch(e){toast('Request failed: '+e.message,false)}\n }\n}",
"async function restartOne(mode,name){",
" toast('Restarting '+name+'...',true);",
" try{",
"  var r=await fetch(API+'/restart/'+mode+'/'+name,{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){toast(name+' restarted.',true);setTimeout(poll,2000)}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function toggleAutoStart(){",
" toast('Toggling boot start...',true);",
" try{",
"  var r=await fetch(API+'/hybrid/autostart',{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){autoStart=d.autoStart;toast('Boot start '+(d.autoStart?'enabled':'disabled'),true);poll()}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function toggleDashAutoStart(){",
" try{",
"  var r=await fetch(API+'/dashboard/autostart',{method:'POST'});",
"  var d=await r.json();",
"  updateDashAutoBtn(d.autoStart)",
" }catch(e){console.error(e)}",
"}",
"function updateDashAutoBtn(on){",
" var btn=document.getElementById('dash-autostart-btn');",
" if(!btn)return;",
" btn.textContent='Dashboard autostart: '+(on?'ON':'OFF');",
" btn.className='btn '+(on?'autostart-on':'autostart-off');",
" btn.style.cssText='font-size:11px;padding:4px 10px'",
"}",
"async function checkDashAutoStart(){",
" try{var r=await fetch(API+'/dashboard/autostart');var d=await r.json();updateDashAutoBtn(d.autoStart)}",
" catch(e){console.error(e)}",
"}",
"function closeModal(){document.getElementById('overlay').classList.remove('open');var m=document.getElementById('modal');m.classList.remove('wide')}",
"var srtCfg=null;",
"function renderSrt(srt){",
" var active=0,running=0;",
" for(var i=0;i<srt.channels.length;i++){",
"  var ch=srt.channels[i];",
"  if(ch.role!=='off')active++;",
"  if(ch.running)running++;",
" }",
" var h='<div class=\"mode-section\">';",
" h+='<div class=\"mode-header\"><h2>SRT GATEWAY</h2>';",
" h+='<span class=\"mode-badge '+(active>0?'active':'inactive')+'\">'+(active>0?running+'/'+active+' streams':'inactive')+'</span></div>';",
" h+='<div class=\"srt-lights\">';",
" for(var i=0;i<srt.channels.length;i++){",
"  var ch=srt.channels[i];",
"  var tip=ch.sdi+(ch.role!=='off'?' &middot; '+ch.role+' &middot; '+(ch.address||'no addr'):' &middot; off');",
"  h+='<span class=\"srt-light '+ch.color+'\" title=\"'+tip+'\">'+ch.sdi+'</span>';",
" }",
" h+='</div>';",
" h+='<div class=\"srt-meta\">';",
" h+='<span class=\"srt-ctr\">Strom EFP-SRT: '+(active>0?(running+'/'+active+' running'):'no streams configured')+'</span>';",
" h+='<button class=\"btn show\" onclick=\"openSrtSettings()\">&#9881; Settings</button>';",
" if(running>0){",
"  h+='<button class=\"btn start\" onclick=\"srtStart()\">Restart</button>';",
"  h+='<button class=\"btn stop\" onclick=\"srtStop()\">Stop</button>';",
" }else{",
"  h+='<button class=\"btn start\" onclick=\"srtStart()\">Start</button>';",
" }",
" h+='</div></div>';",
" return h;",
"}",
"async function openSrtSettings(){",
" try{",
"  var r=await fetch(API+'/srt/config');",
"  srtCfg=await r.json();",
" }catch(e){toast('Failed to load SRT config: '+e.message,false);return}",
" if(!srtCfg.ports){toast('Invalid SRT config',false);return}",
" var modal=document.getElementById('modal');",
" var overlay=document.getElementById('overlay');",
" var h='<div class=\"modal-header\"><h3>SRT GATEWAY SETTINGS</h3><button class=\"close-btn\" onclick=\"closeModal()\">x</button></div>';",
" h+='<div style=\"padding:16px 20px\">';",
" if(!srtCfg.stream)srtCfg.stream={codec:'h264',bitrate:6};",
" h+='<h3 style=\"margin:0 0 6px\">Stream Settings (all channels)</h3>';",
" h+='<table class=\"ps-table\"><thead><tr><th>Codec</th><th>Bitrate (Mbps)</th></tr></thead><tbody><tr>';",
" h+='<td><select id=\"st_codec\"><option value=\"h264\"'+(srtCfg.stream.codec==='h264'?' selected':'')+'>h264</option><option value=\"h265\"'+(srtCfg.stream.codec==='h265'?' selected':'')+'>h265</option></select></td>';",
" h+='<td><select id=\"st_bitrate\">';",
" var brs=[4,6,8,12,25];",
" for(var b=0;b<brs.length;b++){h+='<option value=\"'+brs[b]+'\"'+(Number(srtCfg.stream.bitrate)===brs[b]?' selected':'')+'>'+brs[b]+'</option>'}",
" h+='</select></td>';",
" h+='</tr></tbody></table>';",
" h+='<h3 style=\"margin:16px 0 6px\">SDI Ports</h3>';",
" h+='<table class=\"ps-table\"><thead><tr><th>SDI Port</th><th>Device #</th><th>Role</th><th>SRT Address</th></tr></thead><tbody>';",
" for(var i=0;i<srtCfg.ports.length;i++){",
"  var p=srtCfg.ports[i];",
"  h+='<tr><td><input id=\"sdi_'+i+'\" value=\"'+p.id+'\" style=\"width:80px;background:var(--card);color:var(--text);border:1px solid var(--border);padding:4px\"></td>';",
"  h+='<td><input id=\"dev_'+i+'\" type=\"number\" min=\"0\" max=\"11\" value=\"'+(p.device!=null?p.device:i)+'\" style=\"width:60px;background:var(--card);color:var(--text);border:1px solid var(--border);padding:4px\"></td>';",
"  h+='<td><select id=\"role_'+i+'\" style=\"background:var(--card);color:var(--text);border:1px solid var(--border);padding:4px\">';",
"  var ro=['off','sender','receiver'];",
"  for(var j=0;j<ro.length;j++){h+='<option value=\"'+ro[j]+'\"'+(p.role===ro[j]?' selected':'')+'>'+ro[j]+'</option>'}",
"  h+='</select></td>';",
"  h+='<td><input id=\"addr_'+i+'\" value=\"'+p.address+'\" placeholder=\"srt://host:port?streamid=...\" style=\"width:100%;background:var(--card);color:var(--text);border:1px solid var(--border);padding:4px\"></td>';",
"  h+='</tr>';",
" }",
" h+='</tbody></table>';",
" h+='<p style=\"color:var(--muted);font-size:11px;margin-top:10px\">EFP-SRT blocks are always callers. Addresses are stored only in the local gitignored config. Saving restarts the streams.</p>';",
" h+='</div>';",
" h+='<div class=\"modal-footer\"><button class=\"btn\" onclick=\"closeModal()\">Cancel</button><button class=\"btn start\" onclick=\"saveSrtSettings()\">Save</button></div>';",
" modal.innerHTML=h;",
" modal.classList.add('wide');",
" overlay.classList.add('open');",
"}",
"async function saveSrtSettings(){",
" srtCfg.stream.codec=document.getElementById('st_codec').value;",
" srtCfg.stream.bitrate=Number(document.getElementById('st_bitrate').value);",
" for(var i=0;i<srtCfg.ports.length;i++){",
"  srtCfg.ports[i].id=document.getElementById('sdi_'+i).value;",
"  srtCfg.ports[i].device=Number(document.getElementById('dev_'+i).value);",
"  srtCfg.ports[i].role=document.getElementById('role_'+i).value;",
"  srtCfg.ports[i].address=document.getElementById('addr_'+i).value;",
" }",
" try{",
"  var r=await fetch(API+'/srt/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(srtCfg)});",
"  var d=await r.json();",
"  if(d.ok){toast('SRT settings saved',true);closeModal();srtApplyRestart()}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function srtStart(){",
" toast('Starting SRT streams on Strom...',true);",
" try{",
"  var r=await fetch(API+'/srt/start',{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok||d.created>0){toast('Started '+d.created+' streams',true);setTimeout(poll,3000)}",
"  else{toast('Error: '+(d.error||(d.failed>0?d.failed+' failed':'unknown')),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function srtApplyRestart(){",
" try{var r=await fetch(API+'/srt/start',{method:'POST'});var d=await r.json();toast('Restarted '+d.created+' streams',true);setTimeout(poll,3000)}catch(e){toast('Request failed: '+e.message,false)}",
"}",
"async function srtStop(){",
" toast('Stopping SRT streams...',true);",
" try{",
"  var r=await fetch(API+'/srt/stop',{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){toast('Stopped '+d.removed+' streams',true);setTimeout(poll,2000)}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"function toast(msg,ok){",
" var el=document.createElement('div');",
" el.className='toast '+(ok?'ok':'err');",
" el.textContent=msg;",
" document.body.appendChild(el);",
" setTimeout(function(){el.remove()},4000)",
"}",
"checkDashAutoStart();checkAutoStart();poll();",
"</script>",
"</body>",
"</html>"
].join("\n");
