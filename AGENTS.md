# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Start Metro bundler (scan QR with Expo Go on phone)
npx expo start --ios    # Open in iOS Simulator
npx expo start --android # Open in Android emulator
npx expo start --web    # Open in browser
npm test                # Jest — pure logic in lib/ only (ts-jest, node env)
```

No lint command is configured. `npm test` is scoped to `lib/**/*.test.ts`
(pure modules, no React Native imports — no jest-expo / RN mocking). Component
tests, if added, would need a separate jest-expo project.

## Architecture

**Expo (React Native) + expo-router** finance app. Cloud-synced via Supabase,
no custom backend.

**Routing** (file-based, under `app/`):
- `index.ts` — entry point; `registerRootComponent`.
- `app/_layout.tsx` — root. Auth/onboarding/recovery phase machine, Supabase
  session + password-recovery deep links, `SafeAreaProvider`,
  `GestureHandlerRootView`, and a forced dark navigation theme.
- `app/(tabs)/_layout.tsx` — **material-top-tabs pager** (react-native-pager-view)
  via `withLayoutContext`. **Native:** a fixed center pill with a label
  strip translating under it, driven by the pager's live `position`
  (finger-tracked). **Web:** a left-aligned scrollable pill bar (the
  `WEB` branch in `_layout.tsx`). `withLayoutContext`'s 3rd arg is `true`
  so declared `<Screen>` children are the definitive route set; optional
  tabs are `setup.showX`-filtered. The navigator is `key`-ed on the
  visible set so a visibility toggle does a clean remount (avoids
  react-native-tab-view pager-vs-state desync).
- `app/(tabs)/*.tsx` — 8 screens. **Core (always shown):** `index`
  (Dashboard) and `recurrings` (Recurrings — sole owner of monthly-cost
  management: add/edit/delete, mark-paid + account picker), then
  `settings`. **Optional (`setup.showX`):** `investments`, `savings`,
  `revenue`, `debts`, `net-worth`. Dashboard shows a read-only costs
  summary that taps through to Recurrings.
- `app/+html.tsx` — web HTML shell incl. CSP.
- `app.json` — Expo config (`scheme: famescale`, `newArchEnabled: true`).

**Data layer** (`lib/`): each domain (dashboard, investments, savings, debts,
revenue, currency, setup, transactions) exposes the same shape:
- `getX()` — local read from profile-scoped AsyncStorage (`storage.ts`).
- `peekX()` — synchronous read of an in-memory cache (primed at sign-in in the
  root layout). Screens seed `useState` from this so the first paint already
  has real data.
- `refreshX()` — authoritative read from Supabase, writes back to local.
- `saveX()` — local + Supabase upsert (via `sync.ts` `reportable()` →
  `SyncIndicator`).
- `finance.ts` — pure, dependency-free money/logic (`fv`,
  `monthsSinceStart`, `computeNetWorth`, `resetStaleCosts`, `monthDiff`,
  `nextOccurrence`, `annualizedPeriodicTotal`); unit-tested
  (`finance.test.ts`, 52 cases). `userId()` lives in `supabase.ts`;
  `CURRENCIES` in `currencies.ts` — both deduped, don't re-inline.
- **A `Cost` has an `intervalMonths` (1 monthly default, 3 quarterly, 12
  yearly, N custom) and `dueMonth` (1–12 anchor for non-monthly; null for
  monthly).** Recurrings splits the list: monthly costs feed the hero +
  the Dashboard "Monthly Costs" summary; periodic (interval ≠ 1) bills are
  deliberately **excluded from the monthly figure** and shown in a separate
  "Periodic" card headlined by `annualizedPeriodicTotal` (Σ amount·12/N),
  sorted by `nextOccurrence`. Don't fold periodic back into the monthly
  number — it's an intentional product decision, not an oversight.
- Cost auto-reset (un-pay, no refund) runs inside
  `dashboard.refreshDashboard` — screen-independent, so it happens on any
  data load. Screens show the toast via `subscribeMonthlyReset`. A cost
  stays paid until `monthDiff(paidMonth, now) >= intervalMonths`, so
  monthly clears next month (legacy behavior — `intervalMonths` defaults 1
  via `?? 1`, so old rows are unaffected), quarterly after 3, yearly 12.
  (`setup.showRecurrings` gates the Recurrings tab — default true; the
  `MIGRATION_show_recurrings.sql` heal flips the legacy dead-flag `false`
  to `true` so existing users keep it. When off, the Dashboard's Monthly
  Costs summary card is hidden too, since it taps through to that tab;
  hero math is unchanged — costs still exist in data.)
- `supabase.ts` — client; anon key from `EXPO_PUBLIC_*` env. **RLS is the only
  access control.** All 8 tables use `FOR ALL ... USING/WITH CHECK
  (auth.uid() = user_id)`. Audit SQL at repo root: `SECURITY_VERIFY.sql`
  (read-only check), `SECURITY_TODO.sql`, `MIGRATION_*.sql`. Run
  `SECURITY_VERIFY.sql` in the Supabase SQL editor whenever a table is added.

**Stack:** Expo ~54, React 19, React Native 0.81, TypeScript strict, New
Architecture. expo-router 6, @react-navigation/material-top-tabs 7 +
react-native-pager-view, Supabase, gesture-handler/reanimated,
draggable-flatlist, safe-area-context.

## Conventions & gotchas

These are non-obvious and have bitten before — respect them:

- **Screens seed state from `peekX()`, not empty defaults.** Reverting to
  `useState([])`/`useState(DEFAULT)` reintroduces a first-visit layout bounce.
- **Tab screens use `<View>` + `useSafeAreaInsets()`, not `<SafeAreaView>`.**
  SafeAreaView committed `paddingTop: 0` for one frame → visible jump.
- **The dark navigation theme in `app/_layout.tsx` is load-bearing.**
  react-native-screens paints the native screen background from
  `theme.colors.background`; without it, tab transitions flash white.
- **Tab swipe is native (pager), not a JS gesture.** The navigator is
  `key`-ed on the visible-tab set: toggling a tab in Settings remounts it
  (screens re-seed from `peekX()` instantly; scroll resets — acceptable for a
  rare action). Don't try to "fix" the toggle with post-hoc `navigate()` —
  react-native-tab-view desyncs the pager view from nav state on runtime
  route-list changes; the remount is the working fix. `animationEnabled:false`
  keeps taps instant; swipe still animates regardless.
- **`@expo/cli` must match the Expo SDK major** (54.x — *not* 55). A mismatch
  ships a Metro whose HMR URL format Expo Go rejects, crashing the dev server.
- **UUIDs come from `newId()`** (`lib/dashboard.ts`, expo-crypto). Never
  `Math.random()`.
- react-native-draggable-flatlist@4.0.3 emits a cosmetic `measureLayout`
  warning under the New Architecture; it's suppressed via `LogBox.ignoreLogs`
  in `app/_layout.tsx`. Drag works — don't chase it.
