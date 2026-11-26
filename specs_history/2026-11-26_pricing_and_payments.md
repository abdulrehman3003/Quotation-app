# Pricing, payments and client-acquisition readiness — 2026-11-26

Follows section 6 of `2026-11-15_competitive_assessment.md`. Prices are judgement, not market research.

## 1. Public pricing (added to the landing page)

| Plan | Monthly | Yearly (2 months free) | Setup | For |
|---|---|---|---|---|
| Starter | $59 | $49/mo ($588/yr) | $249 | Small team, email only, 2 users, 150 quotes/mo |
| Growth (most popular) | $99 | $82/mo ($984/yr) | $499 | Email + WhatsApp set up for you, 5 users, 500 quotes/mo, automation |
| Scale | from $249 | from $207/mo | quoted | Several branches, unlimited users, custom rules, webhooks |

- Growth is the plan the business is built around ($500 setup, about $100/month), and it is the one to sell.
- Founding offer: setup fee waived for the first three customers in exchange for a case study, matching the pilot plan in the 2026-11-15 assessment.
- Meta's WhatsApp conversation fees are passed on at cost.
- **Plan limits (users, quotes a month) are not enforced in the app.** They are fair-use terms in the contract for now. Enforce them in code once there are more than a handful of customers.
- The Scale "Talk to us" button emails `SALES_EMAIL` in `LandingPage.tsx`, currently `sales@axrflows.com`. Replace it with a real inbox.

## 2. Payment collection decision

**No payment gateway for the first customers.** Sign a contract, then invoice through Payoneer: a "request a payment" link the client pays by card or bank transfer. Build self-serve billing only once manual invoicing becomes the bottleneck (roughly 10 or more customers), or when a client insists on automatic card billing.

Reasons:
- With done-for-you setup, every customer talks to you before paying, so checkout adds nothing yet.
- Stripe does not onboard businesses in every country, and Stripe Atlas (a US company) adds cost and paperwork that isn't justified before revenue.
- A merchant of record (Paddle, Lemon Squeezy) is the right next step when self-serve billing is needed: it charges cards and collects VAT/GST worldwide on your behalf. Check its current payout and country support before choosing.

## 3. Steps to collect payment through Payoneer

1. Payoneer business account fully verified (identity and business documents), and receiving set up in USD (plus EUR/GBP if selling to Europe or the UK).
2. Paperwork, one template of each:
   - Order form / proposal: plan, setup fee, monthly fee, start date, payment terms (setup 100% upfront; monthly in advance; 7-day due date)
   - Master service agreement / terms of service: cancellation, fair-use limits, liability cap, governing law
   - Privacy policy and data processing agreement. The app stores customers' contacts, which matters for clients in the EU, UK and Gulf.
3. Invoicing routine: invoice the setup fee on signature and start work after payment. Then invoice monthly on the same date, or offer annual upfront (2 months free) to reduce chasing. Payoneer payment requests are not true auto-renewing subscriptions.
4. Non-payment policy: reminder at +3 days, service paused at +14 days. Today the app has no "suspended" flag. Pause by disabling the company's users in the admin panel, or add a `companies.status` column later.
5. Tax and accounts: keep a record of each invoice and receipt, and ask a local accountant how export-of-services income is taxed and whether registering as a software or IT exporter lowers the rate.
6. Track it: a simple spreadsheet with customer, plan, next invoice date, paid or unpaid.

## 4. Why prospects would not buy today (summary)

1. Not deployed on a real domain: no live demo to send.
2. Landing copy is jargon ("ingest", "knowledge models", "deploy your engine") instead of the buyer's outcome ("reply to every quote request in minutes").
3. No proof: no customers, case study, demo video or screenshots of a real quote. The ROI figures in the sandbox (18% boost) have no source.
4. Some claims go beyond the product. "How it works" step 2 describes mapping Excel columns, and the FAQ promises "encryption at rest" across all resources. Make them match what the app does.
5. Privacy and Terms links go nowhere; there's no company address or contact.
6. Self-serve sign-up drops the visitor into an empty workspace with integrations to configure, while the offer is "we set it up for you". The main call to action should be "Book a 20-minute demo".
7. Operational gaps: missing migrations on the database, the temporary admin, unrotated secrets, untested Google/Microsoft sign-in.
8. Prompts and examples are written for metal fabrication. Pick one trade and one region (assessment §6) and tailor the copy, examples and demo data to it.
