# actor-kit v2 feedback from the Run Set Jimmy port

Port of Run Set Jimmy from actor-kit 0.52.6 (XState) to actor-kit v0.3, vendored from
`claude/v0.3` at `a384ecd` (packages still versioned 0.2.0). Each item: what I tried, what
happened, the workaround in this repo. Most important first.

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
