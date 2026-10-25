# Agent instructions

These instructions apply to AI assistants and automated coding agents working in this repository.

## Project goal

Maintain Devin Hacks as a reliable multiplayer Kerala boat-racing game. Phones must stay lightweight controllers, while the laptop owns the 3D broadcast and event controls. The Node server remains authoritative for rosters, strokes, physics and results.

## Working rules

1. Read `README.md`, `RULES.md`, `AI_USAGE.md` and the relevant source files before changing behavior.
2. Keep protocol names, shared types, permissions, session storage keys and tests aligned. Protocol changes require fresh rooms and a version bump.
3. Preserve the 700 ms stroke interval and server-side input validation unless the task changes the game rules.
4. Do not add Three.js, crew models, textures or video to the phone controller bundle.
5. Keep secrets out of source control. Add new variable names to `.env.example` without real values.
6. Reuse the existing stack before adding a dependency.
7. Update `CHANGELOG.md` and `AI_USAGE.md` when work changes the submitted project or its AI disclosure.

## Verification

Run the checks that match the change:

```sh
npm run typecheck
npm test
npm run test:game
npm run build
```

Run `npm run test:e2e` for controller, networking, director or rendering changes. Use `RENDER_BROADCAST=1 npm run test:load` for performance-sensitive multiplayer changes. Report local performance separately from tunnel or venue-network latency.

## Documentation

Write direct, testable claims. Link evidence from `artifacts/` or `docs/VALIDATION.md` when reporting performance. Keep third-party attribution intact under `public/assets/` and `docs/UPSTREAM.md`.
