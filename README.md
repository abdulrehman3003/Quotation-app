# AXRFLOWS — AI quotation workspace

AXRFLOWS turns customer enquiries from email, WhatsApp or a webhook into priced quotes and a drafted reply. It prices each request against the business's own price lists (Excel, CSV or PDF) using an LLM served through [AIML API](https://aimlapi.com) (default model `openai/gpt-4o-mini`; any of its chat models can be picked in the admin panel). Staff review the draft, then send it. The customer opens an online quote page and accepts or declines.

Flow: **Enquiry → AI draft quote → review and edit → send → customer accepts or declines → reports**

## Features

- **Inbound channels:** manual entry, email inbox (IMAP, app password or Google / Microsoft sign-in), WhatsApp through Twilio, signed webhook
- **Knowledge base:** upload price lists as CSV, XLSX or PDF; DXF and STL part files are measured and added to the request
- **Quotes:** editable line items, discount, tax, validity date, quote number. Totals are recomputed on the server; the AI's arithmetic is not trusted
- **Customer quote page** (`/q/<token>`): view tracking, accept or decline
- **Automation (opt-in per workspace):** automatic drafts from incoming email, one follow-up per unanswered quote, outbound webhook
- **Customers:** directory with per-item price history
- **Reports:** win rate, won value, time to quote, follow-up flags, CSV export
- **Multi-tenant:** companies, users and roles; admin portal at `/admin` or `admin.<domain>`

## Tech stack

| Part | Stack |
|---|---|
| Backend | Python 3.11+, FastAPI, supabase-py, OpenAI SDK pointed at AIML API, managed with `uv` |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Zustand |
| Database, auth and storage | Supabase (Postgres, Auth, Storage) |
| Messaging | SMTP / IMAP, Twilio WhatsApp |

```
backend/    FastAPI app (app/api, app/services, app/core), tests, Dockerfile
frontend/   React single-page app (src/pages, src/store, src/components)
database/   SQL schema and migrations, run in order (see docs/DEPLOYMENT.md)
specs_history/  dated design and decision notes
PROJECT_NOTES.md  architecture notes, known issues, pre-production checklist
```

## Run it locally

Prerequisites: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node.js 20+, and a Supabase project with the SQL in `database/` applied ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#2-database-supabase)).

**Backend**

```bash
cd backend
cp .env.example .env        # fill in SUPABASE_*, AI_API_KEY at minimum
uv sync
uv run python -m app.main   # http://127.0.0.1:8000, docs at /docs
```

**Frontend**

```bash
cd frontend
cp .env.example .env        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL
npm install
npm run dev                 # http://127.0.0.1:5173
```

If port 8000 is already in use, start the backend with `PORT=8001 uv run python -m app.main` and the frontend with `VITE_BACKEND_URL=http://127.0.0.1:8001 npm run dev`.

**Tests**

```bash
cd backend && uv run pytest -q      # uses an in-memory fake Supabase; no network needed
cd frontend && npm run build        # typecheck and production build
```

CI (`.github/workflows/ci.yml`) runs both on every push.

## Configuration

Every backend setting is documented in [`backend/.env.example`](backend/.env.example). The ones that matter most:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Required |
| `ENCRYPTION_KEY` | Encrypts stored mailbox and Twilio credentials. Set it once and never change it (see the deployment guide) |
| `AI_API_KEY`, `AI_MODEL` | AIML API key and default model. Change the model later in Admin → System Settings → AI Model |
| `FRONTEND_URL` | Allowed CORS origin; also used to build customer quote links |
| `PUBLIC_BACKEND_URL` | Public backend URL, used for Twilio signature checks and OAuth callbacks |
| `ENV=production` | Turns on production safety checks |

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Security notes

Read section 8 and the pre-production checklist (section 12) of [PROJECT_NOTES.md](PROJECT_NOTES.md) before onboarding a paying customer.
