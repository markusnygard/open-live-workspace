#!/usr/bin/env bash
# setup-vps.sh — Headscale VPS gateway for Open Live hybrid rig
# Run this ON the VPS (not the Strom machine)
# Each step prompts for confirmation before applying changes.

set -euo pipefail

echo "============================================"
echo " Open Live Hybrid Rig — VPS Gateway Setup"
echo "============================================"
echo ""
echo "This script sets up your Headscale VPS to forward"
echo "traffic from the public internet into your mesh"
echo "so OSC's cloud services can reach your on-prem Strom."
echo ""
echo "You will need:"
echo "  1. Strom's mesh IP (run 'tailscale status' on the Strom machine)"
echo "  2. Your Strom API key (from .env: STROM_API_KEY)"
echo "  3. sudo access on this VPS"
echo ""

# ──────────────────────────────────────────
# Step 1: Find Strom's mesh IP
# ──────────────────────────────────────────

echo "STEP 1 — Strom mesh IP"
echo "───────────────────────"
echo ""
echo "On your Strom machine, run:  tailscale status"
echo ""
echo "You'll see output like:"
echo "  strom-machine  username  linux  100.64.x.y  active"
echo ""
echo "The '100.64.x.y' is Strom's address inside your mesh."
echo "If you have CouchDB on a separate machine with Tailscale,"
echo "you can forward that too. Otherwise it's the same IP."
echo ""
read -p "Enter Strom's mesh IP: " STROM_IP
echo ""
echo "Strom mesh IP: $STROM_IP"
read -p "Press Enter to continue..."

# ──────────────────────────────────────────
# Step 2: Enable IP forwarding
# ──────────────────────────────────────────

echo ""
echo "STEP 2 — Enable IP forwarding"
echo "───────────────────────────────"
echo ""
echo "This lets the VPS pass traffic from the public internet"
echo "into the Headscale mesh network."
echo ""
echo "It writes a small kernel config file and activates it."
echo "This is safe and only affects this one setting."
echo ""
read -p "Apply IP forwarding? [Y/n] " yn
if [[ "$yn" != "n" && "$yn" != "N" ]]; then
  echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-openlive-forward.conf > /dev/null
  sudo sysctl -p /etc/sysctl.d/99-openlive-forward.conf
  echo "IP forwarding enabled."
else
  echo "Skipped."
fi
read -p "Press Enter to continue..."

# ──────────────────────────────────────────
# Step 3: Add iptables port forwarding rules
# ──────────────────────────────────────────

echo ""
echo "STEP 3 — Forward ports into the mesh"
echo "─────────────────────────────────────"
echo ""
echo "We'll create rules to forward three ports on the VPS"
echo "to the same ports on Strom inside your mesh:"
echo ""
echo "  Public :8080  →  Strom's mesh IP :8080   (REST API)"
echo "  Public :5000  →  Strom's mesh IP :5000   (WHEP/WebRTC, UDP)"
echo "  Public :5984  →  Strom's mesh IP :5984   (CouchDB)"
echo ""
echo "This means OSC can reach Strom at:"
echo "  http://<your-vps-public-ip>:8080"
echo ""
read -p "Apply port forwarding rules? [Y/n] " yn
if [[ "$yn" != "n" && "$yn" != "N" ]]; then
  sudo iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to-destination "${STROM_IP}:8080" -m comment --comment "openlive-strom-api"
  sudo iptables -t nat -A PREROUTING -p udp --dport 5000 -j DNAT --to-destination "${STROM_IP}:5000" -m comment --comment "openlive-strom-whep"
  sudo iptables -t nat -A PREROUTING -p tcp --dport 5984 -j DNAT --to-destination "${STROM_IP}:5984" -m comment --comment "openlive-couchdb"

  # Tell iptables to actually rewrite reply traffic so Strom's responses
  # go back through the VPS instead of directly (which would fail since
  # the client doesn't know the mesh IP).
  sudo iptables -t nat -A POSTROUTING -d "${STROM_IP}" -j MASQUERADE -m comment --comment "openlive-masq"

  echo "Port forwarding rules added."
else
  echo "Skipped."
fi
read -p "Press Enter to continue..."

# ──────────────────────────────────────────
# Step 4: Make iptables rules survive reboot
# ──────────────────────────────────────────

echo ""
echo "STEP 4 — Save iptables rules"
echo "─────────────────────────────"
echo ""
echo "iptables rules are stored in memory and lost on reboot."
echo "We'll install iptables-persistent to save them to disk."
echo ""
echo "During install, iptables-persistent will ask whether to"
echo "save the current rules — answer YES for both IPv4 and IPv6."
echo ""
read -p "Install iptables-persistent and save rules? [Y/n] " yn
if [[ "$yn" != "n" && "$yn" != "N" ]]; then
  sudo apt update -qq
  sudo apt install -y iptables-persistent netfilter-persistent
  sudo netfilter-persistent save
  echo "Rules saved. They will reload automatically on reboot."
else
  echo "Skipped."
fi
read -p "Press Enter to continue..."

# ──────────────────────────────────────────
# Step 5: Headscale ACL (if applicable)
# ──────────────────────────────────────────

echo ""
echo "STEP 5 — Headscale ACLs"
echo "────────────────────────"
echo ""
echo "If your Headscale has ACLs enabled, make sure the Strom"
echo "machine can send and receive traffic freely."
echo ""
echo "Add this to your headscale config.yaml (acls section):"
echo ""
echo "  {"
echo "    \"action\": \"accept\","
echo "    \"src\": [\"*\"],"
echo "    \"dst\": [\"<strom-machine-name>:*\"]"
echo "  }"
echo ""
echo "Replace <strom-machine-name> with the name shown in"
echo "'tailscale status' on the VPS (not the IP, the name)."
echo ""
echo "If ACLs are not enabled, you can skip this step."
echo ""
read -p "Press Enter to continue..."

# ──────────────────────────────────────────
# Step 6: Test the connection
# ──────────────────────────────────────────

echo ""
echo "STEP 6 — Test the connection"
echo "─────────────────────────────"
echo ""
echo "Let's verify the VPS can reach Strom through the mesh."
echo "We'll try two endpoints: the health check and the API."
echo ""
read -p "Run connectivity test? [Y/n] " yn
if [[ "$yn" != "n" && "$yn" != "N" ]]; then
  echo ""
  echo "Testing Strom health endpoint..."
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://${STROM_IP}:8080/health" 2>&1 || echo "FAIL")
  if [[ "$HEALTH" == "200" ]]; then
    echo "  Health check PASSED (200 OK)"
  else
    echo "  Health check FAILED (got: $HEALTH)"
    echo "  Check that Strom is running and Tailscale is connected."
  fi

  echo ""
  echo "Testing CouchDB..."
  DBTEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://${STROM_IP}:5984/" 2>&1 || echo "FAIL")
  if [[ "$DBTEST" == "200" ]]; then
    echo "  CouchDB check PASSED (200 OK)"
  else
    echo "  CouchDB check FAILED (got: $DBTEST)"
    echo "  Check that CouchDB is running and port 5984 is exposed."
  fi

  echo ""
  echo "Testing port forwarding (from VPS public IP)..."
  VPS_PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
  echo "  VPS public IP: $VPS_PUBLIC_IP"
  if [[ "$VPS_PUBLIC_IP" != "unknown" ]]; then
    FORWARD_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://${VPS_PUBLIC_IP}:8080/health" 2>&1 || echo "FAIL")
    if [[ "$FORWARD_TEST" == "200" ]]; then
      echo "  Port forward PASSED — Strom reachable from internet"
    else
      echo "  Port forward FAILED (got: $FORWARD_TEST)"
      echo "  Check iptables rules with: sudo iptables -t nat -L PREROUTING -n"
    fi
  fi
else
  echo "Skipped."
fi

# ──────────────────────────────────────────
# Step 7: OSC configuration
# ──────────────────────────────────────────

VPS_PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "<your-vps-public-ip>")

echo ""
echo "STEP 7 — OSC Configuration"
echo "───────────────────────────"
echo ""
echo "That's it for the VPS. Now configure OSC."
echo ""
echo "1. Go to https://app.osaas.io/dashboard"
echo "2. Create an Open Live instance with:"
echo ""
echo "   StromUrl = http://${VPS_PUBLIC_IP}:8080"
echo ""
echo "   Get your StromAccessToken from the Strom machine:"
echo "     cat /path/to/.env | grep STROM_API_KEY"
echo ""
echo "   DatabaseUrl = https://admin:<password>@${VPS_PUBLIC_IP}:5984/open-live"
echo ""
echo "3. Create an Open Live Studio instance with:"
echo ""
echo "   OpenLiveUrl = <the URL from step 2>"
echo ""
echo "============================================"
echo " Setup complete!"
echo "============================================"
echo ""
echo "If you ever need to see the current rules:"
echo "  sudo iptables -t nat -L PREROUTING -n --line-numbers"
echo ""
echo "To remove a rule (e.g., rule #3):"
echo "  sudo iptables -t nat -D PREROUTING 3"
echo ""
echo "Then save the changes:"
echo "  sudo netfilter-persistent save"
