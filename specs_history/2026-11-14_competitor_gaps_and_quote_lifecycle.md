# Competitor Gap Analysis & Quote Lifecycle

**Date:** 2026-11-14
**Scope:** `database/`, `backend/app/`, `backend/tests/`, `frontend/src/`, `.github/`

---

## 1. Who the competitors are

Feature claims below come from vendor pages and directory listings found by web search on 2026-11-14. They are not independently verified.

| Group | Products | What they sell |
|---|---|---|
| Job-shop quoting platforms | Paperless Parts, DigiFabster, Uptool | Costing from CAD files and prints, BOMs and routers, pricing rules, ERP hand-off. Paperless Parts' "Wingman" reads emails, prints and models and flags requirements. |
| Inbox-to-quote AI | SpeedQuoteAI, Broadn, Cassidy, QuoteNexa, Stacksync | Read RFQ emails (some WhatsApp), price from a catalogue or rules, produce a quote in minutes. Broadn lists ERP/CRM integrations. Stacksync deliberately stops at preparing the packet for an estimator. |
| Proposal tools | PandaDoc, Proposify, Qwilr | Branded quote documents, a customer link, view tracking, e-signature and acceptance. |

AXRFLOWS sits in the second group. Its differentiator is WhatsApp as a first-class channel plus a knowledge base the customer uploads themselves.

## 2. Where AXRFLOWS fell short

| # | Gap | Status |
|---|---|---|
| 1 | The AI's arithmetic was trusted. `total_cost` was whatever the model wrote; line totals were never recomputed. | Fixed |
| 2 | Line items could not be edited. Only two lump sums (materials, labour) were editable and they did not have to agree with the lines. | Fixed |
| 3 | The recipient was a regex over the request text, invisible to the user, and could match the seller's own address. | Fixed |
| 4 | "Quote sent" was shown even when no email left: SMTP errors and missing credentials were swallowed and the quote was still marked dispatched. | Fixed |
| 5 | No quote number, validity date, discount or tax. | Fixed |
| 6 | No customer-facing quote. The customer got a plain-text email and nothing to print, accept or decline. | Fixed |
| 7 | No view tracking, no won/lost, no win rate, no response-time figure. | Fixed |
| 8 | WhatsApp sent AI-priced quotes to customers with no human check, including lines priced at 0. | Fixed (held for review when any line is unpriced) |
| 9 | Emails to customers carried the subject "AXRFLOWS Quotation", the vendor's name rather than the tenant's. | Fixed |
| 10 | "Start over" on a sent lead deleted the sent quote, erasing it from reports. | Fixed |
| 11 | Re-generating created duplicate drafts; the quote shown for a lead was an arbitrary one. | Fixed |
| 12 | No tests, no CI. | Fixed (29 backend tests, CI workflow) |
| 13 | Attachments on RFQ emails were ignored by the poller. | Fixed for PDF/CSV/XLSX text (scanned drawings and CAD files are named, not read) |
| 14 | Emails were not turned into leads and drafts automatically. | Fixed (opt-in, Settings > Automation) |
| 15 | The whole knowledge base was pasted into every prompt. | Fixed (capped at `KB_CONTEXT_MAX_CHARS`; most relevant sections kept) |
| 16 | No automatic follow-up emails. | Fixed (opt-in, one per quote) |
| 17 | No CRM/ERP integration or outbound webhooks. | Signed outbound webhook added; no native CRM/ERP connectors |
| 18 | No geometry-based costing from CAD files. | First step: DXF and STL are measured and priced from real geometry. No STEP/IGES, bends, nesting or feature recognition |
| 19 | No customer directory or per-customer price history. | Fixed (Customers page; history panel in the pipeline) |
| 20 | Gmail app passwords only. | Google and Microsoft sign-in built; needs OAuth client IDs before it can be used |

## 3. What changed

### Database: `database/migration_v6_quote_lifecycle.sql`
Adds to `quotes`: `quote_number`, `currency`, `subtotal`, `discount_percent`, `tax_percent`, `valid_until`, `customer_name/email/phone/company`, `review_notes`, `public_token`, `sent_at`, `first_viewed_at`, `last_viewed_at`, `view_count`, `outcome`, `outcome_source`, `responded_at`, `customer_comment`. Idempotent. The backend falls back to the old columns until it is run, so deploy order does not matter, but none of the new data is stored before then.

### Backend
- `app/services/pricing.py` (new): Decimal arithmetic. Line total = quantity x unit price; material/labour/other split; discount then tax; percentages clamped; garbage, NaN and negative inputs handled.
- `app/services/ai_engine.py`: model output now includes item category, a `needs_review` flag, customer details, missing information and assumptions. `finalize_engine_output` recomputes every figure and builds `review_notes` (unpriced lines, a mismatch between the model's total and its lines, gaps, assumptions). The prompt tells the model to treat the inquiry as data. Missing API key fails early with a clear message. The unused import-time client is gone.
- `app/api/quotes.py`:
  - `POST /quotes/generate` stores recipient, number, validity, token; replaces the previous unsent draft.
  - `PUT /quotes/{id}` takes line items, discount, tax, validity, recipient and reply text; totals are recomputed server-side; sent quotes are frozen (409).
  - `POST /quotes/{id}/dispatch` body `{mode, confirm_unpriced, include_link}`. Refuses zero-priced lines without confirmation (`unpriced_items`), refuses to claim an email was sent when no mailbox is connected (`no_mailbox`) or there is no recipient (`no_recipient`), and leaves the quote a draft if SMTP fails. `mode: "manual"` records the quote as sent without emailing. The subject uses the tenant's company name. A link to the online quote is appended.
  - `POST /quotes/{id}/outcome` staff marks won/lost.
  - `GET /quotes/analytics` win rate, quoted/won/open value, median time from request to quote, quotes with no answer after 3 days.
  - `GET /quotes/dispatched` no longer issues one query per quote; adds number, outcome, views, follow-up flag.
- `app/api/public.py` (new, unauthenticated, token in URL): `GET /public/quotes/{token}` returns the customer view and records the view (`?preview=true` does not count); `POST /public/quotes/{token}/respond` records accept/decline once, rejects drafts and expired quotes.
- `app/api/whatsapp.py`: uses the same pricing path; a quote with any unpriced line is saved as a draft for the pipeline and the customer is told a person will follow up.
- `app/api/leads.py`: re-import deletes drafts only.
- `app/main.py`: the database log handler stores WARNING and above (was a synchronous insert per INFO line).
- `GEMINI_MODEL` default is `gemini-2.5-flash`.

### Frontend
- `pages/PipelineWorkspace.tsx`: editable line items (description, type, quantity, unit price), add/remove lines, discount, tax, valid-until, "Send to" name and email, a "Check before sending" panel, live totals, preview of the customer page, and after sending: views, won/lost, copy customer link. Handles the three coded dispatch refusals with a follow-up question rather than a false success.
- `pages/PublicQuote.tsx` (new) at `/q/:token`: light, printable quote with accept/decline and an optional message.
- `pages/QuotationReports.tsx`: win rate, won value, time-to-quote tiles; quote number, outcome selector, view count and "Follow up" badge per row; CSV export includes the new columns.
- `pages/UserProfileSettings.tsx`: default tax % and quote validity days.

### Tests and CI
- `backend/tests/`: 29 tests. Pricing, engine post-processing, analytics, the public view, and handler-level tests through FastAPI's TestClient against an in-memory database stand-in (send safeguards, tenant isolation, accept-once, behaviour before the migration).
- `.github/workflows/ci.yml`: backend tests and frontend build on every push.

### Second pass (same day): automation
- `database/migration_v7_automation.sql`: `company_settings` (service-role only), `quotes.follow_up_sent_at`, message index.
- `app/services/kb_retrieval.py`, `app/services/automation.py`, `app/api/automation.py` (`GET/PUT /api/automation`).
- Poller reads PDF/CSV/XLSX attachments into the request text, auto-drafts when enabled (max 5 per pass, skips no-reply senders), and runs follow-ups every `FOLLOW_UP_CHECK_INTERVAL_SECONDS`.
- Webhook events `quote.sent`, `quote.accepted`, `quote.declined`; https and public addresses only; `X-Webhook-Signature: sha256=HMAC(secret, body)`.
- Password change requires the current password. WhatsApp rate limit is also enforced from the database, so it holds across workers.
- Dashboard rebuilt; smooth scrolling; 52 backend tests.

### Third pass (2026-11-15): part files, customers, mailbox sign-in
- `app/services/geometry.py`: DXF (cut length, contours/pierces, blank size, unit conversion) and STL (volume, surface area, bounding box). `POST /api/leads/{id}/part-file` appends the measurements to the request; DXF/STL email attachments are measured the same way. The file is not stored.
- `app/api/customers.py`: `GET /api/customers`, `GET /api/customers/history?key=`. Derived from quotes; no new table.
- `database/migration_v8_mail_oauth.sql`, `app/services/mail_oauth.py`, `app/api/oauth.py`: OAuth 2.0 with XOAUTH2 over the existing IMAP/SMTP paths. Env: `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_CLIENT_ID/SECRET`.
- Frontend: `pages/Customers.tsx`, part-file button and "Previously quoted" panel in the pipeline, sign-in buttons in Settings.
- 67 backend tests. Mailbox sign-in has not been run against Google or Microsoft.

## 4. Deploy steps
1. Run `database/migration_v6_quote_lifecycle.sql`, then `database/migration_v7_automation.sql` and `database/migration_v8_mail_oauth.sql`, in the Supabase SQL editor.
2. Set `FRONTEND_URL` on the backend to the public frontend address. Customer links are built from it; without it no link is added to emails.
3. Deploy backend and frontend.

## 5. Not verified
- No live run against Supabase, Gemini, Gmail or Twilio. The migration has not been executed.
- The new screens type-check and build but were not viewed in a browser (no usable headless browser on this machine).
- Gemini's handling of the larger structured-output schema is untested; the JSON-mode fallback covers a refusal.
