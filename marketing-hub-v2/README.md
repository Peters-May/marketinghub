# Peters & May Marketing Hub (v2)

Greenfield marketing hub — **not** the Airtable/Baserow-style builder.

The legacy app lives in [`../legacy/baserow-app`](../legacy/baserow-app). See [`../LEGACY_AND_V2.md`](../LEGACY_AND_V2.md) for rollback. Do not delete `legacy/`.

## What’s included

| Area | Status |
|------|--------|
| Staff shell + home dashboard | Ready |
| Events calendar + RSVP / notes | Ready (local store) |
| Content planner (kanban) | Ready |
| Sponsorships list + timeline | Ready |
| Media gallery (Google Drive) | Ready when Drive env is set |
| Social calendar (Planable) | Deep link + API when token is set |
| Contacts | Ready |
| Advertisements (Reporting) | Ready |
| Platform logins (admin) | Ready |
| Resources (OneDrive links) | Ready |
| Public `/media` | Ready |

## Quick start

```bash
cd marketing-hub-v2
cp .env.example .env.local   # already includes AUTH_BYPASS for local demo
npm install
npm run dev -- -p 3001
```

Open [http://localhost:3001](http://localhost:3001) → **Staff login** → **Enter hub (demo)**.

Data persists in `.data/store.json` while Supabase is not configured.

## Media access

- **Browse:** public at `/media` (no login) — **Logos** and **Presentations** only for now (gallery/Images next)
- **Download:** requires sign-in (`/login?intent=media`) or staff hub session
- **Titles:** `name` = internal reference; `public_title` = shown on the public gallery (falls back to `name` if blank)
- Staff Library (`/app/library`) can still see all categories


See [`.env.example`](.env.example).

- **Auth:** Set Supabase URL/keys and turn off `AUTH_BYPASS` for real staff login.
- **Drive:** Service account with Viewer on the gallery folder + `DRIVE_GALLERY_ROOT_FOLDER_ID`.
- **Planable:** `PLANABLE_API_TOKEN` (Write scope) + `PLANABLE_WORKSPACE_ID`. Draft Social in the Hub with a caption or image; **Approved** sends one Facebook draft on the due date (not all LinkedIn pages). Add other platforms, approve, and **publish only in Planable**, then **Sync from Planable** to lock the Hub piece.
- **Alerts:** Set `RESEND_API_KEY` (and optional `RESEND_FROM_EMAIL`, `MARKETING_ALERT_EMAIL`) so marketing gets a short email when a clothing/asset/social request or feedback is submitted — type only, no details.
- **ChatGPT (MCP):** Set `HUB_MCP_API_KEY`, deploy, then add a ChatGPT connector (Developer mode) at `https://<your-hub-domain>/api/mcp` using **User-Defined OAuth Client**. Client ID defaults to `marketing-hub-chatgpt`; client secret = `HUB_MCP_API_KEY`. Auth URL: `/api/mcp/oauth/authorize`, Token URL: `/api/mcp/oauth/token`. WhatsApp enquiry tracker tools: `create_whatsapp_enquiry`, `update_whatsapp_enquiry`, `list_enquiries` (fields match the Excel tracker; shown with web enquiries in one Hub tab). If the connector flakes: reconnect once after deploy, confirm `NEXT_PUBLIC_APP_URL` matches the live Hub domain, and check `/.well-known/oauth-protected-resource/api/mcp` returns JSON.
- **Portal enquiry sync:** Hub is source of truth for web + WhatsApp enquiries. Set `PORTAL_BASE_URL` + `PORTAL_ENQUIRY_SYNC_SECRET` (same as Portal `WEB_ENQUIRY_WEBHOOK_SECRET`) so Hub forwards to Portal after ingest. Point WordPress/PMQB at Hub only — see [`docs/PORTAL_ENQUIRY_SYNC.md`](docs/PORTAL_ENQUIRY_SYNC.md).

SQL for a dedicated Supabase project: [`supabase/migrations/001_hub_v2_schema.sql`](supabase/migrations/001_hub_v2_schema.sql).

## Deploy (Vercel)

1. Use the **same** Vercel project (`marketinghub`).
2. Set **Root Directory** to `marketing-hub-v2` (rollback: `legacy/baserow-app`).
3. Add env vars from `.env.example` (disable `AUTH_BYPASS` in production).
4. Deploy.

## Design notes

Modern, simple staff UI: navy/teal brand tones, Fraunces + DM Sans, fixed module nav (no page builder).
