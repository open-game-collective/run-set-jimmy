# Run Set Jimmy

A rummy-style card game of runs and sets over 7 rounds, for grown-ups (extended family and
friends, 3–7 seats: people, or AI players the room plays itself). The TV shows the table; each player holds their hand on a phone. An OGS game
(appId `run-set-jimmy`): cast through the OGS app, or played in plain browsers.

- **Stack:** Cloudflare Worker + one Durable Object per room through actor-kit v2 (`@actor-kit/*`
  0.3 pre-release, vendored in `vendor/`), React 19, esbuild client bundles, Zod 4 at every
  boundary, pnpm.
- **Architecture:** copied from Rocket Crew / Night Flight (see `/cast-party-game`).

## Feedback commands (must pass before committing)

1. `pnpm typecheck`
2. `pnpm test` (engine, room actor through `simulate()`, client helpers, a 25-game fuzz sample)
3. `pnpm test:fuzz` after a change to the room or the engine (1,000 seeded games, ~3 min)
   (a deployment: `GAME_URL=… pnpm exec tsx e2e/smoke.ts` and `e2e/latency.ts`, see docs/spec.md)
4. `pnpm dev:seam` in one shell, then `pnpm test:seam` (OGS contract, 4 phones over the wire, and
   DO eviction: `e2e/eviction.seam.test.ts` runs its own `wrangler dev` on 8899)
5. After visible changes: `pnpm dev`, then `pnpm record` (TV + phones video) and look at it

## Knowledge base (load only when relevant)

| Doc | When |
|---|---|
| [RULES.md](RULES.md) | Any rules question. The engine follows it exactly. |
| [docs/spec.md](docs/spec.md) | Surfaces, OGS integration, POC scope |
| [docs/art-style.md](docs/art-style.md) | Any visual change |
| [docs/actor-kit-v2-feedback.md](docs/actor-kit-v2-feedback.md) | An actor-kit v2 surprise (add to it) |

## Core principles

- **The rules engine is pure** (`src/game/`): no I/O, deterministic from a seed, tested beside each
  module. The room machine only sequences it.
- **Hands are private.** The server keeps every hand and the deck; each phone's private view holds
  only its own hand; the public view has counts. Never put a hand in the public context.
- **Trust only verified OGS tokens** for identity (`/ogs/claim/:room` → `OGS_CLAIM`). A plain
  browser's typed name is just a display name.
- **Still a plain web game:** every OGS path degrades to the game's own name form, room code and QR.

## Key conventions

- `src/game/`: `cards` (shoe, points) → `melds` (runs/sets, jokers fixed by position, slide rule)
  → `arrange` (order a run, placements) → `round` (deal/cut, turns, buy window, go down, play on,
  discard, out) → `game` (7 rounds, totals). `bot` + `sim` play whole games (tests, recordings).
- `src/room.ts`: the actor contract (`kit.actor`). States lobby → cutting → playing { window ⇄
  acting } → roundOver → gameOver; every timer is a durable `scope: "state"` timer; messages name
  the roles that may send them. `src/room.rules.ts`: the transitions (pure). `src/room.views.ts`:
  roles and views, zod-free (the client builds its socket from them); `src/room.wire.ts`: the view
  schema. Keep zod out of client code (`zod/mini` if a check is needed there).
- Handlers read time and randomness only through `ctx.now()` / `ctx.random()` (replay checks it).
- Tests: `src/test/room-test-helpers.ts` runs the room in `simulate()`; `src/test/fuzz.ts` plays
  whole games and replays their journals. actor-kit gaps go in docs/actor-kit-v2-feedback.md.
- `src/client/`: `tv.tsx` (1920×1080 stage), `join.tsx` (phone). Pure phone logic in `hand.ts`.
- `e2e/table.ts` drives real phone pages with the bot through the real buttons (`phone-bot.ts`);
  `bot-table.ts` seats 3 bots for a person or an explorer to join.
- Dev port 8797 (`pnpm dev`); seam server 8798 (`pnpm dev:seam`, local OGS key set on 8837).

## Keeping docs current

| If you change… | Update… |
|---|---|
| A rule | RULES.md, then the engine test first |
| The OGS integration | docs/spec.md, the seam tests |
| The look | docs/art-style.md, re-record |

## Off-limits without asking

- Deploying, pushing, and adding the game to the OGS catalogue (a PR to open-game-system).
- Paid generation (fal, Meshy, ElevenLabs): Codex images first, `--dry` first.

## Git

`main`, commit at every working milestone. Remote: `origin` =
`open-game-collective/run-set-jimmy` (ask before pushing).
