# Kerala Boat Race

Phones are portrait rowing controllers; the laptop shows a 3D team race through the Kerala backwaters. Supports 2–10 teams, 25 people per team and 50 participants overall. Built on the retained p5.party source, Deepstream, Three.js and an authoritative Node server.

## Start an event

Use Node 24 (`npm install --prefix .tools node@24` supplies a project-local runtime if needed).

```sh
npm ci
npm run event
```

The event launcher starts the game and a Cloudflare Quick Tunnel. Install [cloudflared](https://developers.cloudflare.com/tunnel/downloads/) on your PATH, place its executable at `.tools/cloudflared`, or set `CLOUDFLARED_BIN`. Open **http://localhost:8080** on the laptop and choose **Host a race**. The QR automatically uses the tunnel's HTTPS origin once it is available. Phones can then request motion permission and use the same HTTPS origin for API and WebSocket traffic. The admin remains on localhost.

Keep the laptop and tunnel running. The temporary URL changes when the tunnel restarts. Quick Tunnels are a development/demo service with no uptime guarantee; see [Cloudflare's documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Use a managed HTTPS deployment for a stable event URL.

`npm start` serves the production game without a tunnel; `npm run dev` enables the build watcher. Plain LAN HTTP supports swipe rowing, but phone motion needs HTTPS (localhost is a browser exception). All art, fonts and game assets are served locally. `PUBLIC_ORIGIN` can supply an existing HTTPS origin for the QR.

**Protocol 3 requires fresh rooms after upgrading.** Server restarts end temporary rooms. Reloading the admin in the same tab restores its session. Do not share the admin's session token; the public room link grants no admin access.

## Connection problems and faster synchronization

A Cloudflare **502 Bad Gateway** means the tunnel could not obtain a usable response from its origin; it is not a Safari motion permission error. Check `http://localhost:8080/api/race/preflight` on the laptop, keep the event process running, and rescan the current room QR after restarting. An old Quick Tunnel URL will not follow a new tunnel. [Cloudflare troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/).

The event launcher now waits for the authority to respond before starting cloudflared, and uses **HTTP/2 over IPv4** to avoid the UDP/IPv6 failures observed on this network. `TUNNEL_TRANSPORT=quic` and `TUNNEL_EDGE_IP_VERSION=auto` can override those defaults on a network that supports them. The invite panel reports the connector state. This is not an uptime guarantee or proof of the cause of every transient 502.

For the lowest practical latency, put the laptop and phones on the same dedicated Wi-Fi router, preferably with the laptop connected by Ethernet. Choose **Phone connection → Same Wi-Fi · fastest** beside the host QR. With plain HTTP, use swipe rowing. This removes the Internet/tunnel round trip; the game still uses its authoritative WebSocket connection. Zero-latency or absolute synchronization is impossible: radio delay, sampling, rendering and the 20 Hz broadcast feed all contribute.

For motion over the same local network, supply a certificate trusted by every phone:

```sh
TLS_CERT=/absolute/path/laptop.pem TLS_KEY=/absolute/path/laptop-key.pem npm start
```

This enables HTTPS/WSS on port 8443 (override with `HTTPS_PORT`), keeps localhost admin on 8080, and makes the Same Wi-Fi QR use HTTPS. The certificate must include the laptop LAN IP in its subject alternative names. [mkcert](https://github.com/FiloSottile/mkcert) can generate development certificates, but its public root certificate must also be installed and trusted on each phone; never share its private root key. [Apple's certificate trust instructions](https://support.apple.com/en-us/102390). Changing Wi-Fi/IP may require a new certificate.

For participants on different networks, a nearby persistent HTTPS server is a practical alternative to a laptop tunnel. Tailscale Serve provides HTTPS for a private tailnet, but every participant needs Tailscale access; it is less convenient for a public QR event. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve). Measure venue latency before choosing: changing transport to WebRTC does not remove propagation delay or server authority requirements.

## Configure the race

- Choose 2–10 team names and colors. Boats grow as people join; capacity counts actual participants, not reserved seats. One rower in each of two teams is enough. Empty boats do not race.
- Choose **Finish line**, default 250 m (100–1,000 m), or **Timed**, default 60 seconds (30–180 seconds).
- **Rowing force multiplier** defaults to **1.5×**, adjustable from **0.5–3×**. This amplifies every accepted stroke equally. Increase it to make boats faster with comfortable effort.
- **Motion sensitivity** defaults to **1.3×**, adjustable from **0.5–2.5×**. Higher values recognize gentler motion, including during calibration. Rest noise still sets a minimum detection threshold.
- Save settings in the lobby. Move/remove participants or auto-balance there. Everyone must be connected and Ready; changed seats/settings clear readiness.
- Start, pause/resume, return to lobby, or rematch. Late arrivals wait and are seated automatically when the next lobby opens. The 50-player limit includes waiting participants. Lobby scene rebuilds batch rapid joins for 700 ms; the roster updates immediately and race start rebuilds without that delay.

## Row with a phone

1. Scan the QR, enter a name and choose a team.
2. Hold the phone comfortably in the orientation you will use to row. Tap **Enable motion** and grant permission directly from that tap.
3. Hold still for three seconds. Make three smooth sideways out-and-back rowing sweeps. Start in either direction; no pause between strokes is needed. Calibration learns a usable movement axis or turning arc and your range.
4. Practice until the stroke counter responds, then tap **Ready**. This means waiting for the host: the host must press **Start the race** on the laptop after at least two teams are ready. Row after the countdown.

**Use swipe rowing** is always available, including when motion is declined, missing or fails calibration. Swipe sideways in either direction or down at least 48 pixels, lift your finger, then repeat. Space/Up also rows in swipe mode for accessibility/testing. All modes share the same 700 ms minimum interval and scoring; stronger shaking grants no extra power. The phone displays connection state, personal cadence and team synchronization. It downloads no Three.js scene, crew models, textures or video.

Screen wake lock is requested where supported. Hidden or disconnected pages stop input and discard unfinished gestures. Refreshing, leaving, or disconnecting releases your participant slot. An unresponsive connection expires after eight seconds without a heartbeat. Reload and join again for a fresh seat; during a race, new arrivals wait for the next lobby. Admin sessions still restore after refresh. Active hull size and starting-crew normalization stay frozen, but the departed avatar disappears. If a calibration is interrupted by hiding the page, enable motion again. Phone motion is a game-control signal, not a measurement of physical hand speed.

## Rules and authority

The server owns all roster, readiness, stroke validation, physics and results. Boats travel along parallel fixed courses; houseboats remain scenery and there are no racing-lane obstacles or steering inputs. Bows begin at the same starting line. Crew appearance, hull length (`max(5.5, 4 + 0.85 × crew)` metres) and normalization freeze at round start, including disconnected seats.

Every accepted stroke adds forward thrust divided by the **starting crew size**. Solo and large crews have the same maximum propulsion ceiling at equal cadence. The force multiplier scales that budget uniformly. Linear/quadratic drag slows the boat; each stroke's force builds through a 0.32-second submerged drive.

Distinct teammates rowing inside a 300 ms-wide window earn up to a 10% bonus. The display averages coordination over the recent two seconds; solo boats receive full synchronization credit. Base thrust starts immediately. The small bonus settles after 800 ms so bounded network delays can be included fairly. Sequence, round, controller mode, cadence, connection epoch and timestamp bounds are validated by the server. The 700 ms cadence gate uses bounded event timestamps, so network jitter can compress arrival gaps without discarding correctly timed strokes. Inputs older than 500 ms or more than 100 ms in the future are still rejected. Clients correct timestamps using server time and the lowest-latency sample from recent WebSocket heartbeat exchanges (HTTP initializes the clock), reducing clock jumps from delayed responses; raw sensor data never leaves the phone.

In distance mode the first bow crossing ends the round; crossing times are interpolated within the authoritative simulation step, and other boats rank by progress. Crossings less than 1 ms apart tie. Timed races rank bow distance at expiry (within 1 mm ties). Pause freezes race time and clears pending drives; resume uses a new countdown. A server scheduling gap over two seconds triggers a pause.

Accepted strokes are acknowledged immediately on a private controller channel and sent to authorized broadcasts. Rejected strokes generate no animation event. Broadcast paddle phases and name flashes use the authoritative stroke timestamp; detailed snapshots recover missed events without replaying or rewinding stroke counts. Network propagation delay still applies. Healthy phones use a WebSocket heartbeat for clock checks and reduce HTTP preflight polling to once per 30 seconds.

Physics runs at 60 Hz. Controllers subscribe to a compact 5 Hz status record; admin/broadcast clients receive detailed 20 Hz snapshots. Permissions prevent players from subscribing to detailed snapshots, writing race state, reading other rooms or forging another player's channel.

## Laptop broadcast

Click **Start the race** on the laptop to enter fullscreen director view from that user gesture. **Exit director** at the top right or **Esc** returns to event controls. If native fullscreen is refused, the same layout fills the browser viewport and remains escapable. Reloading the host during a race restores director view; native fullscreen still needs a tap. Pause/resume and return-to-lobby controls are also available on the overlay.

Click a character or their translucent name to see from that rower’s actual seat. Drag in POV to look around; the Rower selector gives access to crowded or off-screen seats. The selected rower’s head is hidden while their paddle/arms remain part of the scene. Names brighten on accepted strokes. Five live camera preview tiles below the main view select the large camera; Auto restores the director. Previews share one WebGL renderer and update at about one frame per second each (less at low quality).

Fullscreen keeps labels, leaderboard, synchronization and timer/finish distance visible. Auto starts with an overview and selects side tracking, chase, bow-facing and finish-line shots. Shots generally last six seconds, with a four-second minimum for an approaching-finish cut. Close battles receive focus. Choosing a boat or shot overrides the director until **Auto** is restored. Camera transitions are smoothed; reduced-motion preferences are respected.

Choose **Adaptive**, **UHD**, or **Performance** in the on-screen Graphics selector. UHD allows up to 8.3 million render pixels (3840 × 2160 at 16:9), subject to viewport shape and adaptive quality; it is not a guarantee of 4K at 60 FPS on every GPU. The FPS and actual render resolution appear beside the controls. Performance caps the pixel budget at one million.

The broadcast uses one active 3D renderer, existing MakeHuman crew and Poly Haven textures/scenery, instanced distant geometry, and adaptive quality targeting 60 FPS with a 30 FPS fallback. It falls back to a live 2D map if graphics fail. Diagnostics are on `#race-river`, including `data-fps`, `data-quality`, `data-render-cost`, `data-camera` and `data-camera-boat`. CPU submission cost is not GPU time.

Asset sources/licenses are in `public/assets/{crew,river,scenery,basis}/CREDITS.txt`. Prepared assets are included. Optional regeneration:

```sh
npm run build:crew
npm run build:tree
npm run build:surfaces   # requires Khronos toktx
```

## Verification

See [validation evidence and remaining device checks](docs/VALIDATION.md).

```sh
npm run typecheck
npm test
npm run test:game
WEBGL_ANGLE=gl npm run test:e2e
RENDER_BROADCAST=1 npm run test:load
```

The load script defaults to a 900-second window with 50 scripted controllers and a rendered broadcast when `RENDER_BROADCAST=1`. `LOAD_SECONDS`, `RACE_URL` and `LOAD_OUTPUT` configure shorter runs and separate reports. `CONTROLLER_URL` routes the scripted player WebSockets through an HTTPS tunnel while setup API/admin/broadcast stay on `RACE_URL`; `LOAD_FULLSCREEN=1` exercises director layout. Input acknowledgment measures immediate feedback, with the compact status feed as fallback. Defaults write `artifacts/load-motion.json`. Use `node scripts/measure-latency.mjs` for a separate local/HTTPS HTTP latency comparison; `LATENCY_OUTPUT` selects a report path without overwriting prior measurements. `PHONE_URL` can point the two-phone browser scenario at the tunnel while its admin stays local. Install Playwright browsers and system libraries for browser tests. Local scripted load does not establish physical-phone or venue-network readiness. Android Chrome and iPhone Safari require actual-device checks for calibration, touch, permission, wake/visibility and reconnect behavior.

## Deployment and source

Persistent WebSockets and a running Node process are required; static-only hosting is insufficient. Expose only the web service (default 8080); API and WebSocket traffic are proxied through it. `GET /health` checks the web server and `/api/race/preflight` checks the authority. Docker/Caddy deployment files remain available; Docker was not validated in this environment.

`src/` retains upstream p5.party v0.16.0; `app/` and `server/` contain this game. Legacy two-crew physics helpers remain for the landing-page illustration and retained regression tests, not the protocol-3 race. See [upstream provenance](docs/UPSTREAM.md) and the [MIT license](license). Rooms/results are in memory; accounts, durable persistence and multi-server matchmaking are outside this version.
