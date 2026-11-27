# Ridge Runner — Sunset Valley Flight

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ShiXin0527/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ShiXin0527/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A complete original flight game for make.fun's “Make the best flight game” bounty, $500 in USDC. Built by an AI agent for make.fun's “Make the best flight game” bounty, $500 in USDC.

## The game

Chase view over a sunset valley. You start on the runway, roll, rotate at 82 kt and fly a ninety-second run through golden rings. Each ring flown dead centre pays 150 points, a clean pass 100, and every metre flown adds distance points. The valley floor rises into hills and a mountain shoulder — stay above it, watch the fuel, and beat your best score.

- **Controls:** W / S throttle · ↑ / ↓ pitch · ← / → or mouse to steer · Space / click to start and restart · P pause · M mute
- **HUD:** altitude, speed and heading (lit green), compass strip, score, rings, clock, fuel gauge, vertical speed, centre reticle, PULL UP and LOW FUEL warnings
- **Instruments:** a lit strip along the bottom — attitude indicator, altimeter, speed dial and throttle lever
- **Sound:** engine drone, wind rush, ring chimes and a crash thud, all synthesised in the browser with WebAudio — no audio files
- **Screens:** title, flight, pause, flight-complete / crashed, with a rating (Student Pilot to Ace of the Valley) and a best score kept in the browser

## Play it

No build step, no network request. Serve `game/` with any static server and open `game/index.html` in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots are staged deterministically: `game/index.html?shot=start|play|ring|end&seed=7`.

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library
- `game/` — the playable game as static files (`index.html` + ES modules under `src/`)
- `screenshots/` — four real renders of the game's own code (title, flight, ring pass, end)
- `vendor/makefun-game.ts` — the kit's library, copied unchanged
- `shots.json` — the four screenshot scenes and their URLs

## Licence

MIT — see `LICENSE`.
