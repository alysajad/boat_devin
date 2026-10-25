# Devin Hacks submission

## Repository

[github.com/alysajad/boat_devin](https://github.com/alysajad/boat_devin)

## Participant

Aly Sajad ([@alysajad](https://github.com/alysajad)), solo participant.

## Short project description

Devin Hacks is a real-time multiplayer Kerala boat-racing game. Players join from their phones and row with motion or swipe gestures while a laptop renders the shared 3D race. Assigned left/right strokes steer each boat, balanced teamwork keeps it downstream, and server-authoritative physics handles drift, roll, collisions and close finishes.

## Why it matters

The project turns devices already in the room into a shared physical game. It supports up to 50 participants without app installation, dedicated controllers or accounts, making it practical for community events, classrooms and team activities.

## Working demo

Requirements: Node.js 24, npm and a WebGL-capable laptop browser.

```sh
git clone https://github.com/alysajad/boat_devin.git
cd boat_devin
npm ci
npm start
```

Open `http://localhost:8080`, select **Host a race**, and let phones join through the displayed room link. Swipe input works on a local HTTP connection. For phone motion controls, install cloudflared and use `npm run event`, or provide trusted local TLS certificates as described in the README.

## Demo flow

1. Create a room and configure at least two boats.
2. Join one or more phones to each boat.
3. Select motion or swipe input, practise and tap **Ready**.
4. Start the race from the laptop.
5. Demonstrate one-sided steering, balanced rowing, a collision and a first-person rower view.

## Technology

TypeScript, Node.js 24, Three.js, Rapier 2D, p5.party, Deepstream, Reef, Playwright and Jest.

## Verification summary

- 60 game tests and 59 retained compatibility tests pass.
- 20 Chromium end-to-end scenarios pass.
- The production build and TypeScript check pass.
- A 15-minute local run with 50 controllers completed 22 rounds and 44,900 acknowledged strokes with no reported errors.
- Local acknowledgment P95: 103.41 ms.
- Worst sampled server-step P95: 7.54 ms.

Full results and known limits are documented in [docs/VALIDATION.md](docs/VALIDATION.md).

## AI and third-party disclosure

The project used Devin as described in [AI_USAGE.md](AI_USAGE.md). Third-party code and asset sources are listed in [docs/UPSTREAM.md](docs/UPSTREAM.md) and `public/assets/*/CREDITS.txt`.
