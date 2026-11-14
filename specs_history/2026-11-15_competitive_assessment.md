# Competitive Assessment: Weakest Point and USP

**Date:** 2026-11-15
**Basis:** Two days of work in this codebase and running it locally, plus vendor research from web searches on 2026-11-14.
**Limits:** Competitor claims come from their own marketing pages and directory listings. None of their products were used or tested. This is a judgement, not a measured benchmark.

---

## 1. Verdict

- **Weakest point:** the product has never worked end to end for a real customer. The problem is trust and reliability, not missing features.
- **USP:** WhatsApp-first quoting with self-serve setup, for small businesses in markets where customers ask for prices on WhatsApp.
- **Target (decided):** international small and mid-size businesses, up to US$500 setup and US$100 per month. See section 6.

---

## 2. Weakest point: trust and reliability

A quoting tool sends prices to customers under the owner's name. It has to be boringly reliable. Evidence from 2026-11-14 and 2026-11-15:

| Problem | What happened |
|---|---|
| Nothing has run in production | In two days of local use, quoting failed three separate ways: a Gemini key disabled by Google as leaked, a retired model (`gemini-2.5-flash`), and an exhausted quota on `gemini-3.8-flash`. |
| WhatsApp did not work | Twilio rejected the saved credentials (401), and the backend was only reachable on `127.0.0.1`, so nothing could be received. |
| Inbox was unreadable | HTML emails were stored and shown as raw markup. |
| Speed | A quote took 27 to 105 seconds in tests, on a free-tier Gemini key. SpeedQuoteAI and Broadn advertise 1 to 2 minutes from inbox to sent quote; here that is the AI step alone, before human review. |
| Accuracy is unproven | The AI reads a pasted document. There is no test set of real requests with known correct prices, so no accuracy figure can be stated to a buyer. |
| Security history | Secrets were committed to git; one was already disabled by Google. Tenants are separated by application code (service-role key), not by the database. |
| Database state | `migration_v4.sql` was never applied (`app_settings` table missing). v5 and v6 are unconfirmed. |
| Hosting | Runs on a laptop behind a free ngrok address, with Gmail app passwords. |

Most of the individual faults above were fixed in code during these two days. The underlying weakness remains: none of it has been proven with a real business over time.

---

## 3. Where competitors are ahead

| Area | Competitors | This app |
|---|---|---|
| Costing from CAD | Paperless Parts, DigiFabster: part files, BOMs, routing | DXF and STL measurements only. No STEP, bends, nesting or feature recognition |
| ERP / CRM integration | Broadn lists SAP, Salesforce, QuickBooks, Shopify | One generic signed webhook |
| Catalogue scale | Broadn claims 20,000+ SKUs | One document; trimmed to the most relevant sections past 60,000 characters |
| Quote documents | PandaDoc, Proposify, Qwilr: e-signature, branded templates, payments | A plain accept / decline page |
| Proof | Paperless Parts has paying shops and published reviews | No customers, reviews or case study |
| Mailbox setup | OAuth sign-in | App passwords. OAuth is built but has never been run against Google or Microsoft |
| Setup speed | One vendor quotes 3 to 4 weeks to a first workflow; Paperless Parts maps the process before proposing a plan | Same day (see USP) |

The CAD and ERP gaps are not realistically closable. Paperless Parts' costing engine is years of work.

---

## 4. USP

**WhatsApp-first quoting with self-serve setup, for small businesses where customers ask for prices on WhatsApp.**

1. **WhatsApp as a real channel.** The manufacturing quoting tools are email and CAD first. Broadn mentions WhatsApp, but as part of an enterprise product.
2. **Any price list, no implementation project.** Upload a PDF, Excel or CSV and quote the same day.
3. **Not tied to one industry.** The same engine priced metal brackets and, with a furniture price list in PKR, beds and sofas.
4. **Cheap to run.** SpeedQuoteAI lists a starting price of US$750. This can be sold well below that.

**How durable this is:** not very. The USP is a market position, not a technology. The features could be copied in weeks. What is harder to copy is local distribution, local language and pricing for that market.

---

## 5. Recommended next steps

1. Stop adding features. There is more surface area than has been verified.
2. Deploy properly: real hosting, all migrations applied (v4 to v8), secrets rotated, a paid Gemini key.
3. Get one real business using it for two weeks, such as a furniture maker or fabricator in Karachi, on WhatsApp.
4. Measure three numbers there: time from message to sent quote, share of quotes sent without price edits, and win rate. These become the sales pitch.
5. Pick the niche and state it plainly. "Quotes on WhatsApp in minutes for Pakistani workshops" is stronger than "AI quoting platform".

---

## 6. Target market and pricing (decided 2026-11-15)

**Decision:** sell internationally to businesses willing to pay up to **US$500 setup and US$100 per month**.

This answers the earlier open question: the buyer is a small or mid-size business, not a mid-size manufacturer with an ERP. The CAD and ERP gaps in section 3 therefore stop being the priority. The points below are judgement, not researched figures.

### What the price implies
- The $500 setup is a done-for-you onboarding: load the price list, connect the mailbox and WhatsApp number, run test quotes until prices are right. The pitch becomes "live in 48 hours, set up for you".
- $100 a month has to pay for itself with one extra won job. Realistic for a business sending 30 or more quotes a month for custom-priced work; a hard sell below that.
- Running costs are low: AI cost per quote is cents. The real costs are hosting, WhatsApp message fees and support time.
- The price sits between proposal tools (from about $19 per user) and SpeedQuoteAI (listed from $750), so the product must clearly be more than a document tool.

### Who to sell to
- **Trades:** furniture and joinery, kitchens, metal fabrication, signage, printing, glass and aluminium, event and stand builders. Common trait: custom work quoted from a price list, customers already on WhatsApp.
- **Regions:** the Gulf (UAE, Saudi Arabia), the UK and southern Europe, Latin America, South Africa.
- **Not first:** the US. WhatsApp is weak there and it is the home market of the email-first competitors.

### What blocks selling today
1. **No billing.** No subscription payments or plan limits exist.
2. **Not deployed.** Needs real hosting, backups, monitoring and migrations v4 to v8 applied.
3. **Mailbox connection.** App passwords are not acceptable for paying customers. Google sign-in for full mailbox access needs a paid security review. Cheaper route: a forwarding address per customer for incoming mail, and outgoing mail through an email service on the customer's domain.
4. **WhatsApp onboarding.** Customers cannot be asked to paste Twilio credentials. Each needs their own WhatsApp Business number, set up as part of the $500.
5. **Legal basics.** Terms of service, privacy policy and a data processing agreement, because the app holds customers' names, phone numbers and emails.
6. **Tenant separation and secrets.** Rotate the leaked keys and tighten isolation before a second paying company is onboarded.
7. **Language.** The AI can reply in the customer's language; the app interface is English only.

### Sequence
1. Deploy, rotate secrets, apply migrations.
2. Sign three pilot customers in one trade and one region; waive the setup fee in exchange for a case study and their numbers.
3. Build billing once a pilot says they would pay. A pilot can be invoiced by hand.
4. Solve mailbox and WhatsApp onboarding properly before customer four.

**Next session starts with:** deployment (hosting choice still to be made).

---

## 7. Sources

Vendor and directory pages found on 2026-11-14. Feature and pricing claims are the vendors' own.

- Paperless Parts: https://www.paperlessparts.com/pricing-costing-automation/ and https://paperlessparts.com/blog/paperless-parts-wingman-your-new-ai-powered-partner-in-quoting
- DigiFabster AI Quote Agent: https://digifabster.com/products/ai-quote-agent/
- SpeedQuoteAI (Capterra listing): https://www.capterra.ca/software/1104898/SpeedQuoteAI
- Broadn: https://broadn.io/ and https://sourceforge.net/software/product/broadn/
- Cassidy: https://www.cassidyai.com/solutions/ai-inside-sales-quote-agent
- Stacksync: https://www.stacksync.com/use-case/metal-fabrication-ai-rfq-intake
- PandaDoc, Proposify, Qwilr (G2 comparison): https://www.g2.com/compare/pandadoc-vs-proposify-vs-qwilr

Related: `specs_history/2026-11-14_competitor_gaps_and_quote_lifecycle.md` (feature-by-feature gap table and change log).
