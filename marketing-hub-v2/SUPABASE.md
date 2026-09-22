# Supabase (Marketing Hub v2)

## Project

- **Name:** Marketing Hub  
- **Ref:** `hwtycgvclhckglmuwnmw`  
- **Packages (current):** `@supabase/ssr` ^0.12.3, `@supabase/supabase-js` ^2.110.6 — no urgent bump needed.

## Client layout

| Module | Purpose |
|--------|---------|
| [`src/lib/supabase/client.ts`](src/lib/supabase/client.ts) | Browser anon (login) |
| [`src/lib/supabase/server.ts`](src/lib/supabase/server.ts) | SSR anon (cookies) |
| [`src/lib/supabase/admin.ts`](src/lib/supabase/admin.ts) | **Only** service-role factory (fail-hard; never falls back to anon) |

## Migrations

Canonical tree: [`supabase/migrations/`](supabase/migrations/)

| File | Notes |
|------|--------|
| `001_hub_v2_schema.sql` | Initial greenfield tables |
| `002_quarterly_themes.sql` | Themes hierarchy |
| `003_profiles_external_role.sql` | External role |
| `004_hub_local_tables.sql` | Hub-compatible text-id tables + awards/tasks/merch/… |
| `005_hub_store_and_rls.sql` | Durable `hub_store` + staff RLS on core greenfield tables |
| `006_media_public_title.sql` | Media public title column |
| `007_hub_staff_rls_extended.sql` | Staff RLS on themes + hub-local tables |

Legacy / root `supabase/migrations` and `legacy/supabase` are **frozen historical** — see [`../LEGACY_AND_V2.md`](../LEGACY_AND_V2.md).

## Security notes

- App CRUD uses service role against `hub_store` (no anon policies).
- Greenfield table policies use `is_hub_staff()` (admin/member profiles), not `using (true)`.
- Core Data `table_*` RLS may still be broad for the legacy builder — keep all privileged hub access server-side.

## Adding users (Member vs External)

Manage users at **Admin → Users**. With `SUPABASE_SERVICE_ROLE_KEY` set, invites go through Supabase Auth; otherwise the page uses the local demo store.

### Role → session → destination

| Profile role (`profiles.role`) | Session role | Where they land |
|--------------------------------|--------------|-----------------|
| `admin` | `admin` | `/app` — full hub + user/data admin |
| `member` | `staff` | `/app` — day-to-day staff modules |
| `seo` | `seo` | `/app/enquiries` only (Google Ads / SEO partners) |
| `external` | `media_guest` | `/media` only (redirected out of `/app`) |

### Request access (public)

Linked from **login** → [`/request-access`](../src/app/request-access/page.tsx).

| Email | Outcome |
|-------|---------|
| `@petersandmay.com` (or domains in `HUB_MEMBER_EMAIL_DOMAINS`) | Auto-accepted as **Member** + invite email |
| Any other domain | Pending **External** request for admin review |

Non–P&M people cannot request Member via the form. Admins invite them as Member manually when needed.

Admins **Accept** / **Deny** pending External requests on **Admin → Users**. Accept sends an External invite.

### Invite user (admin)

1. **Admin → Users → Invite user** — name, email, role (Admin / Member / SEO / External).
2. They accept the Supabase invite email and set a password on `/set-password`.
3. Sign in at `/login` → land per role table above.
4. Optional for Members: link a **Contact** for **My details** (`/app/me`).
5. For Externals: mark relevant Media folders **Public**.

### Resend invite / password reset (admin)

On each user row (when Supabase is connected):

| Action | When | What it does |
|--------|------|----------------|
| **Resend invite** | Invite still pending (never confirmed / signed in) | Re-sends the Invite user email |
| **Send password reset** | Any user with an email | Sends the Reset Password email |

Self-serve: **Forgot password?** on `/login` → `/forgot-password`.

Branded invite/recovery emails link to `/auth/confirm?token_hash=…` (user must click Continue — stops Outlook Safe Links burning the token). Legacy redirects still use `/auth/callback` then `/set-password`. Allow-list under Authentication → URL Configuration → Redirect URLs:

- `{NEXT_PUBLIC_APP_URL}/auth/callback`
- `{NEXT_PUBLIC_APP_URL}/auth/confirm`
- `{NEXT_PUBLIC_APP_URL}/set-password`

### Change role later

- Use the role dropdown on the user row (Admin → Users).
- Member → External: next sign-in they lose `/app` and only get `/media`.
- External → Member: they gain staff hub access (ensure that is intentional).

### Prerequisites

- `SUPABASE_SERVICE_ROLE_KEY` set for live invites.
- `NEXT_PUBLIC_APP_URL` set to the public site origin (used for invite / reset redirects).
- Supabase Auth email (invite) configured in the project.
- Optional: `HUB_MEMBER_EMAIL_DOMAINS` (comma-separated; default `petersandmay.com`).
- Custom SMTP (e.g. Resend) for From: Peters & May — see Authentication → SMTP.
- Branded Auth emails (same header on all): [`docs/email-templates/`](docs/email-templates/README.md). Paste each HTML file into Authentication → Email Templates (Invite, Confirm signup, Magic Link, Reset Password, Change Email, Reauthentication).
