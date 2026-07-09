#!/usr/bin/env python3
"""Check SRT output client connections and report health to backend API."""
import json, subprocess, urllib.request, sys

API = "http://192.168.1.11:8000"
STROM = "open-live-local-strom"

try:
    # List all outputs
    req = urllib.request.Request(f"{API}/api/v1/outputs")
    with urllib.request.urlopen(req, timeout=5) as resp:
        outputs = json.load(resp)
except Exception:
    sys.exit(0)

try:
    # Read UDP sockets from Strom container
    udp = subprocess.run(
        ["docker", "exec", STROM, "cat", "/proc/net/udp"],
        capture_output=True, text=True, timeout=5
    ).stdout
except Exception:
    sys.exit(0)

# Find SRT ports and check connections
for o in outputs:
    t = o.get("outputType", "")
    if t not in ("mpegtssrt", "efpsrt"):
        continue
    url = o.get("url", "") or ""
    # Parse port from srt://:PORT?mode=listener or srt://host:PORT
    port = None
    if "mode=listener" in url:
        try:
            port = url.split("://")[1].split(":")[1].split("?")[0]
        except:
            continue
    if not port:
        continue

    port_hex = format(int(port), "04X")
    connected = False
    for line in udp.strip().split("\n"):
        parts = line.split()
        if len(parts) < 3:
            continue
        local = parts[1]
        remote = parts[2]
        if local.endswith(f":{port_hex}"):
            connected = remote != "00000000:0000"
            break

    try:
        body = json.dumps({"connected": connected}).encode()
        req = urllib.request.Request(
            f"{API}/api/v1/outputs/{o['id']}/srt-check",
            data=body, method="POST",
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
    except:
        pass
