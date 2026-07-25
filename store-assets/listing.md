# joo — Store Listing Copy

Source of truth for App Store Connect + Google Play listings. Edit freely,
then paste into each store. Character limits noted next to each field.

---

## App name (App Store: 30 chars · Play title: 30 chars)

```
joo — money, simply tracked
```
(28 chars)

Alt: `joo — finance, made simple` (26)

---

## Subtitle (App Store only, 30 chars)

```
Dashboard for your money.
```
(25 chars)

Alt: `Track money. Stay in control.` (29)

---

## Promotional text (App Store only, 170 chars, can change without re-review)

```
A clean, fast dashboard for your monthly costs, savings, investments, and debts. One-time $9.99 unlock — no subscriptions, ever.
```
(132 chars)

---

## Short description (Google Play only, 80 chars)

```
A clean dashboard for monthly costs, savings, investments, and debts.
```
(72 chars)

---

## Keywords (App Store only, 100 chars total, comma-separated, no spaces after commas)

```
budget,finance,money,expenses,recurring,subscriptions,savings,investments,debt,tracker
```
(96 chars)

---

## Full description (App Store: 4000 · Play: 4000)

```
joo is a calm, dark-themed dashboard for the money in your life.

Track what comes in, what goes out, what you're saving, what you owe, and
without spreadsheets, charts you don't read, or a
monthly subscription nagging you forever.

— WHAT YOU CAN TRACK
• Monthly and periodic recurring costs (rent, subscriptions, quarterly bills,
  annual renewals)
• Savings with monthly contributions and interest projections
• Investments with compound growth projections
• Debts and payoff progress
• Revenue / income sources

— HOW IT WORKS
• Add an account, drop in your numbers, and joo does the math.
• Mark recurring bills as paid — they auto-reset when the next cycle starts
  (monthly, quarterly, yearly, or any custom interval).
• Re-order tabs and hide what you don't use. Want only a costs tracker?
  Switch everything else off. Want the full picture? Turn it all on.
• Multi-currency support: RON, USD, EUR, GBP, HUF, CHF.

— PRIVATE BY DEFAULT
• No ads. No third-party analytics SDKs. No selling your data.
• Your financial data is yours — synced securely to your account so it
  stays with you across devices.
• Read our privacy policy: famescale.co/privacy

— PRICING
• Free 3-day trial of everything.
• One-time $9.99 lifetime unlock. No subscriptions. Ever.
• Your purchase restores across devices automatically.

Questions? akos@famescale.co
```
(1,476 chars — well under 4000)

---

## What's New / Release notes (per build, 4000 chars)

```
First release of joo. Thanks for trying it — feedback to akos@famescale.co.
```

---

## Apple-specific fields

| Field | Value |
| --- | --- |
| Primary category | Finance |
| Secondary category | (leave blank) |
| Age rating | 4+ (no objectionable content) |
| Content rights | You do not contain, show, or access third-party content |
| Privacy policy URL | https://famescale.co/privacy |
| Support URL | https://famescale.co/support |
| Marketing URL | (optional — leave blank or https://famescale.co) |
| Copyright | © 2026 Akos Kis-Kallo |

### App Privacy ("Data the app collects")
- Contact info → Email Address — Linked to user, used for App Functionality (account auth)
- Financial info → Other Financial Info — Linked to user, used for App Functionality (the data the app stores)
- **Not collected:** Location, Contacts, Photos, Browsing history, Search history, Identifiers, Usage Data, Diagnostics, Purchases (other than the app's own IAP).
- Tracking: **No** (we do not track users across apps/websites owned by other companies).

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
| Target audience | 18+ (or 13+ — recommend 18+ for finance apps) |
| Ads | No |
| In-app purchases | Yes ($9.99 lifetime) |

### Play Data safety
Same shape as App Store privacy:
- Personal info → Email address — Collected, encrypted in transit, optional
  deletion, used for Account management.
- Financial info → Financial info (other) — Collected, encrypted in transit,
  optional deletion, used for App functionality.
- No data shared with third parties (Supabase = processor, not "sharing").

---

## In-app purchase

| Field | Value |
| --- | --- |
| Product ID (both stores) | `co.famescale.joo.lifetime` |
| Type | Non-consumable (App Store) / One-time product (Play) |
| Reference name (internal) | Lifetime |
| Display name (shown to user) | Lifetime |
| Description | Unlock joo forever. One-time purchase, no subscriptions. |
| Price | $9.99 USD (and currency-equivalent tiers) |
| RevenueCat entitlement | `pro` |
| RevenueCat offering | `default` (mark lifetime package as the lifetime tier) |
