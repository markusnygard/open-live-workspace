import { createServer, get as httpGet } from "node:http";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
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
};

function sh(cmd, opts) {
  return execSync(cmd, { timeout: opts?.timeout || 5000, encoding: "utf8", stdio: ["pipe","pipe","ignore"], ...opts }).trim();
}

function dockerPs(name) {
  try {
    const out = sh("docker inspect \"" + name + "\" --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Config.Image}}'", { timeout: 5000 });
    if (!out) return null;
    const parts = out.split("|");
    return { status: parts[0], health: parts[1] || "none", image: parts[2] || "" };
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
  return result;
}

function runCompose(mode, action) {
  const dir = join(ROOT, "open_live_" + mode);
  const file = join(dir, "docker-compose.yml");
  let args;
  if (action === "down") args = "down --volumes";
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
      const containers = JSON.parse(result.output || "[]");
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
    sendJson(res, result.ok ? 200 : 500, result);
    return;
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
"header h1{font-size:20px;font-weight:600}",
"header .meta{font-size:12px;color:var(--muted);display:flex;gap:12px}",
".dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}",
".dot.on{background:var(--green)}.dot.off{background:var(--red)}.dot.warn{background:var(--amber)}.dot.unknown{background:var(--muted)}",
"main{max-width:900px;margin:24px auto;padding:0 24px}",
".mode-section{margin-bottom:28px}",
".mode-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}",
".mode-header h2{font-size:16px;font-weight:600;text-transform:uppercase}",
".mode-badge{font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600}",
".mode-badge.active{background:#1a3524;color:var(--green)}",
".mode-badge.inactive{background:#252525;color:var(--muted)}",
".cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}",
".card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px}",
".card .name{font-weight:600;font-size:13px;margin-bottom:6px}",
".card .info{font-size:11px;color:var(--muted);display:flex;flex-direction:column;gap:2px}",
".card .status{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;font-weight:600}",
".card .status.running{color:var(--green)}.card .status.stopped{color:var(--red)}.card .status.unknown{color:var(--muted)}",
".actions{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}",
".btn{padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:12px;font-weight:600;cursor:pointer;transition:.15s;letter-spacing:.3px}",
".btn:hover{background:#1c2530;border-color:var(--accent)}",
".btn.show{border-color:var(--accent);color:var(--accent)}.btn.show:hover{background:#0d1a2a}",
".btn.stop{border-color:var(--red);color:var(--red)}.btn.stop:hover{background:#2a1515}",
".btn.start{border-color:var(--green);color:var(--green)}.btn.start:hover{background:#152a1a}",
".btn.studio-btn{border-color:var(--accent);color:var(--accent)}.btn.studio-btn:hover{background:#0d1a2a}",
".card .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}",
".card .row .status{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}",
".card .row .status.running{color:var(--green)}.card .row .status.stopped{color:var(--red)}.card .row .status.unknown{color:var(--muted)}",
".btn.restart{padding:3px 10px;font-size:11px;border-color:var(--amber);color:var(--amber);border-radius:4px}",
".btn.restart:hover{background:#2a2015}",
".overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:50;align-items:center;justify-content:center}",
".overlay.open{display:flex}",
".modal{background:var(--card);border:1px solid var(--border);border-radius:10px;width:580px;max-height:80vh;overflow-y:auto;padding:0}",
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
"<header><h1>Open Live Dashboard</h1><div class=\"meta\"><span id=\"clock\">--</span><span id=\"poll-count\">Poll #0</span></div></header>",
"<main id=\"app\"><p style=\"color:var(--muted);text-align:center;padding:40px;\">Loading...</p></main>",
"<div class=\"overlay\" id=\"overlay\" onclick=\"if(event.target===this)closeModal()\"><div class=\"modal\" id=\"modal\"></div></div>",
"<script>",
"var API='/api';var pc=0;",
"function cls(s){if(!s)return'unknown';if(s==='running'||s==='healthy'||s==='starting')return'running';return'stopped'}",
"function dot(s){return'<span class=\"dot '+cls(s)+'\"></span>'}",
"function render(d){",
" var h='';",
" for(var mode in d){",
"  var ctr=d[mode];",
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
"   h+='<div class=\"card\"><div class=\"name\">'+name+'</div>';",
"   h+='<div class=\"info\"><span>ver: '+ver+'</span><span>img: '+img+'</span><span>health: '+hl+'</span></div>';",
"   h+='<div class=\"row\">';",
"   h+='<span class=\"status '+cls(st)+'\">'+dot(st)+' '+st.toUpperCase()+'</span>';",
"   if(st==='running')h+='<button class=\"btn restart\" onclick=\"event.stopPropagation();restartOne(\\''+mode+'\\',\\''+name+'\\')\">restart</button>';",
"   h+='</div></div>'",
"  }",
"  h+='</div>';",
"  h+='<div class=\"actions\">';",
"  h+='<button class=\"btn start\" onclick=\"startMode(\\''+mode+'\\')\">Start</button>';",
"  h+='<button class=\"btn show\" onclick=\"showContainers(\\''+mode+'\\')\">Show Containers</button>';",
"  h+='<button class=\"btn stop\" onclick=\"stopMode(\\''+mode+'\\')\">Stop All</button>';",
"  if(mode==='local'&&ctr.studio&&ctr.studio.status==='running')h+='<button class=\"btn studio-btn\" onclick=\"window.open(\\'http://'+window.location.hostname+':3000\\',\\'_blank\\')\">Open Studio</button>';",
"  h+='</div></div>'",
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
"async function restartOne(mode,name){",
" toast('Restarting '+name+'...',true);",
" try{",
"  var r=await fetch(API+'/restart/'+mode+'/'+name,{method:'POST'});",
"  var d=await r.json();",
"  if(d.ok){toast(name+' restarted.',true);setTimeout(poll,2000)}",
"  else{toast('Error: '+(d.error||'unknown'),false)}",
" }catch(e){toast('Request failed: '+e.message,false)}",
"}",
"function closeModal(){document.getElementById('overlay').classList.remove('open')}",
"function toast(msg,ok){",
" var el=document.createElement('div');",
" el.className='toast '+(ok?'ok':'err');",
" el.textContent=msg;",
" document.body.appendChild(el);",
" setTimeout(function(){el.remove()},4000)",
"}",
"poll();",
"</script>",
"</body>",
"</html>"
].join("\n");
