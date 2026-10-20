# Website chat (WordPress → Marketing Hub)

Fin-style simple chatbot: WordPress plugin UI, Hub owns AI / KB / inbox / leads.

## Env (Vercel `marketinghub`)

| Var | Purpose |
|-----|---------|
| `CHAT_SITE_KEY` | Shared with WP plugin (`X-Chat-Site-Key`) |
| `CHAT_CORS_ORIGINS` | Optional CSV of origins (default: petersandmay.com + localhost) |
| `CHAT_NOTIFY_EMAIL` | Optional fallback notify address |
| `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY` | Model access |
| `RESEND_API_KEY` | Handoff / lead notification emails |

## Database

Migration: `supabase/migrations/041_website_chat.sql`

Tables: `chat_settings`, `chat_kb_documents`, `chat_sessions`, `chat_messages`

## Public API

- `POST /api/chat/sessions`
- `POST|GET /api/chat/sessions/:id/messages`
- `POST /api/chat/sessions/:id/handoff`
- `POST /api/chat/sessions/:id/lead`

## Staff

- Hub page: `/app/chat` (Inbox · Train · Test · Deploy · Analyze)
- Staff API: `/api/chat/admin`

Leads upsert `web_enquiries` with `submission_id = chat:<sessionId>` and Portal mirror via existing sync.

## Retire HubSpot chat (go-live checklist)

1. Deploy Hub migration + env; Deploy toggle on in Hub.
2. Install/activate `wordpress-plugins/pm-website-chat` on petersandmay.com.
3. **Disable HubSpot online chat** for the public website (HubSpot chatflows / tracking code chat module / GTM tag). Do not leave two widgets live.
4. Smoke-test: visitor message → AI reply; Speak to the team + email → Hub inbox + Enquiries (source **Website chat**) → Portal mirror.
