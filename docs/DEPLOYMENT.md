# Deployment guide

Target layout:

```
customers ──► app.<your-domain>   (frontend, static, e.g. Vercel)
                    │
                    ▼
              api.<your-domain>   (backend container, ONE replica, always on)
                    │
        ┌───────────┼──────────────┬───────────────┐
        ▼           ▼              ▼               ▼
     Supabase    Gemini API   Mail (IMAP/SMTP)   Twilio WhatsApp
```

Allow about half a day for the first deployment. Steps 1 to 3 are one-off.

---

## 1. Before you start (security)

Do these first. They are listed in `PROJECT_NOTES.md` §12.

1. **Rotate every secret that was ever committed.** `backend/.env` and `frontend/.env` were in git history (commit `358213f`). In Supabase, generate a new JWT secret and service-role key. Also regenerate the Gemini API key, the Gmail app password and the Twilio auth token.
   - Rotating the JWT secret signs every user out. That is expected.
   - If `ENCRYPTION_KEY` is **not** set, stored mailbox and Twilio credentials are encrypted with a key derived from the JWT secret, so rotating the secret makes them unreadable. Set `ENCRYPTION_KEY` (step 4) **before** rotating, or have users reconnect their mailbox afterwards.
2. **Delete the temporary admin `admin@admin.com`** (Supabase → Authentication → Users). Create your real admin with a strong password, then set `role = 'admin'` on its row in `public.users`. With `ENV=production`, the backend refuses to start while the temporary admin exists.
3. Ideally, use a **separate Supabase project for production** rather than the development one.

## 2. Database (Supabase)

Open the Supabase SQL editor and run the files in `database/` in this order:

| # | File | Notes |
|---|---|---|
| 1 | `schema.sql` | Base tables, `knowledge_base` storage bucket |
| — | `schema_extension.sql` | **Skip on a fresh project.** It duplicates `schema.sql` and seeds mock emails; its policies fail if `schema.sql` already ran |
| 2 | `migration_v2.sql` | Roles; makes the oldest user an admin |
| 3 | `migration_v3_multitenancy.sql` | Companies, `company_id` everywhere, RLS |
| 4 | `migration_v4.sql` | `app_settings`, company-id triggers, WhatsApp uniqueness |
| 5 | `migration_v5_security_and_onboarding.sql` | |
| 6 | `migration_v6_quote_lifecycle.sql` | Quote numbers, public tokens, outcomes |
| 7 | `migration_v7_automation.sql` | `company_settings`, follow-ups |
| 8 | `migration_v8_mail_oauth.sql` | `mail_connections` for Google / Microsoft sign-in |

v4 and v8 use `if not exists` and are safe to re-run.

> **Current development database (checked 2026-11-26):** `app_settings` (v4) and `mail_connections` (v8) are missing. Run `migration_v4.sql` and `migration_v8_mail_oauth.sql` there.

Then, in **Authentication → URL Configuration**:
- **Site URL:** `https://app.<your-domain>`
- **Redirect URLs:** `https://app.<your-domain>/**`

Set up a custom SMTP sender for Supabase Auth emails (sign-up confirmation, password reset). The built-in sender is rate-limited and not meant for production.

Backups: the Supabase free plan has no point-in-time recovery. Use a paid plan for paying customers, or schedule a nightly `pg_dump`.

## 3. Backend

### Host requirements

- **Exactly one replica, always on.** The email poller and the follow-up worker run as background threads inside the app. A per-container file lock makes only one gunicorn worker run them, but **two containers would both poll**. If you ever scale out, set `ENABLE_EMAIL_POLLER=false` on every replica but one.
- **No scale-to-zero or serverless.** A sleeping container doesn't poll mail.
- About 1 GB of RAM (pandas, pypdf, ezdxf, four workers). If memory is tight, lower `--workers` in the Dockerfile.
- HTTPS on a public hostname, e.g. `api.<your-domain>`.

Suitable options: Render (paid "web service", not the free tier, which sleeps), Railway, Fly.io (one machine, `auto_stop_machines = false`), or a small VPS (Hetzner, DigitalOcean) with Docker and Caddy.

### Build and run

The Dockerfile expects the **repository root** as its build context:

```bash
docker build -f backend/Dockerfile -t axrflows-backend .
docker run -d --name axrflows-api --restart unless-stopped \
  --env-file backend/.env.production -p 8000:8000 axrflows-backend
```

On a PaaS, set the Dockerfile path to `backend/Dockerfile` and the build context to `/`. The container listens on port 8000; gunicorn binds `0.0.0.0` inside the container, so the `HOST` variable is ignored there.

Health check path: `GET /health`.

### Production environment variables

```env
ENV=production
SUPABASE_URL=https://<prod-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<rotated>
SUPABASE_JWT_SECRET=<rotated>
# 32+ random characters. Set once and never change it, or stored credentials become unreadable.
ENCRYPTION_KEY=<python -c "import secrets; print(secrets.token_urlsafe(48))">

GEMINI_API_KEY=<rotated>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-flash-latest
GEMINI_REASONING_EFFORT=low

FRONTEND_URL=https://app.<your-domain>
PUBLIC_BACKEND_URL=https://api.<your-domain>
CORS_ORIGINS=https://admin.<your-domain>

ENABLE_EMAIL_POLLER=true
ALLOW_ADMIN_CREDENTIAL_FALLBACK=false
WEBHOOK_SECRET_TOKEN=<random, only if you use /api/leads/webhook>

# Only if you offer Google / Microsoft mailbox sign-in
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
```

Leave `GMAIL_*` and `TWILIO_*` empty unless you deliberately want a shared fallback account. Each customer connects their own mailbox and number.

Store these in the host's secret manager, not in a committed file. `.gitignore` ignores `.env` and `.env.*` (except `.env.example`), so a local `backend/.env.production` won't be committed.

## 4. Frontend (Vercel)

1. Import the repository in Vercel and set **Root Directory** to `frontend`. The framework preset is Vite: build command `npm run build`, output directory `dist`. `vercel.json` already rewrites all paths to `index.html`.
2. Environment variables (Production):
   ```env
   VITE_SUPABASE_URL=https://<prod-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   VITE_BACKEND_URL=https://api.<your-domain>
   ```
   These values are compiled into the bundle, so redeploy after changing any of them.
3. Add the domains `app.<your-domain>` and, for the admin portal, `admin.<your-domain>`. The app detects the `admin.` prefix. Alternatively, use `https://app.<your-domain>/admin` and skip the subdomain.
4. Update the pricing section's sales address: `SALES_EMAIL` at the top of `frontend/src/pages/LandingPage.tsx`.

## 5. Integrations

### Google mailbox sign-in
Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
- Authorised redirect URI: `https://api.<your-domain>/api/oauth/google/callback`
- Scopes: `https://mail.google.com/`, `openid`, `email`

The `https://mail.google.com/` scope is "restricted". While the app is unverified it works for up to 100 test users that you add by hand. Public use needs Google verification and a yearly third-party security assessment, which costs money. For the first customers, add them as test users, or use an app password.

### Microsoft 365 / Outlook sign-in
Entra ID → App registrations → New (multi-tenant).
- Redirect URI (Web): `https://api.<your-domain>/api/oauth/microsoft/callback`
- Delegated permissions: `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid`, `email`
- The customer's Microsoft 365 admin may need to grant consent, and SMTP AUTH must be enabled for the mailbox.

Neither sign-in flow has been tested against the real providers yet. Test both end to end before offering them.

### WhatsApp (Twilio)
For each customer: a Twilio WhatsApp sender (approved through Meta Business), with its credentials entered in the customer's settings.
- "When a message comes in" webhook: `https://api.<your-domain>/api/whatsapp/webhook` (POST)
- `PUBLIC_BACKEND_URL` must match exactly what Twilio calls, or signature validation fails.

## 6. Go-live checklist

- [ ] Secrets rotated; `ENCRYPTION_KEY` set
- [ ] `admin@admin.com` deleted; real admin created
- [ ] All migrations applied; `app_settings` and `mail_connections` exist
- [ ] `ENV=production`; backend starts; `GET https://api.<domain>/health` returns `healthy`
- [ ] Frontend loads at `https://app.<domain>`; sign-up confirmation email arrives; login works
- [ ] Knowledge-base upload works (storage bucket and policies)
- [ ] End-to-end test: send an email to a connected inbox → draft appears → send the quote → open `/q/<token>` from another device → accept → Reports shows a win
- [ ] WhatsApp test message reaches the pipeline (if offered)
- [ ] Uptime monitor on `/health` (UptimeRobot, Better Stack or similar)
- [ ] Database backups confirmed
- [ ] Privacy policy and terms pages live; footer links point to them (they are `#` today)

## 7. Updating

- **Frontend:** pushing to `master` triggers a Vercel redeploy.
- **Backend:** rebuild and restart the container. Downtime is a few seconds; the poller resumes on start.
- **Database:** add new migrations as `database/migration_vN_*.sql`. Apply them to production **before** deploying code that depends on them.
