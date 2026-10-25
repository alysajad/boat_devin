# Devin Hacks

A real-time multiplayer Kerala boat-racing game where phones become paddles and teamwork steers each crew to victory.

Built for the **DevDay Exchange Community Hackathon: Kochi**, held on 24–25 October 2026 at JAIN University, Kochi.

**[Event and registration on Luma](https://luma.com/z10nz8gp)** · **[Project rules](RULES.md)** · **[Agent instructions](AGENTS.md)**

## Event details

| Detail | Information |
| --- | --- |
| Venue | JAIN University, Kochi |
| Location | [Open the venue map](https://maps.app.goo.gl/Eme7gR7NDXSNRANu5) |
| Rooms | 2008 and 2009 |
| Check-in | 24 October 2026, 6:00 PM IST |
| Kick-off | 24 October 2026, 6:30 PM IST |
| Wrap-up | 25 October 2026, by 10:00 AM IST |
| Participation | Solo |
| Theme | Open |

## Project overview

- **Project name:** Devin Hacks
- **Short description:** A browser-based Kerala boat race for events, classrooms and friend groups. Players use phone motion or swipe controls to row assigned sides while a laptop renders the shared 3D race. It turns a room full of phones into one social game without requiring app installation.
- **Team:** Aly Sajad ([@alysajad](https://github.com/alysajad))
- **Working demo:** Run locally with the instructions below, open `http://localhost:8080`, and select **Host a race**. Use `npm run event` to generate an HTTPS QR link for phones.
- **Technology stack:** TypeScript, Node.js 24, Three.js, Rapier 2D, p5.party, Deepstream, Reef, Playwright and Jest.

## Run the project

1. Install Node.js 24 and npm. For phone motion controls over the internet, install [cloudflared](https://developers.cloudflare.com/tunnel/downloads/) or place its executable at `.tools/cloudflared`.
2. Install exact dependencies:

   ```sh
   npm ci
   ```

3. No environment variables are required for local play. Copy `.env.example` only for Docker or a custom deployment. Supported runtime variables include `PUBLIC_ORIGIN`, `APP_PORT`, `WS_PORT`, `API_PORT`, `TLS_CERT`, `TLS_KEY`, `HTTPS_PORT`, `CLOUDFLARED_BIN`, `TUNNEL_TRANSPORT` and `TUNNEL_EDGE_IP_VERSION`.
4. Start the production game:

   ```sh
   npm start
   ```

   To create an HTTPS phone link through a Cloudflare Quick Tunnel, run:

   ```sh
   npm run event
   ```

5. Run checks:

   ```sh
   npm run typecheck
   npm test
   npm run test:game
   npm run build
   npm run test:e2e
   ```

## How to play

1. The host opens the game on a laptop, configures the boats and shares the room QR code.
2. Players join on their phones, choose motion or swipe rowing, practise a stroke and tap **Ready**.
3. The host starts the race. Left-side strokes turn the bow right; right-side strokes turn it left. Balanced timing keeps the boat moving downstream.
4. The laptop shows the race, collisions, crew synchronization and selectable first-person rower views.

## Current status

- **Working features:** 2–10 boats, up to 50 players, motion and swipe input, assigned paddle sides, solo assistance, team synchronization, configurable timed or distance races, server-authoritative steering and collisions, pause/resume, rematches, adaptive 3D broadcast graphics, race direction, first-person rower cameras and optional crew audio.
- **Known limitations:** Rooms live in server memory and disappear after a restart. Cloudflare Quick Tunnel URLs are temporary. Motion controls require HTTPS on physical phones. The broadcast can drop below 60 FPS under a 50-controller load, and physical iPhone/Android venue testing remains outstanding.
- **Libraries, APIs and public assets:** [p5.party](https://github.com/jbakse/p5.party), [Three.js](https://threejs.org/), [Rapier](https://rapier.rs/), [Deepstream](https://deepstream.io/), [Reef](https://reefjs.com/), [MakeHuman](https://www.makehumancommunity.org/) CC0 crew assets, [Poly Haven](https://polyhaven.com/) CC0 scenery and a CC0 crew call from [Freesound](https://freesound.org/people/Jace/sounds/57204/). Detailed attribution appears in `public/assets/*/CREDITS.txt` and [docs/UPSTREAM.md](docs/UPSTREAM.md).

## Verification

The final local endurance run used 50 controllers, 10 boats and a rendered broadcast for 15 minutes. It completed 22 rounds and acknowledged 44,900 strokes with no reported errors. Local acknowledgment P95 was 103.41 ms and worst sampled server-step P95 was 7.54 ms. See [docs/VALIDATION.md](docs/VALIDATION.md) for test coverage, FPS results and screenshots.

See [AI_USAGE.md](AI_USAGE.md) for Devin assistance, [CHANGELOG.md](CHANGELOG.md) for the development record and [SUBMISSION.md](SUBMISSION.md) for the submission summary.
