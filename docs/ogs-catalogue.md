# Adding Run Set Jimmy to the OGS catalogue

Not done yet: it's a pull request to `open-game-system/open-game-system` and needs Jon's go-ahead,
after a deploy to `https://run-set-jimmy.jonathanrmumm.workers.dev/`
(ogs-docs.pages.dev/art-and-catalogue.md#submit-to-the-catalogue).

1. **Red:** in `services/api/test/catalogue.test.ts`, add `"run-set-jimmy"` to `GAMES` and to
   `ADULT_GAMES` (grown-ups only). `pnpm --filter @open-game-system/api test` fails.
2. **Art:** copy `assets/ogs/run-set-jimmy/*` (icon.png, cover.jpg, logo.png, hero-clean.jpg,
   tv.jpg) to `apps/tv/public/art/run-set-jimmy/`.
3. **Green:** add to `SEED` in `services/api/src/catalogue.ts`:

```ts
  {
    appId: "run-set-jimmy",
    name: "Run Set Jimmy",
    tagline: "Seven rounds of runs and sets. Lowest score wins.",
    shape: "couch",
    tv: "required",
    startUrl: workers("run-set-jimmy"),
    multiCouch: true,
    roles: [{ id: "player", label: "Player", audience: "grownup" }],
    art: {
      icon: "/art/run-set-jimmy/icon.png",
      cover: "/art/run-set-jimmy/cover.jpg",
      logo: "/art/run-set-jimmy/logo.png",
      heroClean: "/art/run-set-jimmy/hero-clean.jpg",
      tile: "/art/run-set-jimmy/tv.jpg",
      hero: "/art/run-set-jimmy/tv.jpg",
    },
    shop: { ages: "10+", minutes: [45, 90], players: "2-7" },
  },
```

4. `pnpm typecheck && pnpm lint && pnpm test`, then the PR, listing the rules checked and linking
   `e2e/ogs.seam.test.ts` and `e2e/tv-layout.seam.test.ts`.
