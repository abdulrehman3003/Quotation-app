# AXRFLOWS Quotation App — Project Notes

_Collected 2026-11-12 from a full read of the repo at commit `68317db` (master)._

## 1. What it is

A multi-tenant B2B SaaS that turns unstructured customer inquiries (manual entry, Gmail inbox, generic webhook, WhatsApp) into **priced quotes plus a drafted reply email**, using an LLM (Google Gemini through its OpenAI-compatible endpoint). The price sheets come from a per-company **Knowledge Base** of uploaded CSV/XLSX/PDF files. The domain prompts are written for metal fabrication: steel brackets, welding, plates.

Core loop: **Lead → (AI) Quote draft → human edits → Dispatch (SMTP email) → Reports/CSV**.

## 2. Repo layout (~9.3k LOC, 54 tracked files, 7 commits)

```
backend/    FastAPI + supabase-py + openai SDK (Python ≥3.11, uv)
  app/main.py              app, CORS, security headers, DB log handler, starts email poller
  app/core/config.py       pydantic-settings (env vars)
  app/core/security.py     get_current_user (JWT HS256 → fallback supabase.auth.get_user)
  app/core/encryption.py   Fernet key derived from SHA-256(SUPABASE_JWT_SECRET)
  app/core/credentials.py  credential resolution: user → env → any admin user in DB
  app/api/{leads,quotes,kb,emails,whatsapp,admin,users}.py
  app/services/ai_engine.py    run_quote_engine (structured output → JSON-mode fallback)
  app/services/email_poller.py IMAP poll thread (every 30s)
  app/services/parser.py       CSV/XLSX/PDF → text (pandas, openpyxl, pypdf)
  app/schemas/pydantic_models.py
  Dockerfile               uv alpine image, gunicorn 4 uvicorn workers :8000
database/   schema.sql → schema_extension.sql → migration_v2.sql → migration_v3_multitenancy.sql
frontend/   React 18 + Vite 8 + TS + Tailwind 3 + Zustand + react-router 6 + lucide
  src/store/workspaceStore.ts  ALL backend calls (≈830 lines, single store)
  src/store/authStore.ts       Supabase session
  src/pages/*                  Landing, Auth, Dashboard, PipelineWorkspace, KnowledgeBase,
                               Emails, WhatsAppDashboard, QuotationReports, UserProfileSettings, AdminPanel
  vercel.json                  SPA rewrite (frontend is deployed to Vercel)
```

No tests, no CI, no README (pyproject references a `README.md` that doesn't exist), no lint config.

## 3. Running it

**Backend** (`backend/.env`, see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (required); `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-1.5-flash`); optional `TWILIO_*`, `GMAIL_EMAIL`, `GMAIL_APP_PASSWORD`, `FRONTEND_URL`, `HOST`/`PORT`.
Env vars that are read but not in `.env.example`: `CORS_ORIGINS` (comma list), `WEBHOOK_SECRET_TOKEN`, `ENV` (must be `production` to disable the admin bypass; see §8).
- Dev: `cd backend && uv sync && uv run python -m app.main` (127.0.0.1:8000, reload)
- Docker: built from the **repo root** context (`COPY backend/...`): `docker build -f backend/Dockerfile .`

**Frontend** (`frontend/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`.
- `cd frontend && npm i && npm run dev` (127.0.0.1:5173). Build = `tsc && vite build`.
- Admin portal: `http://admin.localhost:5173` (subdomain mode) or `/admin` path.

**Database**: Supabase. Run the SQL files in order in the SQL editor. The `knowledge_base` storage bucket is created by `schema.sql`. Note that `schema_extension.sql` repeats tables already in `schema.sql`, and its `create policy` statements will error if both files are run. It also seeds two mock emails. `migration_v2` makes the oldest user an `admin`.

## 4. Data model (after v3)

| Table | Key columns / notes |
|---|---|
| `companies` | default tenant `00000000-0000-0000-0000-000000000000` ("Default Company") |
| `users` | mirrors `auth.users` via trigger `handle_new_user` (assigns default company); `name, phone_number, role ('user'/'admin'), company_id, default_quote_parameters jsonb`, `encrypted_{gemini_key,gmail_email,gmail_password,twilio_sid,twilio_token,twilio_phone}` |
| `leads` | `source` manual/email/webhook/whatsapp; `status` pending → processed / failed → dispatched |
| `quotes` | `lead_id`, material/labor/total numeric(12,2), `itemized_breakdown jsonb`, `email_draft`, `status` draft/dispatched |
| `knowledge_base` | `filename, file_path (userId/ts_name), content_type csv/xlsx/pdf, parsed_content` |
| `customer_emails` | inbox items; status unread/imported/replied |
| `whatsapp_chats` | `phone_number, customer_name, status active_ai/human_required`; unique(user_id, phone_number) |
| `whatsapp_messages` | `chat_id, sender customer/system/agent, text` |
| `dispatched_quotes` | reporting rows written on dispatch (but the Reports page reads `quotes` instead; see §9) |
| `system_logs` | backend logging handler + frontend `POST /api/admin/logs` |

v3 sets `company_id NOT NULL` on all data tables **with no default**. RLS isolates by `get_user_company()`, but the backend uses the **service-role key everywhere**, so RLS is bypassed and isolation depends entirely on the `.eq("company_id", ...)` filters in the Python code. The frontend talks to Supabase directly only for auth and storage uploads.

Global pricing settings (`base_labor_rate` 50.0, `base_material_markup` 1.2) live in a **JSON file** `backend/app/core/global_settings.json`, not in the DB. In Docker with 4 workers this file is per-container and is lost on redeploy.

## 5. Backend API (all under `/api`)

| Router | Endpoints |
|---|---|
| leads | `POST ""`, `GET ""`, `GET /{id}`, `DELETE /{id}`, `POST /webhook` (public, optional `X-Webhook-Token`), `POST /{id}/reimport` |
| quotes | `POST /generate {lead_id}`, `GET ""`, `GET /lead/{lead_id}`, `PUT /{id}`, `POST /{id}/dispatch`, `GET /dispatched` |
| kb | `POST /process?file_path&filename`, `GET ""`, `PUT /{id}`, `DELETE /{id}` |
| emails | `GET ""` (limit 50), `POST /{id}/transfer`, `POST /{id}/reply {reply_body}` |
| whatsapp | `POST /webhook` (public, Twilio form), `GET /chats`, `GET /chats/{id}/messages`, `POST /chats/{id}/send`, `POST /chats/{id}/takeover`, `GET /export` (CSV) |
| users | `GET/PUT /profile`, `PUT /change-password` |
| admin | `GET/POST /users`, `PUT/DELETE /users/{id}`, `GET /system-status`, `GET/POST /logs`, `GET/POST /settings` |
| — | `GET /health` |

Auth: `get_current_user` returns `{id, email, company_id}`. The admin routes use `verify_admin` instead (see §8).

## 6. Key flows

**AI quote engine** (`services/ai_engine.py`)
- Builds the system prompt: labor rate and markup from global settings; the KB is "ground truth"; **items missing from the KB must be priced 0 and flagged for a human**; an optional signature from the user profile; no trailing `---`.
- Tries `client.beta.chat.completions.parse(response_format=QuoteEngineOutput)` at temperature 0.2. If that fails, it falls back to `json_object` mode with manual Pydantic validation, then strips trailing separators from the draft.
- The entire KB of the company is concatenated into the prompt. There is no chunking or retrieval, so the token cost grows with every uploaded file.
- A module-level `client` is created at import and never used (the per-call client is used instead). At import it also calls `get_gemini_api_key()`, which queries the DB.

**Credential resolution** (`core/credentials.py`): user's own encrypted creds → env vars → **the first admin user in the DB that has any credentials**. So every tenant silently uses the admin's Gemini, Gmail and Twilio accounts when they haven't configured their own.

**KB upload**: the frontend uploads to Supabase storage `knowledge_base/{userId}/{ts}_{name}` (5 MB client-side limit). Then `POST /kb/process` checks the `{user_id}/` prefix, downloads, parses and inserts. The KB page has a CSV grid editor; saving re-serializes to CSV and overwrites `parsed_content` (the original file in storage is not changed).

**Email ingestion**: a daemon thread (`email_poller`) starts on app startup. Every 30 s it reads **all** users, decrypts their Gmail creds, IMAP-fetches unseen mail, inserts rows into `customer_emails`, and marks them seen. It also polls the fallback/admin mailbox on behalf of the first user. Emails page: "transfer" copies an email into `leads`; "reply" sends over SMTP_SSL (smtp.gmail.com:465) using the user's creds, or the fallback, or a simulated send.

**Dispatch** (`POST /quotes/{id}/dispatch`): regex-extracts the email, phone and name from `lead.raw_text`, sends `email_draft` by SMTP, inserts a `dispatched_quotes` row, and sets lead and quote to `dispatched`. If no email is found, the frontend copies the draft to the clipboard instead.

**WhatsApp webhook**: resolves the tenant (header `x-simulated-user-id` → match decrypted `encrypted_twilio_phone` against `To` → an existing chat by phone → **first user in the DB**). Then, in order:
1. In-memory rate limit: 5 msgs per 60 s per phone.
2. Gets or creates the chat and stores the message.
3. An escalation keyword (`human`, `agent`, `support`…) sets `human_required`.
4. In `human_required` mode it doesn't auto-reply.
5. A quote keyword (`quote`, `price`, `steel`…) runs the full quote engine, inserts a lead, quote and dispatched_quotes row, and replies with an itemized summary.
6. Otherwise it sends a short guarded Gemini reply (≤120 words).

Outbound messages go through the Twilio REST API (3 s timeout) or a mock log. The frontend has a "simulate inbound message" modal that posts to the webhook.

**Frontend polling**: the Sidebar polls emails and chats every 12 s on every page and builds bell notifications. The open WhatsApp chat polls messages every 4 s.

## 7. Frontend notes

- One big Zustand store (`workspaceStore.ts`) holds all API calls. `getAuthHeaders()` sends `X-Admin-Auth: admin` when the hostname starts with `admin.`, and a Supabase Bearer token otherwise.
- `WhatsAppDashboard.tsx` defines its own `BACKEND_URL` with a different fallback (`localhost` vs `127.0.0.1` in the store).
- Pipeline workspace: picks a lead, runs the AI, edits material/labor (total auto-sums; the line items are **not** editable or re-summed), saves the draft (DOMPurify-sanitized), dispatches, re-imports.
- Reports page: client-side CSV export (BOM-prefixed) of `/quotes/dispatched`.
- Landing page (713 lines) is marketing only.
- The `dist/` folder exists locally (ignored).

## 8. Security findings (ranked)

1. **Admin bypass is on by default.** `verify_admin` accepts the header `X-Admin-Auth: admin` whenever `ENV != "production"`. `ENV` isn't in `.env.example` or the Dockerfile, so it is likely unset in deployment. With that header anyone can list, create and delete users, reset passwords, and overwrite credentials. **Set `ENV=production` or remove the bypass.**
2. **Admin portal login is client-side only**: hardcoded `admin`/`admin`, a password "changed" into `localStorage`, and a success flag in `localStorage`. It is cosmetic; real protection relies on #1.
3. **Secrets in git history**: real `backend/.env` and `frontend/.env` were committed in `358213f` and deleted in `c382007` ("env revoked"). They are still retrievable from history. Rotate the Supabase service-role key and JWT secret, the Gemini key, and the Gmail app password if that hasn't been done.
4. **The WhatsApp webhook is unauthenticated** and has no Twilio signature validation. The `x-simulated-user-id` header lets any caller inject chats, leads and quotes into any tenant and burn that tenant's (or the admin's) Gemini and Twilio quota.
5. **Credentials are encrypted with a key derived from `SUPABASE_JWT_SECRET`.** Rotating the JWT secret makes every stored credential undecryptable (decrypt returns `""` silently). There is also a hardcoded fallback key string.
6. **Cross-tenant use of the admin's credentials** through the fallback chain (§6). Tenants can send mail from the admin's Gmail.
7. **Error details leak**: many handlers return `str(e)` in `detail`, so the global "mask internals" handler rarely applies.
8. `POST /admin/logs` lets any authenticated user write arbitrary rows into `system_logs` (log injection/spam). `GET /admin/logs?limit=` is unbounded.
9. The `/leads/webhook` token check is skipped when `WEBHOOK_SECRET_TOKEN` is unset, and it accepts any `user_id` from the payload.
10. The CSP header is hardcoded to one Supabase project URL (`cyatvsjgybtnkhyyetwi`) and includes `unsafe-eval`. It is set on the API, not the SPA, so it does little.
11. `users.py` `change-password` doesn't require the current password.

## 9. Functional bugs / inconsistencies

- **Missing `company_id` on inserts after v3 (NOT NULL, no default):**
  - `email_poller` inserts `customer_emails` without `company_id`. The insert fails, the exception fires before `flag(\Seen)`, so the same mail is retried and fails every 30 s and **IMAP ingestion never lands anything**. Even with a default, `GET /emails` filters by company.
  - WhatsApp quote path: `leads`, `quotes` and `dispatched_quotes` inserts lack `company_id`. They fail, the error is caught, and the customer gets a generic "we are processing" reply. WhatsApp leads never reach the pipeline.
- **WhatsApp customer lookup in dispatch / reports** queries `whatsapp_chats` by company only and takes `[0]`, so **every WhatsApp quote shows the first chat's name and phone**.
- `whatsapp_chats` unique constraint is `(user_id, phone_number)` but lookup is `(company_id, phone_number)`. Two users in one company can collide or duplicate.
- **Webhook tenant fallback = first user in the DB**: unknown numbers get assigned to an arbitrary tenant.
- The **email poller runs in every gunicorn worker** (4×) and in every container, so mail is fetched and inserted 4× with races before `\Seen` is set. It also blocks on IMAP per user, sequentially.
- **In-memory rate limiter** is per-worker (effectively 20/min with 4 workers) and resets on restart.
- **Global settings JSON file** is per-container, not shared, and lost on redeploy (see §4).
- **Reports**: `/quotes/dispatched` reads `quotes` and re-parses the leads with regex. The `dispatched_quotes` table is written to but never read by the UI.
- `generate_quote` loads KB by `company_id`; the WhatsApp path loads KB by `user_id`. The two paths can produce different results.
- `run_quote_engine` trusts LLM arithmetic. `total_cost` is not recomputed from line items, and the frontend total is just material + labor.
- Customer-name regex (`Thank you,|Thanks,|Manager,`) is brittle; the phone regex can match order quantities and numbers.
- Re-generating without re-import inserts a second quote per lead. `GET /quotes/lead/{id}` returns an arbitrary `[0]`.
- `emails.py` `reply` → `send_smtp_email` falls back to the admin's Gmail for any user.
- `@app.on_event("startup")` is deprecated (use lifespan). There are 7+ separate `create_client()` instances, one per module.
- `SupabaseDBHandler` makes a synchronous network insert **for every INFO log line**. That is slow, and it recurses into httpx logs (filtered by name only).
- `export_leads_csv` builds the "chat link" from backend `HOST:PORT` (e.g. `127.0.0.1:8000/whatsapp?...`), which is not a frontend URL.
- `kb.py` `process_kb_file`: `logger` is defined inside `try`. Other modules use module-level loggers, so this one is inconsistent.
- `schema_extension.sql` duplicates `schema.sql`, and its policies aren't `if not exists`.
- Model default `gemini-1.5-flash` is outdated or retired; update `GEMINI_MODEL`.
- `pyproject` `readme = "README.md"` points to a missing file. This is harmless today because there's no `[build-system]`, so uv treats it as a virtual project, but it would break once a build backend is added.
- `frontend/package-lock.json` has uncommitted changes.

## 10. Suggested priorities

1. Set `ENV=production` or delete the `X-Admin-Auth` bypass. Replace the client-side admin login with a real role check. Rotate the leaked secrets.
2. Add `company_id` to every backend insert (poller, WhatsApp), or give the columns a DB default/trigger. Fix the WhatsApp chat-to-lead linkage (store `chat_id` or `phone` on the lead).
3. Validate Twilio signatures and remove `x-simulated-user-id` outside dev.
4. Move the email poller out of the web workers (a separate process or cron) and move global settings into the DB.
5. Make the credential fallback opt-in per tenant.
6. Add a README, tests for the parser and quote engine schema, and CI.

## 11. Fix log — 2026-11-12 (uncommitted, on master)

Done:
- **Admin bypass removed.** `X-Admin-Auth` is gone. Admin routes use `require_admin` (`core/security.py`): a valid Supabase token **and** `users.role = 'admin'`. The admin portal (`/admin` or `admin.*`) now signs in through Supabase and checks the role through `/api/users/profile`. The localStorage `admin`/`admin` login and the "change admin password" card are removed. `role` is restricted to `user|admin`.
- **WhatsApp webhook hardened.** Twilio requests are routed by the `To` number and must carry a valid `X-Twilio-Signature` (HMAC-SHA1 with that tenant's auth token; set `PUBLIC_BACKEND_URL` behind a proxy). The in-app simulator now sends the user's Bearer token; `x-simulated-user-id` is ignored. The "first user in DB" fallback is gone: unknown numbers get 404. Blocking work runs in a threadpool.
- **company_id on inserts**: poller, WhatsApp lead/quote/dispatched rows. Plus the DB trigger in `migration_v4.sql`.
- **WhatsApp customer linkage**: `leads.chat_id`. `resolve_lead_customer()` in `quotes.py` is shared by dispatch and reports.
- **Email poller**: one worker per container (file lock); `ENABLE_EMAIL_POLLER` turns it off on extra replicas. Mail is marked seen only after it is stored, and a bad message no longer blocks the rest. The env mailbox is routed to the first admin.
- **Global settings** are stored in the `app_settings` table, with fallback to the old JSON file, then defaults.
- **Admin credential fallback** is opt-in (`ALLOW_ADMIN_CREDENTIAL_FALLBACK`, default false).
- **Lead webhook** is disabled unless `WEBHOOK_SECRET_TOKEN` is set; the token is compared in constant time.
- API errors no longer echo exception text (it is logged instead). `/admin/logs` POST forces source=frontend, whitelists the level, truncates the message and tags the user; GET limit is capped at 1000.
- WhatsApp CSV export links use `FRONTEND_URL`. The customer-name regex now handles "Thank you,\nName". The kb logger shadowing bug is fixed.

Still open: rotate secrets leaked in git history; per-process rate limiter; LLM totals not re-validated; DB log handler does a sync insert per log line; CSP hardcoded; no tests or CI.
