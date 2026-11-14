# Specification & Change History — Security, Auth Flow, Email Deduplication & Onboarding Flow

**Date:** 2026-11-13  
**Component Scope:** Database (`database/`), FastAPI Backend (`backend/app/`), React Frontend (`frontend/src/`)

---

## 1. Security Fixes
- **Strict Multi-Tenant Isolation**:
  - Updated `public.handle_new_user()` in `database/migration_v3_multitenancy.sql` and `database/migration_v5_security_and_onboarding.sql` to provision a dedicated `public.companies` workspace per user instead of assigning all new signups to the shared `Default Company` (`00000000-0000-0000-0000-000000000000`).
  - Added automatic tenant isolation fallback `_provision_isolated_company()` in `backend/app/core/security.py` so any non-admin user still attached to `DEFAULT_COMPANY_ID` is automatically migrated to an isolated company on authentication.
- **Privilege Escalation Prevention**:
  - Added `public.protect_user_sensitive_columns()` trigger on `public.users` in `database/migration_v5_security_and_onboarding.sql` to block non-service-role clients from directly mutating their own `role` or `company_id` via PostgREST.
  - Updated `whatsapp_messages` RLS policies to enforce `c.company_id = public.get_user_company()`.
- **Encryption Hardening**:
  - Updated `backend/app/core/encryption.py` and `backend/app/core/config.py` to support a dedicated `ENCRYPTION_KEY` setting (with fallback to `SUPABASE_JWT_SECRET`) and prevented `encrypt_key()` from ever returning unencrypted plaintext on cipher failure.
- **Dynamic Content-Security-Policy**:
  - Updated `backend/app/main.py` to dynamically allow `settings.SUPABASE_URL` in the `Content-Security-Policy` header instead of a hardcoded project domain.

## 2. Authentication Flow Fixes
- **Idempotent Auth Listener & Recovery State (`frontend/src/store/authStore.ts`)**:
  - Prevented duplicate `supabase.auth.onAuthStateChange` subscriptions when `initialize()` is called across multiple components.
  - Added `PASSWORD_RECOVERY` state detection (`isPasswordRecovery`, `clearPasswordRecovery`).
- **Complete Auth Experience (`frontend/src/pages/Auth.tsx`)**:
  - Added Full Name and Company Name fields to registration and passed them via `user_metadata`.
  - Handled immediate-session signups (redirecting directly to `/onboarding`) vs. email-confirmation-required signups.
  - Added Forgot Password (`resetPasswordForEmail`) and Password Recovery (`updateUser`) flows.
  - Added smart post-login routing to `/onboarding` when `onboarding_completed` is `false`.

## 3. Duplicate Email Fixes
- **User Registration & Profile Upserts**:
  - Updated `public.handle_new_user()` trigger to use `ON CONFLICT (id) DO UPDATE` and normalize email addresses (`lower(trim(email))`).
  - Updated `backend/app/api/users.py` and `backend/app/api/admin.py` to use `.upsert(..., on_conflict="id")` when auto-provisioning missing `public.users` rows.
  - Added duplicate email detection in `frontend/src/pages/Auth.tsx` (handling both explicit Supabase errors and obfuscated `identities.length === 0` responses) and in `POST /api/admin/users` (`409 Conflict`).
- **Inbound Customer Email Deduplication**:
  - Added `message_uid` column and unique index `idx_customer_emails_company_message_uid` in `database/migration_v5_security_and_onboarding.sql`.
  - Updated `poll_user_mailbox()` in `backend/app/services/email_poller.py` to deduplicate by `Message-ID` / IMAP UID and `(company_id, sender_email, subject, body)` before inserting into `customer_emails`.
  - Updated `POST /api/emails/{email_id}/transfer` in `backend/app/api/emails.py` to return `409 Conflict` if an email was already imported.

## 4. Multi-Step Onboarding Flow (`/onboarding`)
- **Backend Endpoints (`backend/app/api/users.py`, `backend/app/services/ai_engine.py`)**:
  - Added `POST /api/users/onboarding` and `POST /api/users/onboarding/sample-kb`.
  - Enhanced `GET /api/users/profile` and `PUT /api/users/profile` to support `company_name`, `onboarding_completed`, and self-service encrypted credentials (`gemini_key`, `gmail_email`, `gmail_password`, `twilio_sid`, `twilio_token`, `twilio_phone`).
  - Updated `run_quote_engine()` in `backend/app/services/ai_engine.py` to respect per-tenant `default_quote_parameters` (`currency`, `base_labor_rate`, `base_material_markup`, `payment_terms`, `company_name`).
- **Frontend Wizard (`frontend/src/pages/Onboarding.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/UserProfileSettings.tsx`)**:
  - Built 4-step Onboarding Wizard (`/onboarding`): Company & Profile -> Quotation Defaults -> AI & Channels -> Knowledge Base Kickstart.
  - Enforced automatic redirect to `/onboarding` in `ProtectedLayout` (`frontend/src/App.tsx`) for un-onboarded users.
  - Added self-service integration key management, company settings, and a "Launch Setup Wizard" button in `frontend/src/pages/UserProfileSettings.tsx`.

## 5. Shareable Team Invitation Link & Company-Scoped Workspace Access
- **Backend Team Invitation Endpoints (`backend/app/api/users.py`)**:
  - `GET /api/users/team`: Returns the current user's `company_id`, `company_name`, all company members (`public.users` where `company_id = current_user["company_id"]`), and a signed HS256 JWT `invite_token` (14-day validity, `purpose: "team_invite"`).
  - `GET /api/users/team/invite-info?token=...`: Public endpoint that validates the invite token and returns `{ valid: True, company_id, company_name, invited_by_name }`.
  - `POST /api/users/team/accept-invite`: Authenticated endpoint that links the signed-in user (`public.users.company_id`) to the inviter's company, inherits baseline `default_quote_parameters`, and marks `onboarding_completed = True`.
- **Company-Level Shared Credentials (`backend/app/core/credentials.py`, `backend/app/api/quotes.py`, `backend/app/api/emails.py`)**:
  - Added `_get_company_teammates(user_id)` so invited team members automatically inherit company-configured Gemini API keys, Gmail SMTP credentials, and Twilio WhatsApp credentials without needing to re-enter keys.
- **Frontend Team Invite Experience (`frontend/src/pages/UserProfileSettings.tsx`, `frontend/src/pages/Auth.tsx`, `frontend/src/store/workspaceStore.ts`)**:
  - Added a **Team Workspace & Invite Link** card in `UserProfileSettings.tsx` with a one-click **Copy Invite Link** button (`/auth?invite=<token>`) and a live list of active company team members.
  - Updated `Auth.tsx` to detect `?invite=<token>`, display a personalized invitation banner (`"[Inviter] invited you to collaborate in [Company Name]"`), lock the company name to the invited workspace, and automatically bind the user to the company upon signing in or registering with their email.

## 6. Employee Attribution in Quotation Reports
- **Backend Attribution (`backend/app/api/quotes.py`)**:
  - Updated `PUT /api/quotes/{quote_id}` (`update_quote`) and `POST /api/quotes/{quote_id}/dispatch` (`dispatch_quote`) to set `quotes.user_id = current_user["id"]`, recording the specific employee who attended to and pushed/dispatched the quotation request.
  - Updated `GET /api/quotes/dispatched` (`list_dispatched_quotes`) to batch-resolve company user profiles (`public.users`) and return `employee_name` and `employee_email` on every dispatched quotation record.
- **Frontend Reports Table & Excel Export (`frontend/src/pages/QuotationReports.tsx`)**:
  - Added the **Attended By** column to the Quotation Analytics & Reports table showing the employee's name and email address.
  - Added the **Attended By (Employee)** column to the downloadable CSV/Excel report (`handleExportExcel`).
