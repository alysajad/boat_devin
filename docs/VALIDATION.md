# Protocol 3 validation — 25 October 2026

Implemented portrait motion/swipe controllers, configurable motion sensitivity and rowing force, automatic crew growth, fixed courses, synchronized crew propulsion, distance/timed races, broadcast direction and an HTTPS event launcher. Protocol 2 rooms must be replaced.

## Chundan Vallam / Onam boat rebuild — follow-up

Replaced the short canoe with an original procedural Chundan Vallam-inspired shell: narrow varnished timber hull, low pointed bow, tall curved stern, fitted deck boards, brass rails, team-colour inlays and floral garlands. Rowers now sit in paired benches, with light shorts and compact name labels for large crews. High quality adds soft directional shadows; lower quality retains contact shading. The design is game-scaled to 14–22.35 m for 1–25 participants; it is not an exact replica of a particular traditional boat. [Design references and implementation details](../README.md#laptop-broadcast).

The server and renderer share the longer hull length, so visible bow crossings still match authoritative results. Starting crew size, frozen seats and normalized propulsion are preserved. Updating the server requires fresh rooms/QR codes.

- TypeScript and production build pass; all **39 game tests** pass. New geometry checks cover finite surface data, closed mesh edges, bow/stern profile and paired seating for every crew size from one to 25. Existing authority tests cover bow crossings, ties, normalization and disconnects. [Unit log](../artifacts/chundan-unit.log).
- **11 distinct Chromium scenarios** pass across the race/director suite and final additions. This includes character clicking from four angles, native/fullscreen fallback, POV return, swipe/motion races, disconnect/rematch, and a full 25-person crew with last-seat POV. [Race/director run](../artifacts/chundan-browser.log), [four final director scenarios](../artifacts/chundan-director-final.log), [final dense-label/full-crew check](../artifacts/chundan-full-crew-check.log).
- A **60-second local load window** with 50 controllers, 10 boats and a fullscreen rendered broadcast completed two rounds: 53 connections, 2,700 acknowledged strokes, **113.11 ms acknowledgment P95**, **3.16 ms worst sampled server-step P95**, and no reported errors (72 seconds including setup). FPS samples were **60, 60, 60, 60, 60, 58, 6, 21, 30**. Soft shadows were active at high quality; adaptive quality reduced them to contact shading. The rematch/loading dip remains, so this does **not** establish a stable 30/60 FPS minimum or UHD performance. [Result](../artifacts/chundan-load.json), [log](../artifacts/chundan-load.log), [broadcast](../artifacts/chundan-load-broadcast.png). The final compact-name-label adjustment affects crews larger than eight; it does not change this ten-boat/five-rower workload.

Visual review: [full crew](../artifacts/chundan-full-crew.png), [side profile](../artifacts/chundan-side.png), [raised stern](../artifacts/chundan-stern.png), [last rower POV](../artifacts/chundan-last-seat.png). No physical-phone or tunnel readiness claim is added by this graphics pass; the earlier limits below still apply. The 15-minute endurance run was not repeated for this follow-up.

## Graphics polish and reliable character selection — follow-up

The river now uses softer crossed ripples with distance fading, a blue atmospheric sky, blended wakes and hull contact shading, warmer timber, and layered foliage/shore plants. These reuse the existing renderer and instanced scenery; phones still do not load the scene.

Character selection now intersects stable seated-body bounds instead of depending on animated mesh geometry or render batching. Hover highlights the corresponding name. Clicking the body or name opens that player's seat POV; **Back to broadcast** restores Auto. The browser regression selects a character from side, chase, bow and overview cameras, verifies hover feedback and the return control, and retains the existing fullscreen/POV/private-event checks. TypeScript and production build pass. All three director browser scenarios pass. [Browser log](../artifacts/graphics-polish-browser.log), [overview](../artifacts/director-overview.png), [first person](../artifacts/director-pov.png).

A 60-second local load window with the polished scene and fullscreen broadcast passed: 50 controllers, 10 boats, 53 connections, two rounds, 3,000 acknowledged strokes, 9.16 ms acknowledgment P95 and 0.54 ms worst sampled server-step P95, with no reported errors (72 seconds including setup). FPS samples were 11, 30, 30, then seven readings at 60. Startup frame-rate dips remain; this is not a guarantee of sustained UHD/60 FPS. [Load result](../artifacts/graphics-polish-load.json), [load log](../artifacts/graphics-polish-load.log), [50-player scene](../artifacts/graphics-polish-load-broadcast.png). The final cursor-only adjustment does not affect rendering or transport. This pass did not repeat the physical-phone, tunnel or 15-minute endurance checks below.

## Director, seat POV and stroke feedback — follow-up

The laptop now has clickable character/name POV, five live camera previews sharing one renderer, translucent controls and rower names, and fullscreen director entry from Start. Exit/Escape and the browser-fullscreen refusal fallback are tested. Host reload during a race restores the viewport layout. UHD/Adaptive/Performance controls expose actual resolution and FPS; UHD is a pixel budget, not a frame-rate guarantee. Accepted server timestamps drive paddles and name flashes, with immediate private controller feedback and an admin/watch-only stroke stream. Clock-corrected event cadence tolerates compressed packet arrival gaps while retaining the 700 ms cadence and stale/future-event bounds.

Validation:

- Production build and TypeScript check pass. All 37 game tests pass, including accepted-only feedback and timestamp/cadence validation under jitter. [Logic log](../artifacts/director-unit.log).
- All 16 distinct Chromium scenarios pass across the full suite and targeted additions/regressions. The final five-scenario regression covers fullscreen start/exit/refusal, live previews, name and mesh picking, POV dragging, UHD selection, accepted stroke labels, private feedback permissions, host reload, swipe racing and synthetic sideways motion propulsion. [Full suite](../artifacts/director-full-suite.log), [final regression](../artifacts/director-final-regression.log).
- Three WebKit controller scenarios pass for permission, synthetic motion and swipe fallback, including no 3D downloads on phones. [WebKit log](../artifacts/director-webkit.log). Physical iPhone/Android testing remains outstanding.
- A fresh **60-second local regression window** with 50 controllers, 10 boats and a fullscreen rendered broadcast completed two rounds (71 seconds including setup; 53 connections). It recorded **3,150 acknowledged strokes**, **7.49 ms input-acknowledgment P95**, **0.44 ms worst sampled server-step P95**, and no reported errors. All 11 five-second FPS samples reported 60 at 1280 × 800. [Result](../artifacts/director-verified-local.json), [log](../artifacts/director-verified-local.log), [broadcast](../artifacts/director-verified-local-broadcast.png).

The load harness now resets acknowledgment counters per round and starts controller heartbeats immediately after login, before record subscriptions finish. Earlier exploratory director load artifacts predate these harness corrections and are not the final measurement. The feedback metric measures server acknowledgment, not sensor-to-screen latency. Earlier rendering runs still exhibited loading/rematch dips, including windows below 30 FPS; the final short run does not demonstrate sustained 60 FPS or UHD performance. The original 15-minute result below remains historical, not a new endurance run of the director changes.

The separate 50-controller Quick Tunnel test **did not pass**. The repeat completed its 60-second race window (207 seconds including connection/setup), but recorded zero usable input acknowledgments and repeated event-subscription/record-read timeout warnings. No tunnel input-acknowledgment P95 can be reported from that run; its empty structured error list does not include the client's console warnings. Server-step P95 remained 3.24 ms, while rendered samples included 7 FPS rematch/loading windows before recovering. [Tunnel result](../artifacts/director-verified-tunnel.json), [warnings/run log](../artifacts/director-verified-tunnel.log). The earlier tunnel attempt also failed ([log](../artifacts/director-load-tunnel.log)). These results do not establish reliable 50-phone internet operation. Use the direct venue Wi-Fi option for lower latency, and validate the actual uplink/tunnel before an event; neither clock correction nor renderer optimization can guarantee absolute synchronization across the internet.

A subsequent two-phone browser check through the same tunnel also failed: the phone remained at 0 m after three swipes and a five-second wait, although it had joined and reached the racing phase. [Browser failure log](../artifacts/director-tunnel-browser.log). A separate health request returned HTTP 200 in 1.54 seconds, so the reported 502 was not reproduced; a successful health response does not establish usable game latency. The current tunnel path needs further network validation even with a small crew. This supersedes earlier successful tunnel checks for the current environment.

A paired transport diagnostic then sent five one-second-spaced strokes from a local controller and five from a tunnel controller in the same race. The server accepted all five local strokes and three tunnel strokes (10 inputs, two rejections). Tunnel status age varied from about 100 ms to over 1.4 seconds, and a clock round trip reached 1.35 seconds; local feedback remained around 1–3 ms. [Diagnostic log](../artifacts/director-tunnel-diagnostic.log). The 500 ms event-age bound remains enforced rather than replaying delayed input; this network variability can therefore drop strokes. It is not evidence of a motion-detector failure or a reliable tunnel latency figure.

Screenshots: [seat POV](../artifacts/director-pov.png), [director overview](../artifacts/director-overview.png).

## Sideways rowing and connection fixes — follow-up

This section supersedes the original vertical-gesture and automatic player-reconnect behavior documented below. Motion now calibrates across three acceleration axes and three rotational axes, accepts either initial direction and continuous out-and-back sweeps, and learns gentler thresholds. Ready controllers can practice in the lobby; countdown/paused periods do not invalidate calibration merely because samples are absent. Swipe accepts sideways movement in either direction as well as downward pulls. The controller shows practice counts, accepted race strokes, signal strength and explicit waiting-for-host instructions.

Player refresh/leave/disconnection now releases the participant and revokes the old session. Abrupt network loss expires after eight seconds without a heartbeat; a normal refresh also sends a leave beacon and cleans up its previous token on the next page load. Late heartbeats cannot recreate a departed player. Active crew dimensions and normalization remain frozen, and the remaining rowers retain their seat positions. Admin refresh still restores its session.

Verification for this follow-up:

- Build and TypeScript check pass; 35 game tests and 59 retained compatibility tests pass. [Game log](../artifacts/rowing-fix-unit.log), [compatibility log](../artifacts/rowing-fix-upstream.log).
- All 13 distinct Chromium scenarios pass across the full suite and targeted regressions. The full run exposed a countdown sensor-watchdog bug and a test timeout shorter than the documented eight-second connection expiry. After fixing the watchdog and matching that timeout to the lifecycle contract, all five affected permission/controller/race scenarios pass, including sideways motion producing authoritative boat propulsion. [Full-run diagnostics](../artifacts/rowing-fix-browser.log), [passing regression run](../artifacts/rowing-fix-regressions.log).
- Three WebKit controller scenarios pass with synthetic sideways acceleration, permission and wake-lock behavior. [Log](../artifacts/rowing-fix-webkit.log). Controllers still download no 3D assets.
- The localhost-admin/public-HTTPS two-phone race passes, including strokes, pause/resume, disconnect/removal and joining the next lobby. [Log](../artifacts/rowing-fix-tunnel.log).
- A fresh 60-second, 50-controller regression window with a rendered broadcast passed (72 seconds including setup, 2 rounds, 3,198 accepted strokes, no errors). Input-acknowledgment P95 was 218.26 ms and worst sampled server-step P95 was 3.66 ms. The sampled broadcast FPS was 60; this short run cannot establish sustained frame-rate stability. [Result](../artifacts/rowing-fix-load.json), [log](../artifacts/rowing-fix-load.log), [broadcast](../artifacts/rowing-fix-load-broadcast.png). The load harness now sends heartbeats as each controller connects, matching real phones while the rest of the crew is joining; its previous wait-until-all-joined behavior expired early sessions under the new removal rules.
- The optional local TLS listener was checked using a temporary test certificate trusted only by the test process: HTTPS API requests and an authenticated WSS race subscription succeeded. This does not establish certificate trust on a physical phone.

The reported iPhone error was **502 Bad Gateway**. The earlier public endpoint returned 200 when checked, so the exact transient failure was not reproduced. Logs did show QUIC timeouts and unreachable IPv6 addresses. The launcher now defaults to HTTP/2 over IPv4, checks origin readiness before launching the tunnel, and cleans up child processes on exit. The current tunnel registered using HTTP/2. These changes address observed network failure modes; Quick Tunnel reliability is still external to the app. The admin can select a direct Wi-Fi QR for swipe, or use a trusted certificate for local HTTPS motion. See [connection setup](../README.md#connection-problems-and-faster-synchronization).

Separate post-regression HTTP preflight measurements (31 requests per origin, no failures) returned localhost warm P50/P95 **1.62/2.85 ms** and HTTP/2 Quick Tunnel warm P50/P95 **262.19/721.19 ms**. These are laptop-origin HTTP round trips, not physical-phone Wi-Fi latency or stroke acknowledgment. [Measurement](../artifacts/rowing-fix-latency.json). All 50 load-test participants were removed after their clients disconnected.

Physical iPhone Safari and Android Chrome validation remains outstanding. The original 15-minute endurance result below is historical evidence, not a new 15-minute run of this follow-up.

## Automated checks

- Production build and TypeScript check passed.
- 59 retained p5.party unit/compatibility tests passed.
- 30 game tests passed, including the new authority, motion and camera tests and retained legacy geometry/physics tests. [Log](../artifacts/motion-unit-tests.log).
- 10 Chromium scenarios passed: motion permission acceptance/refusal/absence, three-stroke calibration, recalibration, swipe fallback, wake-lock release/reacquisition, portrait layout, solo rowing, pause/reconnect/rematch, admin settings/move/remove, camera selection/Auto/fullscreen, capabilities, graphics refusal, server restart and LAN/HTTPS invite updates. [Log](../artifacts/motion-browser-tests.log).
- Three WebKit controller scenarios passed with synthetic sensor/permission/wake behavior. These are browser-engine checks, not actual iPhone tests. [Log](../artifacts/motion-webkit-tests.log).
- Controllers fetched no scene, model, texture, WASM or video assets in those scenarios. Static bundle analysis also found no Three.js or scene/crew/scenery imports: 321,356 bytes of uncompressed static JavaScript across three modules. [Bundle evidence](../artifacts/controller-bundle.json).

Motion traces cover rest, clean cycles at 20/30/60/100 Hz, gentle ranges, jitter, isolated shocks, repeated threshold crossings, interruption, sensor bias, gravity-only input, rotation rejection, suspension and recalibration. These synthetic traces do not replace physical phone recordings.

Authority checks cover actual 50-player/25-per-team limits, growth and waiting arrivals, frozen hulls/normalization after disconnects, solo versus uneven crews, force amplification, distinct-player coordination in a total 300 ms window, timestamp/mode/round/sequence/cadence validation, both race formats and ties. Camera tests cover initial overview, six-second shots, the four-second finish cut minimum, close-battle focus and manual override.

## 15-minute local endurance run

A 900-second endurance window used 50 scripted controllers, a scripted admin and spectator, and one hardware-rendered Chromium broadcast at 1280 × 800. No competing browser suite ran during the window. This tests the local server and rendered broadcast; it does not simulate 50 phones sharing venue Wi-Fi.

| Measurement | Result |
| --- | --- |
| Total duration including setup | 917 seconds |
| Connections / players / boats | 53 / 50 / 10 |
| Rounds started | 24 |
| Acknowledged strokes | 46,971 |
| Controller input-acknowledgment P95 | 218.32 ms |
| Worst sampled server-step P95 | 4.61 ms |
| Mean detailed snapshot size | 1,791 bytes |
| Broadcast assets fetched | 5,516,456 bytes (5.26 MiB) |
| Reported errors / unexpected pauses | 0 / 0 |
| Repeated render-health samples | 27; rendering continued in all |
| Sampled broadcast FPS | Median 60; range 11–60 |

The run passed functional/network thresholds (acknowledgment P95 under 350 ms and server-step P95 under 8 ms). **It did not establish a stable 30 FPS minimum**: three sampled windows were below 30 FPS (11, 26 and 27), despite adaptive quality. The final sample returned to 60 FPS at high quality. Retest fullscreen rendering on the event laptop under its expected workload before promising smooth broadcast performance. CPU render cost is not GPU time.

The load test uses scripted stroke events; motion calibration is covered by separate synthetic/browser checks. Subsequent focused fixes preserve full-precision results, rank non-winning boats by their frozen progress, and wait for server confirmation of controller mode before enabling Ready. Unit/browser regressions cover these fixes. The endurance workload already awaited controller commands and used equally paced crews; propulsion, feed rates and rendering were unchanged. Controller presentation fixes (explicit Auto and removed-seat messaging) also passed the final browser suite.

Evidence: [raw result and render samples](../artifacts/load-motion.json), [run log](../artifacts/load-motion.log), [50-player broadcast](../artifacts/broadcast-50.png), [fullscreen broadcast](../artifacts/motion-broadcast.png), [portrait controller](../artifacts/motion-phone-race.png). Earlier `load-race.*` artifacts belong to protocol 2; `load-motion-smoke.log` is an interrupted preliminary run, not the endurance result.

## HTTPS tunnel measurement

The event launcher started cloudflared and placed its HTTPS origin in `/config.json`; browser checks verified that the localhost host's QR used that origin.

The first separate latency attempt received **HTTP 530** while cloudflared reported a QUIC inactivity timeout. Cloudflared reconnected automatically. The subsequent measurement completed 31 requests per origin without errors:

| HTTP preflight round trip | Local | HTTPS Quick Tunnel |
| --- | --- | --- |
| First request | 4.36 ms | 2,609.95 ms |
| Warm P50 (30 requests) | 1.25 ms | 405.45 ms |
| Warm P95 | 2.14 ms | 1,602.87 ms |

These are **HTTP round trips, not stroke acknowledgments**. They were measured separately from the local endurance run. The tunnel adds variable delay and can interrupt; the local 218 ms stroke figure must not be presented as tunnel performance. See [measurement](../artifacts/tunnel-latency.json) and [launcher/reconnection log](../artifacts/event-launch-measurement.log). Reproduce with `node scripts/measure-latency.mjs` while an event tunnel is running.

A full two-phone race **passed with localhost admin and HTTPS controllers**, including strokes, cameras, fullscreen, pause/resume, offline/reconnect and rematch. [Tunnel browser log](../artifacts/motion-tunnel-browser.log). An earlier all-HTTPS admin attempt timed out while reloading the admin within a five-second assertion; the intended topology keeps that admin local. The tunnel also exposed a controller-mode/Ready request-order race, now fixed and covered by a delayed-response browser regression.

Quick Tunnels are a temporary development/demo service with no uptime guarantee, and their URL changes on restart. [Cloudflare documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Remaining physical/event checks

Event readiness is **not claimed**. Validate gentle motion calibration, permission acceptance/refusal, swipe rowing, wake/visibility changes, reconnect and rematch on actual **Android Chrome and iPhone Safari**. Record real sensor traces and check the host laptop's fullscreen frame rate, thermal behavior and venue network/tunnel latency with the intended audience. Motion is a game-control signal, not precise physical hand-speed measurement.

Docker runtime was not tested. Rooms/results remain in memory. Restarting the server requires fresh rooms; the admin can reopen localhost and distribute a new room QR.
