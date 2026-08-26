#!/bin/sh
# SRT Gateway — launches one ffmpeg process per configured channel and keeps
# the container alive. Config is re-read every cycle, so channels can be added
# or their address changed without restarting the container.
# Reads:
#   /config/srt-stream.conf   — global stream settings (codec/container/bitrate/audio)
#   /config/srt-channels.conf — SDI_PORT<TAB>ROLE<TAB>DECKLINK_DEVICE<TAB>SRT_ADDRESS
# Writes:
#   /config/srt-streams.pids   — id\tpid\taddress  (liveness for the dashboard)
#   /config/srt-streams.status — id\tbitrate_kbps  (measured encode bitrate)
#   /config/logs/<id>.log      — per-stream ffmpeg log
set -u

CONF="/config/srt-channels.conf"
STREAM_CONF="/config/srt-stream.conf"
PIDFILE="/config/srt-streams.pids"
STATUSFILE="/config/srt-streams.status"
LOGDIR="/config/logs"
LOGFILE="/config/srt-sender.log"
CHECK_SECS=10

log() { echo "$(date -Is) $*" >>"$LOGFILE"; }
mkdir -p "$LOGDIR"

# ── global stream settings (defaults, overridden by srt-stream.conf) ──
codec="h264"; container="efp"; bitrate="6"; audio="aac"
if [ -f "$STREAM_CONF" ]; then
  . "$STREAM_CONF"
fi

# Kill any previously launched processes
if [ -f "$PIDFILE" ]; then
  IFS="$(printf '\t')"
  while read -r _ pid _; do
    [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null
  done <"$PIDFILE"
fi
: >"$PIDFILE"
: >"$STATUSFILE"

# clean up child processes on exit
trap 'IFS="$(printf '\''\t'\'')"; while read -r _ pid _; do [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null; done <"$PIDFILE" 2>/dev/null; exit 0' INT TERM

launch() {
  id="$1"; role="$2"; dev="$3"; addr="$4"
  slog="$LOGDIR/$id.log"
  IFS="$(printf ' \t\n')"
  case "$role" in
    sender)
      case "$codec" in
        h265) enc="-c:v libx265 -preset ultrafast -tune zerolatency";;
        av1)  enc="-c:v libsvtav1 -preset 8";;
        *)    enc="-c:v libx264 -preset ultrafast -tune zerolatency";;
      esac
      if [ "$audio" = "pcm" ]; then aenc="-c:a pcm_s16le"; else aenc="-c:a aac -b:a 128k"; fi
      gop=""
      if [ "$container" = "efp" ]; then gop="-g 50 -sc_threshold 0"; fi
      case "$addr" in *\?*) sep="&" ;; *) sep="?" ;; esac
      fulladdr="${addr}${sep}latency=200000&rcvbuf=12058624"
      ffmpeg -hide_banner -loglevel warning -stats -stats_period 2 \
        -f decklink -i "$dev" \
        $enc -b:v "${bitrate}M" $gop -pix_fmt yuv420p \
        $aenc \
        -f mpegts "$fulladdr" >>"$slog" 2>&1 &
      ;;
    receiver)
      ffmpeg -hide_banner -loglevel warning \
        -i "$addr" \
        -f decklink -pix_fmt uyvy422 "$dev" >>"$slog" 2>&1 &
      ;;
    *) return ;;
  esac
  pid=$!
  sed -i "/^$id[[:space:]]/d" "$PIDFILE" 2>/dev/null
  printf '%s\t%s\t%s\n' "$id" "$pid" "$addr" >>"$PIDFILE"
  IFS="$(printf '\t')"
  log "started $id ($role, $dev -> $addr) pid=$pid"
}

channel_entry() {
  IFS="$(printf '\t')"
  while read -r id pid addr; do
    if [ "$id" = "$1" ]; then printf '%s\t%s\t%s' "$pid" "$addr" "$id"; return; fi
  done <"$PIDFILE"
}

# latest bitrate (kbps) from a stream's ffmpeg log
bitrate_kbps() {
  slog="$LOGDIR/$1.log"
  [ -f "$slog" ] || return
  line=$(tail -200 "$slog" 2>/dev/null | grep -oE "bitrate=[ ]*[0-9.]+[kM]bits/s" | tail -1)
  [ -n "$line" ] || return
  val=$(printf '%s' "$line" | sed -E 's/.*bitrate=[ ]*([0-9.]+)([kM])bits.*/\1 \2/')
  num=${val% *}; unit=${val##* }
  case "$unit" in
    M) awk -v n="$num" 'BEGIN{printf "%.0f", n*1000}' ;;
    *) printf '%s' "$num" | awk '{printf "%.0f", $1}' ;;
  esac
}

log "SRT gateway starting (codec=$codec container=$container bitrate=${bitrate}M audio=$audio)"

# Keep the container alive; launch new channels, restart dead ones, relaunch on
# address change, and publish measured bitrate for the dashboard traffic lights.
while true; do
  : >"$STATUSFILE"
  if [ -f "$CONF" ]; then
    IFS="$(printf '\t')"
    while read -r id role dev addr; do
      [ -z "${id:-}" ] && continue
      [ "$role" = "off" ] && continue
      [ -z "${dev:-}" ] && continue
      [ -z "${addr:-}" ] && continue
      entry="$(channel_entry "$id")"
      if [ -z "$entry" ]; then
        launch "$id" "$role" "$dev" "$addr"
      else
        pid="${entry%%	*}"
        rest="${entry#*	}"
        oldaddr="${rest%%	*}"
        if ! kill -0 "$pid" 2>/dev/null; then
          log "restarting $id (pid $pid died)"
          launch "$id" "$role" "$dev" "$addr"
        elif [ "$oldaddr" != "$addr" ]; then
          log "restarting $id (address changed)"
          kill "$pid" 2>/dev/null
          launch "$id" "$role" "$dev" "$addr"
        fi
      fi
      rate="$(bitrate_kbps "$id")"
      if [ -n "$rate" ]; then
        printf '%s\t%s\n' "$id" "$rate" >>"$STATUSFILE"
      fi
    done <"$CONF"
  else
    log "no $CONF — nothing to do"
  fi
  sleep "$CHECK_SECS"
done
