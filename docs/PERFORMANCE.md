# Performance budget

"Fast, quick, crisp" is not a vibe here — it's the reason the architecture is
what it is (local SQLite mirror, pure engines with zero network calls on the
read path, Expo Go over EAS for iteration speed). This doc makes that a set
of numbers, and where relevant, an enforced test.

## Rules, not suggestions

1. **No `ScrollView` for a list of items — ever. Use `@shopify/flash-list`
   (`FlashList`, already installed at `^2.3.2`, excluded from Expo's strict
   version check on purpose — see `package.json`'s `expo.install.exclude`).**
   A `ScrollView` + `.map()` over an array renders every item immediately,
   with no recycling — it "works" during development with a handful of items
   and then visibly drops frames and balloons memory the moment a real
   library (65–200+ comics, per the seed catalog and the blueprint's own
   mockups) is on screen. This is a current, real violation:
   `LibraryScreen.tsx`, `PathsScreen.tsx`, `ComicDetailScreen.tsx`,
   `CompareScreen.tsx`, and `ProfileScreen.tsx` all use `ScrollView` for
   their grids/lists as of this writing — fix these before shipping, or the
   Library screen will be the first thing that feels slow.
2. **Nothing on Today, Library, Paths, or Compare ever awaits a network
   call.** Every read on those screens goes through a hook
   (`src/features/*/use*.ts`) that reads local SQLite only. If a screen needs
   something that isn't there yet (a live price, a fresh cover), show what's
   cached and let it update later — never block the first paint on it.
3. **Gesture-driven UI (`SlideSelect`, `SwipeCard` from the blueprint) must
   animate entirely on the UI thread** — every transform/opacity/width driven
   by a Reanimated shared value, zero `setState` during a drag. This is the
   whole reason the stack is on Reanimated 4 instead of `Animated`. Test it
   by wedging the JS thread for a few seconds (a tight loop behind a `__DEV__`
   button) and confirming the gesture still tracks the finger — if it stutters
   under that test, something upstream of the gesture is on the JS thread.
4. **No inline `withSpring`/`withTiming` config scattered across screens.**
   Motion presets belong in one place so the app has one consistent feel
   (see the blueprint's PRESS/SNAP/SHEET/COMMIT families) — add a
   `src/ui/motion.ts` with named presets rather than tuning springs ad hoc
   per screen.
5. **Cover images**: mirror at ~600px wide (never full-res), `expo-image`
   with `cachePolicy="memory-disk"`, prefetch what Today/Library will show
   next. A 2:3 cover at 600px is already 2x a 3-column grid cell on a 3x
   density screen — anything bigger is wasted decode time and memory for a
   comic app that may render hundreds of covers on one screen.

## Enforced numbers

| Thing | Budget | Status |
| --- | --- | --- |
| `pickToday()` over 500 works | ≤ 8ms average | **Enforced** — `src/lib/engines/__tests__/performance.spec.ts`, part of `npm test`. Currently ~0.5ms, 15x under budget. |
| `pickToday()` scaling | roughly linear in catalog size, not quadratic | **Enforced** — same file, compares 100 vs 1000 works. |
| Cold start → Today interactive | ≤ 1200ms on a mid-range Android | Not yet measurable (no real Today screen wired to a device build). Measure once the real Today screen replaces the `app/index.tsx` smoke test. Never await sync on boot — render from SQLite synchronously. |
| Library scroll, 500 covers | 0 dropped frames | Not yet measurable — blocked on switching `ScrollView` → `FlashList` (see rule 1). |
| Tab switch | ≤ 100ms perceived | Tabs should stay mounted (`react-native-screens` freezing inactive ones); lazy-mount screens that aren't Today on first focus. |
| APK size | ≤ 40MB | Check once a `--profile preview` build exists (R8 minify via `expo-build-properties`, fonts subset to Latin). |

## Why the backend already meets its half of this

- `useToday()`, `useLibrary()`, and friends never `await` anything — SQLite
  reads via `expo-sqlite`'s synchronous API (`getAllSync`/`.all()` through
  Drizzle) are fast enough that there's no async boundary to manage on the
  read path at all.
- The taste profile is a **cache** (`taste_profiles` table), not recomputed
  from the full event log on every Today open — see `getProfile()` in
  `src/lib/db/queries/profile.ts`.
- Engines are pure, allocate minimally, and are unit-tested for purity
  (`purity.spec.ts`) specifically so nothing added later can accidentally
  introduce a network call or a slow path into the scoring loop without a
  test catching it.

The remaining performance work is entirely in the UI layer — the five rules
above are what will actually determine whether the app feels fast on a real
phone.
