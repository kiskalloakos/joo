# joo — Store Listing Copy

Source of truth for the App Store and Google Play pages. This version leads
with the recurring-bills problem, then proves the broader money dashboard.

---

## Positioning

**joo is the calm, private money dashboard for people who want to see monthly
bills, savings, debt, and investments in one place — without a subscription.**

Use this idea consistently in screenshots, video, landing-page copy, and ads.
Do not claim tab reordering or tab hiding: the app has a fixed navigation.

---

## App name (App Store: 30 chars · Play title: 30 chars)

```
joo: Bills & Money
```

(18 characters)

This retains the brand while putting the highest-intent use case in the title.

---

## Subtitle (App Store only, 30 chars)

```
Bills, savings & debt—simple
```

(28 characters)

---

## Promotional text (App Store only, 170 chars)

```
See every monthly bill, savings goal, debt, and investment in one calm dashboard. Try everything free for 3 days, then pay $9.99 once—no subscription.
```

(160 characters)

---

## Short description (Google Play only, 80 chars)

```
Track bills, savings, debt and investments. $9.99 once. No subscriptions.
```

(76 characters)

---

## Keywords (App Store only, 100 chars total, comma-separated)

```
budget,expense,recurring,subscription,tracker,savings,investment,debt,monthly,personal finance
```

(95 characters)

`bills` and `money` are deliberately omitted here because they are in the app
name. Apple already indexes the name and subtitle; avoid spending keyword space
on duplicates.

---

## Full description (App Store: 4000 · Play: 4000)

```
Your money, clearly organized.

joo is a calm, private dashboard for the money you manage every month. See
what bills are due, what you are saving, what you owe, and how your investments
could grow — all in one place.

START WITH THE MONTHLY BILLS
• Track rent, subscriptions, utilities, and any other recurring cost.
• Add monthly, quarterly, yearly, or custom billing intervals.
• Mark bills paid and let joo reset them when their next cycle begins.
• See what is left to pay this month at a glance.

SEE THE BIGGER PICTURE
• Savings: set a balance, monthly contribution, and interest rate to project
  your progress.
• Debt: track what you owe and follow your payoff progress.
• Investments: model monthly contributions and compound-growth projections.
• Income: record revenue and income sources alongside the rest of your money.
• Use RON, USD, EUR, GBP, HUF, CHF, and more.

PRIVATE BY DEFAULT
No ads. No third-party analytics SDKs. No selling your data. Your data syncs
securely to your account so it is available across your devices.

SIMPLE, FAIR PRICING
Try every feature free for 3 days. After that, unlock joo forever for a single
$9.99 payment. No subscriptions. Ever.

Questions or feedback? akos@famescale.co
Privacy policy: https://famescale.co/privacy
```

---

## Screenshot plan (iPhone)

The first three images matter most: Apple uses them on the install sheet. Each
must be a fresh capture from the current build, with readable in-app content;
do not reuse the older assets that show the former `Goals` navigation.

| Upload order | Headline on image | Supporting line | Capture required |
| --- | --- | --- | --- |
| 1 | **See every monthly bill.** | One calm dashboard for what is due and what is paid. | Recurrings view with a believable list of monthly bills and the “left to pay” total. |
| 2 | **Save with a clear plan.** | See where consistent monthly contributions can take you. | Savings section of the Wealth screen, with projections visible. |
| 3 | **Make debt feel manageable.** | Track what you owe and watch your payoff progress. | Debts screen with an outstanding balance and progress. |
| 4 | **Watch your investments grow.** | Model 1-, 5-, and 10-year compound-growth projections. | Investments section, with the forecast cards visible. |
| 5 | **$9.99 once. No subscriptions.** | Try everything free for 3 days, then unlock joo forever. | A clean, truthful paywall or onboarding screen. |

For screenshot 1, use the words above rather than the more generic “Your money.
One place.” This is the highest-intent outcome and matches the first feature
people see after installing. Keep headline text high enough to avoid Store UI
overlap and show the product prominently below it.

---

## App preview (optional, 15–30 seconds)

Open on the recurring-bills view, mark one bill paid, switch to Savings and
Investment projections, then end on the one-time-price message. No spoken
voiceover is needed; use concise on-screen captions matching the screenshots.

---

## What's New / release notes (version 1.0.3)

```
New in this version:

• Meet Business: keep business income, accounts, and recurring costs together.
• Track money more flexibly with per-item currencies and clearer debt payoff progress.
• Refined navigation, dashboards, and account settings, plus reliability improvements.
```

---

## Apple-specific fields

| Field | Value |
| --- | --- |
| Primary category | Finance |
| Secondary category | Productivity (optional; omit if unavailable or inappropriate) |
| Age rating | 4+ |
| Content rights | You do not contain, show, or access third-party content |
| Privacy policy URL | https://famescale.co/privacy |
| Support URL | https://famescale.co/support |
| Marketing URL | https://famescale.co |
| Copyright | © 2026 Akos Kis-Kallo |

### App Privacy (data collected)

- Contact info → Email Address — Linked to user; used for account authentication.
- Financial info → Other Financial Info — Linked to user; used for app functionality.
- Not collected: location, contacts, photos, browsing history, search history,
  identifiers, usage data, diagnostics, or data for third-party tracking.
- Tracking: No.

---

## Google Play-specific fields

| Field | Value |
| --- | --- |
| App category | Finance |
| Tags | Budget Planner, Expense Tracker, Personal Finance |
| Contact email | akos@famescale.co |
| Website | https://famescale.co |
| Privacy policy | https://famescale.co/privacy |
| Content rating | Everyone |
| Target audience | 18+ |
| Ads | No |
| In-app purchases | Yes — one-time $9.99 lifetime unlock |

### Play Data safety

- Personal info → Email address — collected, encrypted in transit, deletable;
  used for account management.
- Financial info → Financial info (other) — collected, encrypted in transit,
  deletable; used for app functionality.
- No data is shared with third parties. Supabase is a service provider.

---

## In-app purchase

| Field | Value |
| --- | --- |
| Product ID | `co.famescale.joo.lifetime` |
| Type | Non-consumable (App Store) / one-time product (Play) |
| Display name | Lifetime |
| Description | Unlock joo forever with one payment. No subscription. |
| Price | $9.99 USD (and currency-equivalent tiers) |
| RevenueCat entitlement | `pro` |
| RevenueCat offering | `default` |
