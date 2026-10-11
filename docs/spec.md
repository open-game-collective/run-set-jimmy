# Run Set Jimmy: POC spec

Rules: [RULES.md](../RULES.md) (the source of truth for play).

## Who and where
- **Audience:** extended family and friends: grown-ups, 3–7 seats (people or AI players), mixed card-game experience.
  OGS catalogue: grown-ups only (`ADULT_GAMES`), every role `audience: "grownup"`.
- **Devices:** the TV shows the table; every player holds their hand on a phone (OGS app WebView or a
  plain browser). No kid or iPad seat.

## Surfaces
| Surface | Shows |
|---|---|
| TV (`/tv/:room`) | Melds on the table by owner, the discard pile with the buy-window ring, deck count, whose turn it is, each player's card count / buys left / down status, round requirement, scores between rounds. Focal area = the table; HUD at the edges; top-right corner kept free for the launcher's invite card. No room code or QR inside OGS. |
| Phone (`/join/:code`) | Your hand (sort by suit / rank, drag to rearrange), draw / buy / take-or-let-go, select cards to go down with live requirement progress, tap a meld to play on it (choose end or joker spot), discard. Playable cards glow once you're down. |

## OGS (contract: ogs-docs.pages.dev/contract.md)
- Room game: no static `tvUrl`. The host phone declares the room's TV page with `useCastViewUrl`; the
  TV page `reportOgsRoom(room)` so the couch's other phones follow in via `ogsRoom=`.
- Seats come from verified game tokens (`verifyOgsToken`, `OGS_JWKS_URL` per environment). Plain
  browser: name form + room code, as before.
- Seat order: join order, shown on the TV; the host can reorder in the lobby to match the real couch.
- Sitting label: "Round N of 7". Silent while parked.
- `multiCouch`: not for the POC.

## Architecture (actor-kit v2, ported 2026-10-11)
- Cloudflare Worker + one Durable Object per room (`RoomActor`, `createActorClass(RoomContract)`);
  esbuild client bundles for `tv.tsx`, `join.tsx` and `start.tsx`.
- Pure engine in `src/game/` (cards, melds, round, game), no I/O, deterministic from a seed. The
  room actor (`src/room.ts`) only sequences it in phases: lobby → cutting → window ⇄ acting →
  roundOver → gameOver. Its timers (cut timeout 20 s, buy window 3 s, AI pauses) are durable and
  scoped to their phase: they survive eviction and deploys, so no screen ever has to wake the room.
  The shuffle seed and the room's own cut come from `ctx.random()`, so every room's journal replays.
- Server state keeps every hand and the deck; the room sends each caller its own view
  (`src/room.wire.ts`): a seated phone gets its own hand and nobody else's, the TV and guests get
  the table with counts.
- Identity: a page's `t` is its caller id. The Worker inlines it signed (`src/identity.ts`), and the
  page's socket (`/api/:code/ws?id&sig`) is opened as that id (`withCallerIdentity`). OGS identities
  arrive as the service message `OGS_CLAIM` after the Worker verifies the game token.
- Domain events in the journal: `WentDown`, `Bought`, `RoundScored`, `GameOver`.

## Deploying and rolling back
- The v2 rooms are a new Durable Object class (`RoomActor`, migration v3); v1's `Room` stays as a
  placeholder (`src/legacy-objects.ts`). v1 rooms are not carried over.
- Cloudflare refuses `wrangler rollback` across a Durable Object class change. To go back to v1,
  deploy the rollback branch (`rollback/actor-kit-v1`: v1 code plus the v3 migration and a
  `RoomActor` placeholder) with `wrangler deploy`.

## Done when (POC)
- A full 7-round game plays end to end on `wrangler dev` with a laptop TV and 3 phones on the LAN.
- Seam test plays a round over real WebSockets; engine mutation score reported.
- Then `/ogs-game` for the catalogue entry and art kit.
