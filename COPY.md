# Other Software — Media Player Architecture Reference

> Source material from other software's media player, sufficient to rebuild
> equivalent functionality in Open Live Studio using Strom's `builtin.media_player`.

## 1. Architecture Overview

The media player is built from three separate iframes on a single page,
each communicating with a shared backend via message passing:

```
┌─────────────────────────────────────────────────────────┐
│  Parent Window                                          │
│                                                         │
│  ┌─────────────────────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Media Editor C         │ │ PlayerA  │ │ PlayerB  │ │
│  │  (WHEP video preview)   │ │ 325×240  │ │ 325×240  │ │
│  │                         │ │ Vue.js   │ │ Vue.js   │ │
│  │  WHEPClient (vanilla)   │ │ controls │ │ controls │ │
│  └─────────────────────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1.1 A/B Dual Player Pattern

Two identical, independent players. Typical broadcast workflow:

1. **PlayerA** plays clip on air (PGM), **PlayerB** is cued and ready
2. Operator queues next clip in PlayerB, sets marks, previews
3. CUT/MIX to PlayerB — now PlayerB is PGM, PlayerA is free for next cue
4. Each player has its own **independent** queue, rate, loop settings, audio state
5. Players do **not** share state — they are fully separate instances

**Why two players instead of one?** In broadcast, you never want dead air between
clips. While one plays, you prepare the next. A single player with a playlist
forces either gapless playback (which limits operator control) or dead air
between clips while you load the next one.

### 1.2 WHEP Delivery (not local playback)

Clips are **NOT** played locally in the browser. A media engine server-side
renders each clip and delivers it as a WebRTC stream via WHEP
(WebRTC HTTP Egress Protocol). The browser receives a composed video stream.

Key properties of this approach:
- Browser only needs a `<video>` element — no codec support needed
- Server controls actual playback (rate, position, audio routing)
- Multiple players receive independent WHEP streams on separate paths
- Auto-restart if WebRTC connection drops (2000ms delay)

The WHEPClient class handles the full WebRTC lifecycle.

---

## 2. Player Data Model

### 2.1 Vue.js Data State (per player)

```javascript
data: {
  gui: undefined,               // iframe comms bridge object
  title: "Player",              // Custom player name

  // Playback state
  state: "NULL",                // NULL | PLAYING | PAUSED | etc.
  rate: 1.0,                    // Playback speed (0.5, 1.0, 2.0, ...)
  position: 0,                  // Current position in milliseconds
  duration: 0,                  // Total clip duration in milliseconds

  // Clip queue
  current_item: {type: "empty"}, // Currently playing clip (or empty)
  outgoing_item: {type: "empty"}, // Clip currently transitioning out
  queue: [],                    // Queue of upcoming clips (array of items)
  uri: "",                      // Text input for adding clips

  // Playback settings (per player)
  autoshow: false,              // Auto-take to PGM when clip starts
  autoplay: false,              // Auto-play when clip is loaded
  autoshow_stinger: false,      // Use stinger transition for autoshow
  autoshow_return: undefined,   // Source to return to after clip ends
  loop_queue: false,            // Loop entire queue after last item
  frame_interpolation_supported: false,  // Motion smoothing available?
  frame_interpolation_enabled: false,    // Motion smoothing on?

  // UI state
  is_uri_field: false,          // Show URI input field?
  settings_visible: false,      // Settings panel toggle
  show_slider: false,           // Position slider toggle
  clear_confirmation_setting: true, // Require confirm before clearing
}
```

### 2.2 Queue Item Schema

Each item in the queue array has this shape:

```javascript
{
  name: "clip_name.mp4",        // Human-readable name (parsed from URI)
  type: "media",                // "media" | "youtube" | "ring-replay"
  uri: "file:///path/to/clip",  // Full URI to the media file

  // Clip trimming (mark in / mark out)
  start_position: 0,            // Start position in milliseconds
  end_position: -1,             // End position in ms (-1 = play to end)

  // Playback
  rate: 1.0,                    // Speed multiplier for this clip
  seek: 0,                      // Initial seek offset in ms

  // Queue management
  identifier: "abc123",         // Unique ID for backend tracking
  removable: true,              // Can item be removed from queue?
  movable: true,                // Can item be reordered?

  // State flags
  looped: false,                // Item currently looping? (hidden from rendered queue)
  outgoing: false,              // Item currently transitioning out? (added in render)
}
```

#### Clip type details

| Type | Description | Duration behavior |
|------|-------------|-------------------|
| `media` | Local file or network media | Normal start/end position |
| `youtube` | YouTube URL | Parsed via URL regex, set as YouTube source |
| `ring-replay` | Ring buffer replay clip | Uses `start_position` as clock time, shows clock display, runs past duration with "+" time |
| `empty` | Placeholder for no clip | Used as default state |

### 2.3 Computed Properties

These derived properties control UI behavior and display:

#### Current Item Handling

| Property | Logic |
|----------|-------|
| `_current_item` | If `current_item.type != "empty"`, use it. Else if `outgoing_item.type != "empty"`, use outgoing with `{outgoing: true}` flag. Else return empty. |
| `is_current_item` | `current_item.type != "empty"` and `current_item` is defined |
| `is_audio` | `current_item.audio === true` |
| `is_loop` | `current_item.loop === true` |
| `is_loop_queue` | `loop_queue === true` |

#### Queue Display

| Property | Logic |
|----------|-------|
| `rendered_queue` | `queue.filter(item => !item.looped)` — hide items currently looping |
| `rendered_queue_with_current` | Prepend `current_item` if not empty |
| `rendered_queue_with_outgoing` | Prepend `outgoing_item` (with `{outgoing: true}`) if not empty |
| `is_queue_empty` | `queue.length == 0` |
| `is_player_empty` | `rendered_queue_with_outgoing.length === 0` |
| `items_length` | Current (1 if not empty) + rendered_queue.length |

#### Enable/Disable States

| Property | Logic |
|----------|-------|
| `control_enabled` | `current_item.type != "empty"` |
| `next_enabled` | `outgoing_item` exists OR `control_enabled` |
| `is_slider_disabled` | `!is_current_item` |

#### Time Display

| Property | Logic |
|----------|-------|
| `time_text` | `position:time` / `duration:time` formatted as HH:MM:SS (or MM:SS if < 1 hour) |
| `current_item_time_left` | Time remaining countdown. If past duration (ring-replay), shows clock time + "+" prefix. Uses moment.js for clock formatting. |

#### Queue Duration

| Property | Logic |
|----------|-------|
| `queue_duration` | Sum of all queued items: `(end_position - start_position) / rate - transition_length`. Only for non-looped items with positive duration. |
| `queue_duration_formatted` | `queue_duration + current_item.duration` formatted as HH:MM:SS |
| `queue_real_duration_formatted` | `(queue_duration + (duration - position)) / rate` — actual real-time remaining, accounting for speed |
| `queue_ending` | `items_length > 0 AND queue_duration + (duration - position) < 5000` — last 5 seconds warning |

---

## 3. Control Inventory

### 3.1 Visual Layout (per player iframe, 325×240 px)

```
┌──────────────────────────────────────┐
│ ⚙  Player                           │  ← Title bar (gear = settings toggle)
├──────────────────────────────────────┤
│  00:05 / 00:45          -00:40       │  ← Time row (current/duration + remaining)
├──────────────────────────────────────┤
│  ═══════●══════════════════════      │  ← Position scrubber slider (toggleable)
├──────────────────────────────────────┤
│  ⏮  ▶⏸  ⏭  0.5  1×  2×  4×  8×     │  ← Transport bar
├──────────────────────────────────────┤
│  🔁  🔁🔊  🔊  🞐  📋                │  ← Clip control row
├──────────────────────────────────────┤
│  [________________URL]  [Add]        │  ← Queue input (URI field)
├──────────────────────────────────────┤
│  1. clip_name.mp4      00:12  ▲ ▼ ✕ │  ← Queue items
│  2. other_clip.mp4     00:25  ▲ ▼ ✕ │     (each shows name, duration,
│  3. youtube_vid        00:08  ▲ ▼ ✕ │      move up, move down, remove)
├──────────────────────────────────────┤
│  Duration: 00:45   Items: 3          │  ← Queue summary footer
├──────────────────────────────────────┤
│  ↓ Settings (toggled)                │
│  ☑ Autoshow                         │
│  ☑ Autoshow stinger                  │
│  ☑ Autoplay                         │
│  Autoshow return: [source ▼]        │
│  ☑ Frame interpolation               │
│  ☑ Confirm before clear              │
│  🔊 Audio present                    │  ← Clip audio indicator
└──────────────────────────────────────┘
```

### 3.2 Transport Controls

| Control | Icon/Button | Action Sent | Enabled When |
|---------|-------------|-------------|--------------|
| Play/Pause toggle | ▶⏸ (toggles) | `pause_play_toggle` | `control_enabled` (clip loaded) |
| Next (skip forward) | ⏭ | `next` | `next_enabled` |
| Seek start (jump to beginning) | ⏮ | `seek_start` | `is_current_item` |
| Position slider | Horizontal scrub bar | `seek {value, relative_to_start: true}` | `is_current_item` |
| Rate 0.5× | 0.5 button | `rate {value: 0.5}` | always |
| Rate 1× | 1× button | `rate {value: 1.0}` | always |
| Rate 2× | 2× button | `rate {value: 2.0}` | always |
| Rate 4× | 4× button | `rate {value: 4.0}` | always |
| Rate 8× | 8× button | `rate {value: 8.0}` | always |

### 3.3 Clip Controls

| Control | Icon/Button | Action Sent | Enabled When |
|---------|-------------|-------------|--------------|
| Loop current clip | 🔁 toggle | `toggle_current_item_loop` | `is_current_item` |
| Loop entire queue | 🔁🔊 toggle | `toggle_loop_queue` | always |
| Audio toggle (mute/unmute clip) | 🔊 toggle | `toggle_audio` | `is_current_item` |
| Clear player (stop + clear current) | 🗑 | `clear_player` | `is_current_item` |
| Clear queue only | 🗑 (queue variant) | `clear_queue` | queue not empty |
| Toggle slider visibility | 🞐 | `toggle_slider` (local only) | always |
| Toggle settings panel | ⚙ gear icon | `toggle_settings` (local only) | always |

### 3.4 Queue Management

| Control | Action Sent | Enabled When |
|---------|-------------|--------------|
| Add item from URI input | `add_item {value: item}` | URI length ≥ 10 |
| Remove item from queue | `remove_item {identifier}` | `item.removable == true` |
| Move item up | `move_item {identifier, direction: "up"}` | `item.removable == true` |
| Move item down | `move_item {identifier, direction: "down"}` | `item.removable == true` |

### 3.5 Settings Panel

| Setting | Type | Action Sent |
|---------|------|-------------|
| Autoshow | Checkbox toggle | `autoshow {value: bool}` |
| Autoshow using stinger | Checkbox toggle | `autoshow_stinger {value: bool}` |
| Autoplay on load | Checkbox toggle | `autoplay {value: bool}` |
| Autoshow return source | Text/dropdown | `autoshow_return {value: string}` |
| Frame interpolation | Checkbox toggle (only shown if supported) | `frame_interpolation_enabled {value: bool}` |
| Clear confirmation | Checkbox toggle | `clear_confirmation_setting {value: bool}` |

---

## 4. Message Protocol — Complete Reference

All communication between iframe and backend uses publish/subscribe via a `gui` object:

- **Send:** `gui.send_message({type: "...", value: ..., ...})`
- **Receive:** `gui.on_message(function(msg) { ... })`
- **Init:** Global function `onReady(gui)` is called when iframe loads
- **Sizing:** `gui.setGuiSize(width, height)` sets iframe dimensions

### 4.1 Player → Backend (Outgoing Messages)

| Message Type | Payload | Description |
|---|---|---|
| `pause_play_toggle` | _(none)_ | Toggle play/pause state |
| `seek` | `{value: ms, relative_to_start: bool}` | Seek to position. `relative_to_start` tracks whether seek is from clip start (0) or trimmed in-point |
| `seek_start` | _(none)_ | Jump to clip start position |
| `next` | _(none)_ | Skip to next item in queue |
| `rate` | `{value: float}` | Set playback speed |
| `toggle_current_item_loop` | _(none)_ | Toggle loop on current clip |
| `toggle_loop_queue` | _(none)_ | Toggle loop entire queue |
| `toggle_audio` | _(none)_ | Toggle audio mute for current clip |
| `clear_player` | _(none)_ | Stop current clip and clear player state |
| `clear_queue` | _(none)_ | Clear all queued items (keeps current) |
| `restart` | _(none)_ | Restart player (TODO — not implemented) |
| `add_item` | `{value: item_object}` | Add item from URI text input to queue |
| `remove_item` | `{identifier: string}` | Remove item from queue by identifier |
| `move_item` | `{identifier: string, direction: "up"\|"down"}` | Reorder queue item |
| `autoplay` | `{value: bool}` | Toggle autoplay setting |
| `autoshow` | `{value: bool}` | Toggle autoshow setting |
| `autoshow_stinger` | `{value: bool}` | Toggle stinger transition |
| `autoshow_return` | `{value: string}` | Set return source name |
| `clear_confirmation_setting` | `{value: bool}` | Require confirmation before clear |
| `frame_interpolation_enabled` | `{value: bool}` | Toggle frame interpolation |
| `reload` | _(none)_ | Request page reload (not sent from player, received from backend) |

### 4.2 Backend → Player (Incoming Messages)

| Message Type | Shape | Description |
|---|---|---|
| `init` | `{value: {title, state, rate, autoplay, autoshow, autoshow_stinger, loop_queue, isurifield, queue: [...], current: {...}, autoshow_return, clear_confirmation_setting, frame_interpolation_supported, frame_interpolation_enabled}}` | Full state on iframe load. Contains all settings + current state + full queue + current item. |
| `state` | `{value: string}` | Player playback state: `"NULL"`, `"PLAYING"`, `"PAUSED"`, `"STOPPED"` |
| `current_item` | `{value: item}` | Currently playing item (full object) |
| `outgoing_item` | `{value: item}` | Item currently transitioning out (full object, with outgoing flag) |
| `queue` | `{value: [item, ...]}` | Full queue array (excludes looped items) |
| `position_duration` | `{value: {position: ms, duration: ms}}` | Position/duration update. **Throttled to ~25fps (40ms throttle).** The iframe also `_.throttle(40)` on render. |
| `rate` | `{value: float}` | Current playback rate update |
| `autoplay` | `{value: bool}` | Autoplay setting state |
| `autoshow` | `{value: bool}` | Autoshow setting state |
| `autoshow_stinger` | `{value: bool}` | Stinger setting state |
| `autoshow_return` | `{value: string}` | Return source state |
| `clear_confirmation_setting` | `{value: bool}` | Clear confirmation state |
| `loop_queue` | `{value: bool}` | Loop queue setting state |
| `frame_interpolation_enabled` | `{value: bool}` | Frame interpolation state |
| `reload` | _(none)_ | Trigger full page reload of the iframe |

### 4.3 Position/Duration Streaming

Position updates are the most frequent message. Both sides throttle:

1. **Backend** sends `position_duration` updates at its own rate
2. **Iframe** uses `_.throttle(40)` (lodash throttle) to limit React/Vue renders:

```javascript
set_real_position_duration: _.throttle(function(position, duration) {
  this.position = position;
  this.duration = duration;
}, 40)
```

This limits the Vue reactivity to ~25 updates/second — smooth scrub bar without over-rendering.

### 4.4 `gui` Bridge Object Methods

```javascript
// Called when iframe lifecycle ends (cleanup)
gui.on_close(callback)

// Send message to parent/backend
gui.send_message({type: "...", ...})

// Register message handler from parent/backend
gui.on_message(callback)

// Set iframe dimensions in parent window
gui.setGuiSize(width, height)

// Open a settings popup (used for device configuration)
gui.open_popup(url, width, height, x, y)
```

---

## 5. Queue Logic Reference

### 5.1 Rendering Order

The rendered queue display shows items in this order:

1. **Outgoing item** — clip being transitioned OUT (shown with grayed/outgoing indicator)
2. **Current item** — clip currently playing (highlighted)
3. **Queued items** — upcoming clips, excluding items marked as `looped`

```javascript
rendered_queue_with_outgoing = [
  outgoing_item,          // If not empty, flagged {outgoing: true}
  current_item,           // If not empty
  ...queue.filter(item => !item.looped)  // Upcoming
]
```

### 5.2 Queue Duration Calculation

Each item contributes: `(end_position - start_position) / rate - transition_length`

```javascript
this.queue.forEach(function(item) {
  let clip_duration = item.end_position - item.start_position;
  clip_duration = clip_duration * (item.rate || 1.0);
  // Subtract transition overlap (crossfade between clips)
  clip_duration = clip_duration - (item["transition-length"] || 0) * 1000;

  if(clip_duration > 0) {
    total_duration += clip_duration;
  };
});
```

### 5.3 Queue Ending Detection

The queue is "ending" when:
```
current_item_remaining + queue_duration < 5000ms  // 5 second warning
```

### 5.4 URI Parsing

When adding an item, the name is parsed from the URI:
- **For YouTube URLs:** extracts video ID from `v=` query parameter
- **For other URIs:** takes the last path segment (filename)

### 5.5 Clip Trimming (Mark In/Out)

Per-clip marks are stored as `start_position` and `end_position` in milliseconds.
These are used for:
- **Duration display:** `end_position - start_position`
- **Time remaining:** `duration - position` relative to trimmed range
- **Auto-next:** when position >= end_position, triggers next clip

---

## 6. Outgoing Item / Transition Crossfade

The `outgoing_item` mechanism handles smooth transitions between clips.

### 6.1 Lifecycle

1. Clip is playing → `current_item = {clipA, ...}`, `outgoing_item = {type: "empty"}`
2. Operator presses NEXT → backend sets `outgoing_item = clipA` and `current_item = clipB`
3. UI shows both items — clipA grays out (outgoing), clipB becomes active
4. Media engine performs crossfade between clipA audio/video and clipB
5. Crossfade completes → `outgoing_item` returns to `{type: "empty"}`

### 6.2 Visual Indication

- `outgoing_item` objects get `{outgoing: true}` flag added during render
- The computed `_current_item` property handles the display logic
- The crossfade duration comes from `item["transition-length"]` in milliseconds
- Queue duration calculation subtracts transition length so the queue counter is accurate

### 6.3 Transition Length

Each item can have a `transition-length` property (in ms). This is the amount of overlap/crossfade between consecutive clips. The media engine handles the actual audio/video crossfade — the player frontend only displays the state.

---

## 7. Autoshow Automation

### 7.1 Concept

Autoshow automates vision mixer operations when a clip plays:

| Setting | Behavior when clip starts | Behavior when clip ends |
|---------|--------------------------|------------------------|
| Autoshow OFF | Operator manually cuts to clip source | Clip stops, source stays |
| Autoshow ON | Automatically **take clip to PGM** | Clip stops, no return |
| Autoshow + Return | Automatically **take clip to PGM** | **Return to saved source** |
| Autoshow + Stinger | Automatically **take clip to PGM using stinger** | Per return setting |

### 7.2 Flow Diagrams

```
--- AUTOSHOW OFF ---
PLAY → clip plays on player → operator manually cuts to PGM → END → clip stops

--- AUTOSHOW ON (no return) ---
PLAY → auto-take to PGM → clip plays → END → clip stops, source stays on air

--- AUTOSHOW + RETURN ---
PLAY → auto-take to PGM → clip plays → END → auto-take back to [autoshow_return source]

--- AUTOSHOW + STINGER ---
PLAY → auto-take to PGM (stinger transition) → clip plays → END → (return if configured)
```

### 7.3 Backend Implementation Hints

The backend must:
1. Monitor player state changes
2. On state = PLAYING AND autoshow = true → fire vision mixer CUT/AUTO to this player's input
3. On state = STOPPED/ended AND autoshow_return is set → fire vision mixer CUT/AUTO back to return source
4. Track which source was on PGM before the autoshow cut (to know where to return)

In Open Live Studio, these are `MIXER_CUT` or `MIXER_AUTO` WS messages targeting specific mixer inputs.

---

## 8. WHEP Client Reference

### 8.1 Class Overview

```javascript
class WHEPClient {
  constructor(video, path, video_only, volume=1.0)
  // video:     <video> DOM element
  // path:      stream path (e.g., "player/a" or "player/b")
  // video_only: skip audio processing
  // volume:    initial gain (0.0 - 1.0)

  start()           // Begin WebRTC connection (OPTIONS → POST → PATCH)
  close()           // Close peer connection and cancel restart timer
  stats()           // Get RTCPeerConnection stats
  setVolume(vol)    // Set audio gain via AudioContext GainNode
}
```

### 8.2 Connection Lifecycle

```
1. OPTIONS to /whep → get ICE servers from Link header
                        ↓
2. Create RTCPeerConnection with iceServers
                        ↓
3. Add video + audio transceivers (direction: "sendrecv")
                        ↓
4. pc.ontrack → attach stream to <video> element
                        ↓
5. pc.createOffer()
6. pc.setLocalDescription(offer)
                        ↓
7. POST offer SDP to /whep → get Location header (sessionUrl) + answer SDP
                        ↓
8. pc.setRemoteDescription(answer)
                        ↓
9. For each ICE candidate:
   - If sessionUrl not set: queue candidate
   - If sessionUrl set: PATCH candidate to sessionUrl with trickle-ice-sdpfrag
                        ↓
[DISCONNECT/FALLED]:
  - Close pc, clear sessionUrl
  - DELETE session
  - Wait 2000ms
  - Restart from step 1
```

### 8.3 SDP Modification

The WHEP client modifies the SDP offer before sending:

**Stereo Opus injection:**
- Finds the audio section with Opus codec
- Injects `;stereo=1;sprop-stereo=1` into the `a=fmtp:` line for Opus
- This enables stereo audio over the WebRTC Opus stream

### 8.4 Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `whep_client_restartPause` | 2000 | Delay (ms) before auto-reconnect |
| WHEP port (dev) | 8889 | Stream server port with custom port |
| WHEP port (production) | 443 | Uses same port as HTTPS |

### 8.5 SDP Utility Functions

| Function | Purpose |
|----------|---------|
| `linkToIceServers(links)` | Parse `Link` header into RTCIceServer array |
| `parseOffer(sdp)` | Extract ice-ufrag, ice-pwd, media sections |
| `generateSdpFragment(offerData, candidates)` | Build trickle-ICE SDP fragment for PATCH |
| `editOffer(offer)` | Inject stereo Opus into SDP sections |
| `enableStereoOpus(section)` | Modify one SDP media section for stereo |
| `unquoteCredential(v)` | Unquote JSON-encoded credentials from headers |

---

## 9. UI Layout Reference

### 9.1 Iframe Dimensions

| Iframe | Width | Height |
|--------|-------|--------|
| Media Editor C (WHEP viewer) | Dynamic/responsive | Dynamic |
| PlayerA | 325 px | 240 px |
| PlayerB | 325 px | 240 px |

Both Player iframes use `iframeResizer` v4.2.11 for dynamic height management between
the iframe content and parent window.

### 9.2 CSS Theme Structure (not visual styles — layout pattern only)

The UI uses a dark theme with these structural CSS variable categories:

```css
:root {
  /* Layout colors */
  --background-very-light: #424242;  /* Panels, sections */
  --background-light: #303030;       /* Card bodies */
  --background-dark: #212121;        /* Card headers, controls */
  --background-black: #111111;       /* Deep backgrounds */

  /* Brand accent */
  --color-accent: #FFD60B;           /* Primary action buttons, highlights */
}
```

**Material color system** — full palette from red through blue-grey, each with 9 shades (50-900) plus accent shades (A100-A700). Used for:
- `material-color-green-*` → Success buttons (play, confirm)
- `material-color-red-*` → Danger buttons (stop, delete)
- `material-color-orange-*` → Warning buttons (clear, reset)
- `material-color-blue-*` → Info actions
- `material-color-grey-*` → Neutral buttons, disabled states

**Button style classes (structural):**

| Class | Use |
|-------|-----|
| `is-success-gradient` | Green gradient for play/confirm |
| `is-dark-success` | Solid dark green |
| `is-dark-error` | Orange/red for dangerous actions |
| `is-dark-warning` | Deep orange for warning actions |
| `is-dark-red` | Red for destructive actions |
| `is-transparent` | Ghost/invisible buttons |
| `is-black` | Dark neutral buttons |
| `is-dark-blue` | Blue accent buttons |
| `is-dark-orange` | Brand accent buttons (yellow) |
| `is-dark-gradient` | Dark neutral gradient |

**Panel structure (Bulma CSS framework derivative):**

| Class | Role |
|-------|------|
| `panel` | Container |
| `panel-heading` | Title bar, drag handle, close button area |
| `panel-body` | Content area (background-light) |
| `panel-block` | Row/section within panel body |
| `panel-tabs` | Tab navigation |
| `panel-padding` | Adds padding to heading and body |
| `panel-margin-top` | Spacing between panels |
| `fix-footer` | Sticky footer (height: 40px) for status bar |

### 9.3 Layout Zones (per player iframe)

```
┌── Zone: Title Bar ─────────────────────────────┐
│  Left: Gear icon (settings toggle)             │
│  Center: Player name label                     │
│  Height: 30px                                  │
├── Zone: Time Row ──────────────────────────────┤
│  Left: current/duration "00:05 / 00:45"        │
│  Right: remaining/clock "-00:40" or "+00:05"   │
├── Zone: Slider (toggled) ─────────────────────┤
│  Horizontal scrub bar (vue-slider component)   │
├── Zone: Transport ─────────────────────────────┤
│  Horizontal button row:                        │
│  ⏮ Seek Start | ▶⏸ Play/Pause | ⏭ Next        │
│  Rate buttons in smaller size                  │
├── Zone: Clip Controls ─────────────────────────┤
│  🔁 Loop Clip | 🔁🔊 Loop Queue | 🔊 Audio     │
│  🞐 Toggle Slider | 📋 Queue toggle             │
├── Zone: Queue Input ───────────────────────────┤
│  Text input field + "Add" button               │
├── Zone: Queue List ────────────────────────────┤
│  Scrollable list of items:                     │
│  [number. name     duration  ▲▼✕]             │
├── Zone: Queue Footer ──────────────────────────┤
│  Left: Total duration "Duration: 00:45"        │
│  Right: Item count "Items: 3"                  │
├── Zone: Settings Panel (toggled) ──────────────┤
│  Listed vertically:                            │
│  ☑ Label (checkbox)                            │
│  Return source [dropdown]                       │
│  ❖ Audio present (non-interactive indicator)   │
└────────────────────────────────────────────────┘
```

### 9.4 Button States

All buttons handle these states:
- **Normal:** default appearance
- **Active/Toggled:** highlighted/different color
- **Disabled:** grayed out when `control_enabled == false` or `item.removable == false`
- **Hover:** slightly lighter/darker background
- **Focus:** outline/ring (none in this theme — uses transparent border)

Loop and audio buttons show **toggle state** — different color when active vs inactive.

---

## 10. Iframe Communication Pattern (Shared with Hardware Control)

This is the same `gui.send_message` / `gui.on_message` infrastructure used for
MIDI and Xkeys hardware (see MEMORY.md Research: Hardware Control).

### 10.1 Pattern Summary

```javascript
// In iframe HTML:
function onReady(gui) {
  gui.setGuiSize(325, 240);        // Set dimensions
  app.set_gui(gui);                 // Store reference
}

// In Vue app:
set_gui: function(gui) {
  this.gui = gui;

  // Register message handler
  gui.on_message(function(msg) {
    // Handle incoming state updates
    switch(msg.type) {
      case "init": /* full state */ break;
      case "state": this.state = msg.value; break;
      // ...
    }
  });

  // Send messages to parent/backend
  this.gui.send_message({type: "pause_play_toggle"});
}
```

### 10.2 Iframe Lifecycle

1. Parent window creates iframe with `src="player.html"`
2. iframe loads → Vue app mounts
3. Parent calls `onReady(gui)` with bridge object
4. Iframe sends init request or waits for init message
5. Iframe starts receiving state updates
6. On unload: `gui.on_close(callback)` fires for cleanup

---

## 11. Developer's Checklist: Building for Open Live Studio

### Phase 1: Core Single Player (maps to Strom `player.*()` API)

- [ ] Single `builtin.media_player` block in flow
- [ ] Play/Pause toggle → `player.control('play'/'pause')`
- [ ] Next/Previous → `player.control('next'/'previous')`
- [ ] Stop → `player.control('stop')`
- [ ] Seek scrubber → `player.seek(position_ms * 1e6)` (nanoseconds)
- [ ] Rate control → verify Strom player supports rate per item
- [ ] Loop clip → Strom playlist supports loop flag
- [ ] Loop queue → verify Strom supports queue loop
- [ ] Audio toggle → mute property on mixer channel for this player
- [ ] Queue management → `POST player/playlist` with file URIs
- [ ] Position/duration polling → `GET player/state` with 40ms throttle
- [ ] Time display: current/duration formatted as HH:MM:SS
- [ ] Time remaining countdown
- [ ] Position scrubber UI with drag support
- [ ] Queue item display: name, duration, reorder buttons

### Phase 2: Queue Clip Trimming (per-item mark in/out)

- [ ] Store `start_position`/`end_position` per queue item in production doc
- [ ] On clip load: seek to `start_position` (convert ms → ns)
- [ ] Monitor position: auto-next when `position >= end_position`
- [ ] Duration calculation: `(end_position - start_position) / rate` per item
- [ ] UI for per-clip mark in/out: sliders or timecode input fields
- [ ] Store marks per item identifier, survive page refresh

### Phase 3: A/B Dual Player

- [ ] Two `builtin.media_player` blocks in production flow
- [ ] Route each player to separate vision mixer inputs (for crossfade)
- [ ] Each player has independent channel strip in audio mixer
- [ ] Two independent player panels in Studio UI
- [ ] Tab or side-by-side layout for PlayerA / PlayerB
- [ ] Per-player queue management (queues are independent)
- [ ] Per-player settings (autoshow, autoplay, loop mode)
- [ ] Clear indication of which player is on PGM (tally)
- [ ] Player state synchronization from backend

### Phase 4: Autoshow Automation

- [ ] Monitor player state on backend: PLAYING → trigger mixer action
- [ ] `autoshow` setting per player (stored in production document)
- [ ] `autoshow_stinger` setting per player
- [ ] `autoshow_return` setting per player (source name/id)
- [ ] On PLAY + autoshow: `MIXER_CUT` or `MIXER_AUTO` to this player's mixer input
- [ ] On clip END + autoshow_return: `MIXER_CUT` back to return source
- [ ] Track "previous PGM source" before autoshow cut (for return)
- [ ] Stinger transition support for autoshow

### Phase 5: Transition / Outgoing Item Display

- [ ] Outgoing item state pushed from backend to client
- [ ] UI shows outgoing item dimmed with crossfade indicator
- [ ] Queue duration accounts for transition overlap
- [ ] Transition length configurable per clip or global setting

### Phase 6: Polish

- [ ] Queue duration counter (real-time remaining for full queue)
- [ ] Queue ending warning (last 5 seconds visual indicator)
- [ ] Items count display
- [ ] Frame interpolation if supported by Strom
- [ ] Clear confirmation dialog setting
- [ ] Settings persistence in production document (survives reconnect)
- [ ] Hardware controller mapping for transport controls (MIDI/Xkeys)

---

## 12. Appendix: Full Source Files

### 12.1 WHEPClient.js

```javascript
const whep_client_restartPause = 2000;

const whep_client_unquoteCredential = (v) => (
    JSON.parse(`"${v}"`)
);

const whep_client_linkToIceServers = (links) => (
    (links !== null) ? links.split(', ').map((link) => {
        const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"\)?; credential="(.*?)"; credential-type="password")?/i);
        const ret = {
            urls: [m[1]],
        };

        if (m[3] !== undefined) {
            ret.username = whep_client_unquoteCredential(m[3]);
            ret.credential = whep_client_unquoteCredential(m[4]);
            ret.credentialType = "password";
        }

        return ret;
    }) : []
);

const whep_client_parseOffer = (offer) => {
    const ret = {
        iceUfrag: '',
        icePwd: '',
        medias: [],
    };

    for (const line of offer.split('\r\n')) {
        if (line.startsWith('m=')) {
            ret.medias.push(line.slice('m='.length));
        } else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
            ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
        } else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
            ret.icePwd = line.slice('a=ice-pwd:'.length);
        }
    }

    return ret;
};

const whep_client_generateSdpFragment = (offerData, candidates) => {
    const candidatesByMedia = {};
    for (const candidate of candidates) {
        const mid = candidate.sdpMLineIndex;
        if (candidatesByMedia[mid] === undefined) {
            candidatesByMedia[mid] = [];
        }
        candidatesByMedia[mid].push(candidate);
    }

    let frag = 'a=ice-ufrag:' + offerData.iceUfrag + '\r\n'
        + 'a=ice-pwd:' + offerData.icePwd + '\r\n';

    let mid = 0;

    for (const media of offerData.medias) {
        if (candidatesByMedia[mid] !== undefined) {
            frag += 'm=' + media + '\r\n'
                + 'a=mid:' + mid + '\r\n';

            for (const candidate of candidatesByMedia[mid]) {
                frag += 'a=' + candidate.candidate + '\r\n';
            }
        }
        mid++;
    }

    return frag;
};

const whep_client_enableStereoOpus = (section) => {
    let opusPayloadFormat = '';
    let lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
            opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
            break;
        }
    }

    if (opusPayloadFormat === '') {
        return section;
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=fmtp:' + opusPayloadFormat + ' ')) {
            if (!lines[i].includes('stereo')) {
                lines[i] += ';stereo=1';
            }
            if (!lines[i].includes('sprop-stereo')) {
                lines[i] += ';sprop-stereo=1';
            }
        }
    }

    return lines.join('\r\n');
};

const whep_client_editOffer = (offer) => {
    const sections = offer.sdp.split('m=');

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (section.startsWith('audio')) {
            sections[i] = whep_client_enableStereoOpus(section);
        }
    }

    offer.sdp = sections.join('m=');
};

class WHEPClient {
  constructor(video, path, video_only, volume=1.0) {
    this.video = video;
    this.path = path;
    this.pc = null;
    this.restartTimeout = null;
    this.sessionUrl = '';
    this.queuedCandidates = [];
    this.analyser = null;
    this.gainNode = null;
    this.volume = volume;
    this.video_only = video_only;

    var port = "8889";
    if (window.location.port == "" || window.location.port == "443" || window.location.port == "80") {
      port = "443";
    }

    this.server = "https://" + window.location.hostname + ":" + port + "/" + this.path + "/";
    if (typeof(this.path) == "undefined") return;
    this.start();
  }

  start() {
    console.log(this.path, "requesting ICE servers");

    fetch(new URL('whep', this.server), {
      method: 'OPTIONS',
    }).then((res) =>
      this.onIceServers(res)
    ).catch((err) => {
      console.log(this.path, 'error: ' + err);
      this.scheduleRestart();
    });
  }

  close() {
    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.pc !== null) {
      this.pc.close();
      this.pc = null;
    }
  }

  stats() {
    if (this.pc) {
      return this.pc.getStats();
    }
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.gainNode) {
      console.log(this.path, "setting volume to", this.volume);
      this.gainNode.gain.value = this.volume;
    }
  }

  onIceServers(res) {
    this.pc = new RTCPeerConnection({
      iceServers: whep_client_linkToIceServers(res.headers.get('Link')),
    });

    const direction = "sendrecv";
    this.pc.addTransceiver("video", { direction });
    this.pc.addTransceiver("audio", { direction });

    this.pc.onicecandidate = (evt) => this.onLocalCandidate(evt);
    this.pc.oniceconnectionstatechange = () => this.onConnectionState();

    this.pc.ontrack = (evt) => {
      console.log(this.path, "new track:", evt.track.kind);

      if (this.video_only === true) {
        if (evt.track.kind == "video") {
          this.video.srcObject = evt.streams[0];
        }
      } else {
        if (evt.track.kind == "audio") {
          // Audio gain control via Web Audio API
          // Implementation uses AudioContext + GainNode
          // (commented out in current source — audio goes directly to <video>)
        }
        this.video.srcObject = evt.streams[0];
      }
    };

    this.pc.createOffer().then((offer) => this.onLocalOffer(offer));
  }

  onLocalOffer(offer) {
    whep_client_editOffer(offer);
    this.offerData = whep_client_parseOffer(offer.sdp);
    this.pc.setLocalDescription(offer);

    console.log(this.path, "sending offer");

    fetch(new URL('whep', this.server), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }).then((res) => {
      if (res.status !== 201) {
        console.log(this.path, res);
        throw new Error('bad status code', res);
      }
      this.sessionUrl = new URL(res.headers.get('location'), this.server).toString();
      return res.text();
    }).then((sdp) => this.onRemoteAnswer(new RTCSessionDescription({
      type: 'answer',
      sdp,
    }))).catch((err) => {
      console.log(this.path, 'error: ' + err);
      this.scheduleRestart();
    });
  }

  onConnectionState() {
    if (this.restartTimeout !== null) {
      return;
    }

    console.log(this.path, "peer connection state:", this.pc.iceConnectionState);

    switch (this.pc.iceConnectionState) {
      case "disconnected":
        this.scheduleRestart();
        break;
      case "failed":
        this.scheduleRestart();
        break;
    }
  }

  onRemoteAnswer(answer) {
    if (this.restartTimeout !== null) {
      return;
    }

    this.pc.setRemoteDescription(answer);

    if (this.queuedCandidates.length !== 0) {
      this.sendLocalCandidates(this.queuedCandidates);
      this.queuedCandidates = [];
    }
  }

  onLocalCandidate(evt) {
    if (this.restartTimeout !== null) {
      return;
    }

    if (evt.candidate !== null) {
      if (this.sessionUrl === '') {
        this.queuedCandidates.push(evt.candidate);
      } else {
        this.sendLocalCandidates([evt.candidate])
      }
    }
  }

  sendLocalCandidates(candidates) {
    if (this.sessionUrl == '') {
      console.log(this.path, "Session url empty: ", this.path);
      return;
    }
    fetch(this.sessionUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/trickle-ice-sdpfrag',
        'If-Match': '*',
      },
      body: whep_client_generateSdpFragment(this.offerData, candidates),
    }).then((res) => {
      if (res.status !== 204) {
        throw new Error('bad status code', res);
      }
    }).catch((err) => {
      console.log(this.path, 'error: ' + err);
      this.scheduleRestart();
    });
  }

  scheduleRestart() {
    if (this.restartTimeout !== null) {
      return;
    }

    if (this.pc !== null) {
      this.pc.close();
      this.pc = null;
    }

    this.restartTimeout = window.setTimeout(() => {
      this.restartTimeout = null;
      this.start();
    }, whep_client_restartPause);

    if (this.sessionUrl && this.sessionUrl != '') {
      fetch(this.sessionUrl, {
        method: 'DELETE',
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error('bad status code');
        }
      })
      .catch((err) => {
        console.log(this.path, 'delete session error: ' + err);
      });
    }
    this.sessionUrl = '';

    this.queuedCandidates = [];
  }
}
```

### 12.2 Player JavaScript (identical code for PlayerA and PlayerB)

> **Note:** PlayerA and PlayerB use **identical code**. They are separate iframes
> that load the same `player.js`. The difference is which `gui` bridge object each
> receives — PlayerA connects to player/a path, PlayerB to player/b path.

```javascript
var app = new Vue({
  el: "#app",
  data: function() {
    return {
      gui: undefined,
      title: "Player",
      state: "NULL",
      rate: 1.0,
      position: 0,
      duration: 0,
      is_uri_field: false,
      autoshow: false,
      autoplay: false,
      autoshow_stinger: false,
      loop_queue: false,
      current_item: {"type": "empty"},
      outgoing_item: {"type": "empty"},
      queue: [],
      uri: "",
      settings_visible: false,
      autoshow_return: undefined,
      clear_confirmation_setting: true,
      frame_interpolation_supported: false,
      frame_interpolation_enabled: false,
      show_slider: false,
    }
  },
  components: {
    "vue-slider": vueSlider
  },
  computed: {
    _current_item: function() {
      if (this.current_item.type != "empty") { return this.current_item; }
      if (this.outgoing_item.type != "empty") { return {...this.outgoing_item, outgoing: true}; }
      return this.current_item;
    },
    rendered_queue: function() {
      return this.queue.filter(item => !item.looped);
    },
    rendered_queue_with_current: function() {
      if ((this.current_item || {}).type == "empty") return this.rendered_queue;
      return [this.current_item].concat(this.rendered_queue);
    },
    rendered_queue_with_outgoing: function() {
      if ((this.outgoing_item || {}).type == "empty")
        return this.rendered_queue_with_current;
      return [{...this.outgoing_item, outgoing: true}].concat(this.rendered_queue_with_current);
    },
    next_enabled: function() {
      if ((this.outgoing_item || {type: "empty"}).type != "empty") return true;
      return this.control_enabled;
    },
    control_enabled: function() {
      if ((this.current_item || {type: "empty"}).type != "empty") return true;
      return false;
    },
    time_text: function() {
      if (this.is_current_item) {
        var dur = this.parse_time(this.duration);
        var pos = this.parse_time(this.position);
      } else {
        var dur = this.parse_time(0);
        var pos = this.parse_time(0);
      }
      if(dur[0] == "00") {
        return pos[1] + ":" + pos[2] + " / " + dur[1] + ":" + dur[2];
      } else {
        return pos[0] + ":" + pos[1] + ":" + pos[2] + " / " + dur[0] + ":" + dur[1] + ":" + dur[2];
      }
    },
    current_item_time_left() {
      if (this.is_current_item) {
        let time = this.duration - this.position;
        let val = "";
        if (this.duration <= 0 || time <= 0) {
          time = this.position - Math.max(0, this.duration);
          if (this.current_item.type == "ring-replay") {
            position_clock_time = this.current_item.start_position + this.position;
            position_clock_time = moment(position_clock_time).format("HH:mm:ss");
            val = position_clock_time + " / ";
          }
          val += "+";
        }
        let left = this.parse_time(time);
        if(left[0] == "00") {
          val += left[1] + ":" + left[2];
        } else {
          val += left[0] + ":" + left[1] + ":" + left[2];
        }
        return val;
      }
      return "--:--";
    },
    is_current_item: function() {
      if (typeof(this.current_item) == "undefined") return false;
      if (this.current_item.type == "empty") return false;
      return true;
    },
    is_audio: function() {
      if (this.is_current_item == true) { return this.current_item.audio; }
      return false;
    },
    is_loop: function() {
      if (this.is_current_item == true) { return this.current_item.loop; }
      return false;
    },
    is_loop_queue: function() { return this.loop_queue; },
    is_slider_disabled: function() { return !this.is_current_item; },
    is_queue_empty: function() { return this.queue.length == 0; },
    is_player_empty: function() {
      return this.rendered_queue_with_outgoing.length === 0;
    },
    position_info: function() {
      if (this.is_slider_disabled) return 0;
      return this.position;
    },
    queue_ending: function() {
      if (this.items_length == 0) return false;
      return this.queue_duration + (this.duration - this.position) < 5000;
    },
    items_length: function() {
      let curr_type = (this.current_item || {}).type;
      let curr = curr_type == "empty" ? 0 : 1;
      return curr + this.rendered_queue.length;
    },
    queue_duration: function() {
      if(this.queue.length < 1) { return 0; }
      let total_duration = 0;
      this.queue.forEach(function(item) {
        let clip_duration = item.end_position - item.start_position;
        clip_duration = clip_duration * (item.rate || 1.0);
        clip_duration = clip_duration - (item["transition-length"] || 0) * 1000;
        if(clip_duration > 0) { total_duration += clip_duration; };
      });
      return total_duration;
    },
    queue_duration_formatted: function() {
      let duration_parts = this.parse_time(this.queue_duration + this.duration);
      if(duration_parts[0] == "00") {
        return duration_parts[1] + ":" + duration_parts[2];
      }
      return duration_parts[0] + ":" + duration_parts[1] + ":" + duration_parts[2];
    },
    queue_real_duration_formatted: function() {
      let duration_parts = this.parse_time(
        (this.queue_duration + (this.duration - this.position)) / this.rate
      );
      if(duration_parts[0] == "00") {
        return duration_parts[1] + ":" + duration_parts[2];
      }
      return duration_parts[0] + ":" + duration_parts[1] + ":" + duration_parts[2];
    }
  },
  methods: {
    toggle_slider: function() { this.show_slider = !this.show_slider; },
    restart: function() { this.gui.send_message({type: "restart"}); },
    clear_player: function() { this.gui.send_message({type: "clear_player"}); },
    clear_queue: function() { this.gui.send_message({type: "clear_queue"}); },
    parse_time: function(duration) {
      var milliseconds = parseInt((duration%1000)/100)
          , seconds = parseInt((duration/1000)%60)
          , minutes = parseInt((duration/(1000*60))%60)
          , hours = parseInt((duration/(1000*60*60))%24);
      hours = (hours < 10) ? "0" + hours : hours;
      minutes = (minutes < 10) ? "0" + minutes : minutes;
      seconds = (seconds < 10) ? "0" + seconds : seconds;
      if(isNaN(hours)) hours = "00";
      if(isNaN(minutes)) minutes = "00";
      if(isNaN(seconds)) seconds = "00";
      return [hours,minutes,seconds];
    },
    parse_name: function(uri) {
      if(uri.indexOf("youtube.com") != -1) {
        var parsedUri = uri.match(/v=([^&]+)/);
        return parsedUri[1];
      } else {
        var parsedUri = uri.split("/");
        return parsedUri[parsedUri.length-1];
      }
    },
    add_item: function() {
      var uri = this.uri;
      if(typeof(uri) != "string" || uri.length < 10) return;
      var item = {
        name: this.parse_name(this.uri),
        type: (uri.indexOf("youtube.com") != -1 ? 'youtube' : 'media'),
        uri: this.uri,
        start_position: 0,
        end_position: -1,
        rate: 1.0,
        seek: 0
      };
      this.gui.send_message({"type": "add_item", "value": item});
    },
    remove_item: function(item) {
      if(item.removable == false) return;
      this.gui.send_message({type: "remove_item", identifier: item.identifier});
    },
    move_item: function(item, direction) {
      if(item.removable == false) return;
      this.gui.send_message({type: "move_item", identifier: item.identifier, direction: direction});
    },
    get_duration: function(item) {
      var val = item.end_position - item.start_position;
      if(val <= 0) return "";
      var dur = this.parse_time(val);
      if(dur[0] == "00") { return dur[1] + ":" + dur[2]; }
      else { return dur[0] + ":" + dur[1] + ":" + dur[2]; }
    },
    toggle_settings: function() { this.settings_visible = !this.settings_visible; },
    slider_change: function(new_value) {
      if (typeof(this.current_item) == "undefined") return;
      this.gui.send_message({type: "seek", value: new_value, relative_to_start: true});
    },
    play_toggle: function() { this.gui.send_message({type: "pause_play_toggle"}); },
    seek_start: function() {
      if(typeof(this.current_item) == "undefined") return;
      this.gui.send_message({type: "seek_start"});
    },
    next: function() { this.gui.send_message({type: "next"}); },
    set_rate: function(value) { this.gui.send_message({type: "rate", value: value}); },
    toggle_autoplay: function() {
      var val = this.autoplay;
      if (val == true) {val = false;} else {val = true;}
      this.gui.send_message({type: "autoplay", value: val});
    },
    toggle_autoshow: function() {
      var val = this.autoshow;
      if (val == true) {val = false;} else {val = true;}
      this.gui.send_message({type: "autoshow", value: val});
    },
    toggle_autoshow_stinger: function() {
      var val = this.autoshow_stinger;
      if (val == true) {val = false;} else {val = true;}
      this.gui.send_message({type: "autoshow_stinger", value: val});
    },
    toggle_audio: function() { this.gui.send_message({type: "toggle_audio"}); },
    toggle_loop: function() { this.gui.send_message({type: "toggle_current_item_loop"}); },
    toggle_loop_queue: function() { this.gui.send_message({type: "toggle_loop_queue"}); },
    update_autoshow_return: function(new_value) {
      this.gui.send_message({type: "autoshow_return", value: this.autoshow_return});
    },
    update_clear_confirmation_setting: function(new_value) {
      this.gui.send_message({type: "clear_confirmation_setting", value: this.clear_confirmation_setting});
    },
    update_frame_interpolation_enabled: function(new_value) {
      this.gui.send_message({type: "frame_interpolation_enabled", value: this.frame_interpolation_enabled});
    },
    set_real_position_duration: _.throttle(function(position, duration) {
      this.position = position;
      this.duration = duration;
    }, 40),
    set_gui: function(gui) {
      var self = this;
      self.gui = gui;
      self.gui.on_message(function(msg) {
        var value = msg["value"];
        switch(msg.type) {
          case "init":
            console.log("init", msg);
            self.title = value.title;
            self.state = value.state;
            self.rate = value.rate;
            self.autoplay = value.autoplay;
            self.autoshow = value.autoshow;
            self.autoshow_stinger = value.autoshow_stinger;
            self.loop_queue = value.loop_queue;
            self.is_uri_field = value.isurifield;
            self.queue = value.queue;
            self.current_item = value.current;
            self.autoshow_return = value.autoshow_return;
            self.clear_confirmation_setting = value.clear_confirmation_setting;
            self.frame_interpolation_supported = value.frame_interpolation_supported;
            self.frame_interpolation_enabled = value.frame_interpolation_enabled;
            break;
          case "rate": self.rate = value; break;
          case "autoplay": self.autoplay = value; break;
          case "autoshow": self.autoshow = value; break;
          case "autoshow_stinger": self.autoshow_stinger = value; break;
          case "autoshow_return": self.autoshow_return = value; break;
          case "clear_confirmation_setting": self.clear_confirmation_setting = value; break;
          case "loop_queue": self.loop_queue = value; break;
          case "frame_interpolation_enabled": self.frame_interpolation_enabled = value; break;
          case "state":
            console.log("state", value);
            self.state = value;
            break;
          case "current_item": self.current_item = value; break;
          case "outgoing_item": self.outgoing_item = value; break;
          case "queue": self.queue = value; break;
          case "position_duration":
            value = msg.value;
            self.set_real_position_duration(value.position, value.duration);
            break;
          case "reload": location.reload(); break;
        }
      });
    }
  }
});

function onReady(gui) {
  gui.setGuiSize(325,240);
  app.set_gui(gui);
}
```

### 12.3 CSS Reference

> **Note:** The full CSS is ~800 lines. Key structural patterns documented in
> Section 9.2. The full file is available in the original source but the
> relevant layout information is captured in Section 9 above.
>
> Key dependencies:
> - Bulma CSS framework derivative (panel, button, control classes)
> - Roboto font family (12 weights, including Thin, Light, Regular, Medium, Bold, Black plus italics)
> - Vue-slider component for scrub bar
> - Material Design color palette via CSS variables

### 12.4 iframeResizer

> **Reference:** Standard `iframeResizer` v4.2.11
> - Package: `iframe-resizer` (npm) or CDN
> - Parent page uses `iframeResize()` to manage iframe sizing
> - Iframes include `iframeResizer.contentWindow.js` to report their size
> - Used for dynamic height communication between iframe and parent
>
> The iframeResizer is not core to the media player architecture — it's a
> convenience for cross-origin iframe height management. In a same-origin setup
> (like Open Live Studio where everything is local), simpler postMessage or
> direct DOM access can replace it.

---

## 13. Key Differences from Open Live Studio's Current Media Player Spec

The existing Open Live MEMORY.md Media Player spec plans a single player
with dropdown for multiple instances. Areas where this reference suggests
changes:

| Aspect | Current Spec | Reference Approach |
|--------|-------------|-------------------|
| Player count | Single player + dropdown | Two independent A/B players |
| Queue | Playlist managed by backend | Per-player queue in frontend + backend |
| Clip trimming | Not specified | Per-item `start_position`/`end_position` |
| Transitions | Not specified | Outgoing item + transition-length crossfade |
| Autoshow | Not specified | Auto-take to PGM, auto-return, stinger support |
| Position updates | Via player state polling | Throttled 40ms streaming |
| Video delivery | Via Strom pipeline to mixer | Already handled (Open Live uses WHEP from mixer output) |
| Clip types | Media files only | Media + YouTube + ring-replay (future) |
| Rate control | Not specified | Per-item rate + global rate buttons |
| Queue duration | Not specified | Real-time countdown + ending warning |
