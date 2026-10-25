# AI usage disclosure

## Tool used

This project used **Devin** as an AI coding assistant during the 24–25 October 2026 hackathon.

## How Devin helped

Devin assisted with:

- planning the multiplayer architecture and server-authoritative race rules;
- implementing TypeScript and Node.js features across controllers, networking, physics and rendering;
- debugging motion input, race synchronization, collision behavior and first-person paddle grips;
- writing and running unit, browser and 50-controller load tests;
- reviewing screenshots and performance artifacts;
- drafting project documentation and third-party attribution.

## Human contribution and review

Aly Sajad chose the project direction, game concept and feature priorities. The participant reviewed the resulting code, screenshots and test reports, ran the project, and retained responsibility for the submission. Devin-generated changes were verified through type checking, builds, automated tests and a 15-minute local load run.

## AI boundaries

No generative AI service runs inside the game. Player motion data goes to the local race server as validated stroke events; it is not sent to Devin. The shipped application does not require an AI API key.

## Evidence

Development checkpoints appear in [CHANGELOG.md](CHANGELOG.md). Test and performance evidence appears in [docs/VALIDATION.md](docs/VALIDATION.md) and `artifacts/rowing-v4-*`.
