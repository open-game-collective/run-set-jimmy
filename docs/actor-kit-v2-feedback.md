# actor-kit v2 feedback from the Run Set Jimmy port

Port of Run Set Jimmy from actor-kit 0.52.6 (XState) to actor-kit v0.3. Each item: what I tried,
what happened, the workaround in this repo. Most important first.

## Round 3: `claude/v0.3` at `59e593d` (0.3.0-next.0)

Items 14, 15 and 18 are adopted: the round now lives in `playing`'s local (moves pass it with
`goto(..., { locals: { playing } })`, `stay`, `reenter`), views use `matches` / `localOf` from
`@actor-kit/core`, and the Worker's binding is `DurableObjectNamespace<InstanceType<typeof RoomActor>>`
(the hand-written stub is gone). 16, 17 (`scripts/vendor.sh`) and 19 need nothing here.

20. **One settle function cannot return a transition for handlers at different levels.** A move
    (at `playing`), the buy window's timer (at `playing.window`) and the AI's timer (at
    `playing.acting`) all end the same way: stay, switch child, re-arm, or end the round. But
    `ctx.goto` / `ctx.reenter` / `ctx.stay` are typed per level (`KeptLocals<SD, P, Target>`,
    the merged local), so a shared helper taking `ctx` would need `P` generic, and the conditional
    types don't resolve for a generic `P`. *Workaround:* `settle()` returns a plain plan
    (`over` / `stay` / `rearm` / `switch`) and each handler applies it with its own `ctx`: four
    near-identical blocks in `src/room.ts`. *Suggest:* a level-independent transition value
    (e.g. `transition.goto(path, shared, { locals })`) that any handler at or below the kept
    level may return, checked at runtime like the untyped `goto()`.

## Round 2: v0.3 final (`claude/v0.3` at `4181811`)

Items 1–13 below (round 1, on `a384ecd`) are fixed in v0.3 and taken up here: nested states,
roles on messages, typed send, typed `SimActor.state`, `spawnSync`, union/enum views that validate,
`actorClient<typeof C>({ roles, views })`, `enter` that changes shared state, `ctx.reenter`, the
rollback and node:sqlite notes in `docs/upgrading-0.3.md`. What still gets in the way:

14. **A transition cannot change a kept parent's local and switch its child.** The plan was to keep
    the round (`RoundState`) in `playing`'s local. Nearly every move both changes the round and
    switches `window` ⇄ `acting`: `goto(["playing", "acting"], …)` keeps `playing`'s local as it was
    (row 7), and a child's `enter` can only set its own local (`ctx.stay(shared, local)` in `enter`
    does not reach the levels above, unlike row 6 for handlers). *Workaround:* the round stays in
    shared state; `playing`'s local holds the round number (checked at every step by the fuzz).
    *Suggest:* `ctx.goto(target, shared, input, { local })` for the kept levels, or let `enter`'s
    `ctx.stay(shared, mergedLocal)` update the levels above it as row 6 does.

15. **`matches` / `localOf` only come from `@actor-kit/worker`, whose runtime imports zod**
    (`runtime/phases.ts`). The views module the client imports must stay zod-free, so it reads
    `st.phase.join(".")` and `st.locals.at(-1)` with small `Reflect.get` guards instead.
    *Suggest:* export them (and `PathsOf`, `MergedLocal`) from `@actor-kit/core` or a zod-free subpath.

16. **The zod-free client alone did not shrink the bundle.** `join.js` stayed ~840 KB: the game's
    own `import { z } from "zod"` (classic zod 4, one 3-field check in `pwa.ts`) pulls in ~450 KB
    because the `z` namespace keeps everything, locales included. *Workaround:* `zod/mini` in client
    code: `join.js` 860 → 411 KB (v1: 395 KB). *Suggest:* say so in the "Keep zod out of the client
    bundle" note of `docs/upgrading-0.3.md`.

17. **Packages are still versioned 0.2.0 on `claude/v0.3`.** Re-vendored tarballs have the same name
    as the previous build, so pnpm's lockfile does not notice a change. *Workaround:* tarballs renamed
    with the commit (`actor-kit-core-0.2.0-4181811.tgz`). *Suggest:* `0.3.0-next.N` versions.

18. **The Durable Object stub is still typed by hand in the Worker** (`RoomStub` in
    `src/worker.ts`, as in Codebreakers). Tried `DurableObjectNamespace<InstanceType<typeof RoomActor>>`
    (from `TypedActorClass`): `send` is typed, but `getSnapshot()` resolves to `never` (the RPC
    serialization types cannot map `snapshot: unknown`), so the page code cannot read `role` or the
    view. *Suggest:* type `getSnapshot` with the contract's view union and test the binding type.

## Round 1: v0.3 pre-merge (`claude/v0.3` at `a384ecd`, all fixed in `4181811`)

## Blocking or costly

1. **Rollback cannot cross the new DO class.** The port registers a new class (`RoomActor`,
   migration v3) as planned. Cloudflare refuses `wrangler rollback` to any version before a DO class
   lifecycle change (Workers docs, Rollbacks › Bindings). *Workaround:* roll back by deploying a
   prepared branch (v1 code plus the v3 migration and a `RoomActor` placeholder). *Suggest:*
   `docs/upgrading-0.3.md` should say "keep your DO class name if you need `wrangler rollback`".
   (Not an actor-kit bug, but every v1 → v2 port hits it.)

2. **`ContractMessages` leaves out state messages** (fixed on `claude/adr018-build` in `adc41c5`,
   not yet on `claude/v0.3`). `simulate().send` and the React `useSend` only accepted the two
   top-level messages, not DRAW, CUT and the rest. *Workaround:* tests widen the contract to
   `AnyContract` (`const ROOM: AnyContract = RoomContract`), and the client builds its context with
   `createActorContext<RoomWireView, RoomClientEvent>()` and its own Zod event union.

3. **`SimActor.state` has the wrong type for actors with states.** It is typed as what `init`
   returns (`RoomShared`), but the value is `{ shared, phase, local, stateTimers }`.
   *Workaround:* `src/test/room-state.ts` parses it with `z.custom<RoomState>` over the envelope.
   *Suggest:* type it `PhasedStateOf<kit, S>` when the contract has `states`.

4. **View schemas have no union, enum or record yet** (ADR-019 C). A card (`card | joker`) travels
   flat (`joker`, empty `suit`/`rank`), the phase as a string, and every screen needs the view
   parsed back into domain shapes. *Workaround:* `src/room.wire.ts` (`toWire` / `fromWire`).

5. **No validator from `schema()`.** The client must type the boot view (JSON inlined by the
   Worker) before `actorClient().create({ initialView })`. actor-kit's CLAUDE.md says schemas
   implement StandardSchemaV1; `packages/core/src/schema.ts` does not. *Workaround:* a hand-written
   Zod copy of the view schema (`RoomWireViewZ`) that must be kept in step with `RoomViewSchema`.
   *Suggest:* `schema()` exposes `~standard.validate` (or `parse`).

6. **`simulate().spawn` is always async**, even with no init links. Existing tests build rooms
   synchronously (`const room = createTestActor()`). *Workaround:* the helper pre-spawns 48 seeded
   rooms with top-level `await` and hands out `template.branch()` copies (`branch()` is sync and
   was perfect for this, and for "restart"). *Suggest:* a sync spawn when there are no init links.

7. **`@cloudflare/vitest-pool-workers` needs vitest 4**; this repo is on vitest 5, so the docs'
   integration-test path was unavailable (no downgrades). *Workaround:* `e2e/eviction.seam.test.ts`
   kills and restarts its own `wrangler dev` and reads the DO's SQLite with `node:sqlite`. The
   minimal `JournalSql` interface made `readJournal` work over `node:sqlite` in three lines, so the
   real journal also goes through `replayJournal`. Worth documenting as a recipe.

## Awkward API

8. **`enter` cannot change the shared state** (it returns only the local). Entering `cutting` must
   choose the cutter, entering `roundOver` must score the round: every handler that goes there has
   to do it first (`toCutting`, `scoreRound` in `src/room.ts`). *Suggest:* let `enter` return
   `{ shared, local }`, or add `exit`/`enter` shared updates (ADR-019 A adds `exit`).

9. **State messages ignore roles.** A message declared in a state is accepted from any role
   (`admitStepMessage` looks up the phase's messages before the role's), and flat top-level messages
   go to every role too. A guest or the TV can send DRAW. *Workaround:* every guard checks the
   caller (`isHost`, `isCutter`; moves from non-seated callers change nothing). *Suggest:* document
   it loudly, or allow `roles: [...]` on a state message.

10. **A move factory shared by two states is hard to type.** `PhaseHelpers` is not exported, so
    `moveMessages` takes `ReturnType<typeof kit.in<P>>` (an instantiation expression). Nested states
    (ADR-019 A) remove the need here, but exporting `PhaseHelpers` would help.

11. **`goto` to the current phase re-enters it** (cancels its state timers, runs `enter`). That is
    what an AI move needs (re-arm the pause), but it is not documented, and staying needs a manual
    `target === ctx.phase` check to avoid resetting the buy window. *Suggest:* document it, and
    maybe `ctx.reenter()`.

12. **Decoded views carry no role.** `client.role` has it, but a view object alone doesn't, and
    `getSnapshot` returns `role` beside the snapshot. *Workaround:* a `role` field in the view.

13. **zod 4 is required** (peer of `@actor-kit/worker`), so the game moved from zod 3. The client
    bundle grew from ~395 KB to ~860 KB: zod 4's classic build pulls in its locales when the contract
    (with its message schemas) is imported into the browser. *Suggest:* a note on keeping zod out of
    client bundles (a client-only contract type, or `zod/mini`).

## Worked well

- Durable phase-scoped timers removed v1's saved deadlines, RESUME handling and the clients' TICK
  nudge entirely; the eviction tests show the room carrying on with nobody connected.
- `simulate()` + `branch()` + `replayJournal()`: 44 room tests ported unchanged in behaviour, and
  1,000 fuzzed games replay exactly. The determinism guard found nothing because `ctx.random()`
  was easy to thread through.
- `withCallerIdentity` + signed ids (Codebreakers' pattern) was a small, clear Worker change.
