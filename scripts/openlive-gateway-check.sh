#!/usr/bin/env bash
# Open Live gateway watchdog — self-heals the VPS -> tailnet -> Strom/CouchDB chain.
# Install on the VPS (the Headscale gateway). Run from a systemd timer.
# Checks: services up, tailscale node up, tailnet reachability, NAT rules, ip_forward.
# Logs status transitions to /var/log/openlive-gateway.log; writes current state to /var/run/openlive-gateway.status.
set -u

STROM_IP="${STROM_IP:-100.64.0.1}"
LOG="/var/log/openlive-gateway.log"
STATUS_FILE="/var/run/openlive-gateway.status"
AUTHKEY_FILE="/etc/openlive-tailscale-authkey"
CONTROL_URL="https://mvpsheadscale.duckdns.org"

log() { echo "$(date -Is) $*" >>"$LOG"; }
set_status() { printf '%s %s\n' "$(date -Is)" "$1" >"$STATUS_FILE"; }

reason=""
changed=0

# --- 1. services -----------------------------------------------------------
for svc in headscale tailscaled; do
  if ! systemctl is-active --quiet "$svc" 2>/dev/null; then
    log "WARN $svc was down; starting"
    systemctl start "$svc"
    sleep 3
  fi
done

# --- 2. tailscale node up --------------------------------------------------
if ! tailscale ip -4 >/dev/null 2>&1; then
  if [ -f "$AUTHKEY_FILE" ]; then
    log "WARN tailscale node down; re-authing"
    tailscale up --login-server="$CONTROL_URL" --hostname=vps-debian12 \
      --authkey="$(cat "$AUTHKEY_FILE")" >/dev/null 2>&1 || log "ERR tailscale up failed"
    sleep 5
  else
    reason="$reason no-authkey "
  fi
fi

# --- 3. tailnet reachability to the Strom machine --------------------------
for hp in 8080/health 5984/; do
  port="${hp%/*}"
  path="/${hp#*/}"
  code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "http://${STROM_IP}:${port}${path}" 2>/dev/null)
  if [ "$code" != "200" ]; then
    reason="$reason strom:$port=$code "
  fi
done

# --- 4. NAT rules ----------------------------------------------------------
if ! iptables -t nat -C PREROUTING -p tcp --dport 8080 -j DNAT --to-destination "$STROM_IP:8080" -m comment --comment "openlive-strom-api" 2>/dev/null; then
  iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to-destination "$STROM_IP:8080" -m comment --comment "openlive-strom-api"
  log "FIX re-added DNAT 8080"
  changed=1
fi
if ! iptables -t nat -C PREROUTING -p tcp --dport 5984 -j DNAT --to-destination "$STROM_IP:5984" -m comment --comment "openlive-couchdb" 2>/dev/null; then
  iptables -t nat -A PREROUTING -p tcp --dport 5984 -j DNAT --to-destination "$STROM_IP:5984" -m comment --comment "openlive-couchdb"
  log "FIX re-added DNAT 5984"
  changed=1
fi
if ! iptables -t nat -C PREROUTING -p udp --dport 5000 -j DNAT --to-destination "$STROM_IP:5000" -m comment --comment "openlive-strom-whep" 2>/dev/null; then
  iptables -t nat -A PREROUTING -p udp --dport 5000 -j DNAT --to-destination "$STROM_IP:5000" -m comment --comment "openlive-strom-whep"
  log "FIX re-added DNAT 5000/udp"
  changed=1
fi
if ! iptables -t nat -C POSTROUTING -d "$STROM_IP" -j MASQUERADE -m comment --comment "openlive-masq" 2>/dev/null; then
  iptables -t nat -A POSTROUTING -d "$STROM_IP" -j MASQUERADE -m comment --comment "openlive-masq"
  log "FIX re-added MASQUERADE"
  changed=1
fi

# --- 5. ip_forward ---------------------------------------------------------
if [ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" != "1" ]; then
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1
  log "FIX re-enabled ip_forward"
  changed=1
fi

# --- 6. persist rules if changed ------------------------------------------
if [ "$changed" -eq 1 ]; then
  netfilter-persistent save >/dev/null 2>&1 || true
fi

# --- 7. status -------------------------------------------------------------
if [ -z "$reason" ]; then
  if [ ! -f "$STATUS_FILE" ] || ! grep -q '^OK' "$STATUS_FILE" 2>/dev/null; then
    log "OK gateway healthy (strom+couch via $STROM_IP)"
  fi
  set_status "OK"
else
  set_status "FAIL $reason"
  log "FAIL $reason"
fi

exit 0
