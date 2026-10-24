# Upstream source

- Project: p5.party — https://github.com/jbakse/p5.party
- Version: 0.16.0
- Commit: 259bdc0a0ddc3010422d7e56a1598f5ee9c6d433
- License: MIT, copyright (c) 2020 Justin Bakse. The full license is retained at the project root and included in the web build.

Imported from the pinned source archive, with no Git history or upstream remote. This application directly imports `src/index.ts`, using p5.party's real Room/Record abstractions, Deepstream client/server, shared state and events. The race opts out of global guest-presence subscriptions and guest records to avoid all-to-all fan-out. The library was not reimplemented.

Local library changes: optional connection credentials, a stable client ID and `subscribeGuests: false` support authenticated room sessions while preserving the original default API. A read-only `connectionInfo()` helper in `src/party.ts` exposes the existing Room connection indicator for reconnect UI. The server-issued admin capability belongs to the session that created the room; p5.party's automatic guest election does not grant phone users organizer controls.

Upstream examples, branding, publishing automation and unrelated assets are excluded from the game. Upstream networking source and tests remain. The library version is generated as 0.16.0, independently of the application's package version.

Additional libraries: p5.js (LGPL-2.1), Deepstream client/server (MIT), qrcode (MIT), on-change (MIT), reefjs (MIT), buffer (MIT). Bungee and Noto Sans fonts are bundled through Fontsource and have their SIL Open Font License notices copied into the web build. Three.js renders the game and Rapier supplies the authoritative planar collision/rigid-body simulation. http-proxy forwards same-origin WebSocket and API traffic. Prepared MakeHuman and Poly Haven assets are CC0; their source/attribution files are under public/assets. The original decorative landing preview remains a p5 canvas.
