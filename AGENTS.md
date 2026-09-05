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
- `app/(tabs)/_layout.tsx` — iOS-native `NativeTabs` bottom navigation.
  Its triggers are a fixed, static route list: Dashboard (which includes
  Recurrings), Wealth (Investments + Savings), Debts, and Revenue. Projects
  is permanently available through iOS's native More tab. Settings lives
  outside the tab navigator and is opened from the native top-right gear
  button.
- `app/(tabs)/*.tsx` — 7 permanent app screens: `index` (Dashboard, followed
  by the full Recurrings experience), `recurrings` (the embedded monthly-cost
  manager: add/edit/delete, mark-paid + account picker), `investments`,
  `savings`, `revenue`, `debts`, and `projects`. Investments renders Savings
  immediately beneath it as the combined Wealth screen; Recurrings and Savings
  have no standalone tab triggers. `app/settings.tsx` is a stack screen, not
  a tab.
- `app/+html.tsx` — web HTML shell incl. CSP.
- `app.json` — Expo config (`scheme: famescale`, React Compiler enabled).

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
  `monthsSinceStart`, `resetStaleCosts`, `monthDiff`,
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
- `supabase.ts` — client; anon key from `EXPO_PUBLIC_*` env. **RLS is the only
  access control.** All 8 tables use `FOR ALL ... USING/WITH CHECK
  (auth.uid() = user_id)`. Audit SQL at repo root: `SECURITY_VERIFY.sql`
  (read-only check), `SECURITY_TODO.sql`, `MIGRATION_*.sql`. Run
  `SECURITY_VERIFY.sql` in the Supabase SQL editor whenever a table is added.

**Stack:** Expo ~57, React 19.2, React Native 0.86, TypeScript strict, New
Architecture. expo-router 57 (including iOS-native tabs), Supabase,
gesture-handler/reanimated,
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
- **The bottom navigation is native and fixed.** Do not add page hiding,
  reordering, or runtime-generated `NativeTabs.Trigger` entries; NativeTabs
  requires its route list to be static.
- **`@expo/cli` must match the Expo SDK major** (57.x). A mismatch
  ships a Metro whose HMR URL format Expo Go rejects, crashing the dev server.
- **UUIDs come from `newId()`** (`lib/dashboard.ts`, expo-crypto). Never
  `Math.random()`.
- react-native-draggable-flatlist@4.0.3 emits a cosmetic `measureLayout`
  warning under the New Architecture; it's suppressed via `LogBox.ignoreLogs`
  in `app/_layout.tsx`. Drag works — don't chase it.
