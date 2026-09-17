# Hub → Portal enquiry sync

Marketing Hub is the **source of truth** for web and WhatsApp enquiries. The Customer Portal receives a one-way mirror for sales/CRM. Campaign/email linking is out of scope for now.

## Flow

1. **Web:** WordPress / PMQB → Hub `POST /api/enquiries` only → Hub forwards original body → Portal `POST /api/enquiries`
2. **WhatsApp:** ChatGPT MCP → Hub → Hub forwards → Portal `POST /api/enquiries/hub-sync` (`submission_id` = `whatsapp:hub:WA-###`)

Hub ingest **always succeeds** even if Portal sync fails (logged; re-run backfill to recover).

## Hub env (Vercel `marketinghub`)

| Var | Purpose |
|-----|---------|
| `PORTAL_BASE_URL` | Portal origin, e.g. `https://portal.petersandmay.com` (no trailing slash) |
| `PORTAL_ENQUIRY_SYNC_SECRET` | Must match Portal `WEB_ENQUIRY_WEBHOOK_SECRET` |
| `WEB_ENQUIRY_WEBHOOK_SECRET` | WordPress → Hub (unchanged) |
| `HUB_MCP_API_KEY` | ChatGPT → Hub (unchanged) |

## Portal env

| Var | Purpose |
|-----|---------|
| `WEB_ENQUIRY_WEBHOOK_SECRET` | Accepts Hub forwards (web + hub-sync) |

## WordPress / PMQB cutover

1. Deploy Hub + Portal with the env vars above.
2. In Quote Builder / WordPress **Webhook URL (primary)**, set **only**:
   - `https://marketing.petersandmay.com/api/enquiries?key=<WEB_ENQUIRY_WEBHOOK_SECRET>`
   - or Hub URL + `X-Webhook-Secret` / Bearer (preferred over query string).
3. **Remove** Portal as a WordPress webhook target (no dual send).
4. Smoke-test: submit a test enquiry → appears in Hub Enquiries → same `submission_id` in Portal.
5. Optional backfill of existing Hub rows:

```bash
cd marketing-hub-v2
node scripts/backfill-portal-enquiries.mjs
# WhatsApp only:
node scripts/backfill-portal-enquiries.mjs --whatsapp
# Web only:
node scripts/backfill-portal-enquiries.mjs --web
```

## Later

- Meta WhatsApp API → Hub (still SoT) → same Portal sync path.
- Campaign / email linking across Hub ↔ Portal.
