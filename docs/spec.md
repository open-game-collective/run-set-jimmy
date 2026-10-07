# Run Set Jimmy: POC spec

Rules: [RULES.md](../RULES.md) (the source of truth for play).

## Who and where
- **Audience:** extended family and friends: grown-ups, 2–7 players, mixed card-game experience.
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

## Architecture (copied from rocket-crew)
- Cloudflare Worker + one Durable Object per room through actor-kit; esbuild client bundles for
  `tv.tsx` and `join.tsx`.
- Pure engine in `src/game/` (cards, melds, round, game), no I/O, deterministic from a seed. The
  room machine only sequences it: deal on start, the 3 s buy-window timer (`closeBuyWindow`), round
  end → next deal, game end.
- Server state keeps every hand and the deck; each phone's private view carries only its own hand;
  the public view carries counts. Views are re-projected after every mutation.

## Done when (POC)
- A full 7-round game plays end to end on `wrangler dev` with a laptop TV and 3 phones on the LAN.
- Seam test plays a round over real WebSockets; engine mutation score reported.
- Then `/ogs-game` for the catalogue entry and art kit.
