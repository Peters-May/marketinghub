# Data sources (Supabase → Marketing Hub v2)

Keep the UI simple. Pull from the **tidy** Core Data tables only.

## Enquiries (web + WhatsApp)

- **Web:** WordPress Quote Builder webhook → Hub `web_enquiries` (SoT). With `PORTAL_BASE_URL` + `PORTAL_ENQUIRY_SYNC_SECRET`, Hub forwards the same payload to Portal. See [`docs/PORTAL_ENQUIRY_SYNC.md`](docs/PORTAL_ENQUIRY_SYNC.md).
- **WhatsApp:** ChatGPT MCP → Hub `whatsapp_enquiries` (SoT); mirrored to Portal as `whatsapp:hub:WA-###`.
- Point WP/PMQB at Hub only — do not dual-send to Portal.

## Canonical sources

| Hub module | Use this Supabase table | Do not use |
|------------|-------------------------|------------|
| **Events** | Dedicated **Events** table (`table_events_…`) | Old **Content** rows typed as events |
| **Content planner** | **Social Posts** table | Old **Content** table (legacy planner) |
| **Themes** | **Quarterly Themes** | — |
| **Contacts** | Newer **Contact** (singular) | Older **Contacts** plural if both exist |
| **Media / Library** | **Media Links Resources** (`table_media_…`) | Google Drive (optional later) |
| **Sponsorships** | Newer **Sponsorships** | Older duplicate |
| **Memberships** | **Memberships** → Partners (`kind=membership`) | — |
| **Awards** | **Awards** | — |
| **Tasks** | **Tasks** | — |
| **Merch / staff requests / reports** | Hub store + durable Supabase (`merch_orders`, `staff_requests`, `report_links`) | — |
| **Social calendar** | Hub social `content` synced with Planable (`POST /api/planable/sync`); live Planable API as fallback | — |

## Durable hub mirror (local store → Supabase)

Alongside Core Data (`table_events`, …), the hub keeps matching **hub tables** so the local `.data/store.json` can be persisted:

| Store key | Supabase table |
|-----------|----------------|
| `events` | `events` |
| `content` | `content_items` |
| `sponsorships` | `sponsorships` |
| `contacts` | `contacts` |
| `resources` | `resource_links` |
| `themes` / `theme_mains` / `theme_offshoots` | `quarterly_themes` / `theme_main_content` / `theme_offshoots` |
| `awards` | `award_entries` |
| `tasks` | `hub_tasks` |
| `merch_orders` | `merch_orders` |
| `staff_requests` | `staff_requests` |
| `reports` | `report_links` |

Push the current store:

```bash
node scripts/push-store-to-supabase.mjs
# or POST /api/supabase/export (staff + service role)
```

## Why

- Events were **split out** into their own table — Content is the old home for that data.
- Day-to-day “content” for the hub is really **Social Posts** (posts, channels, Planable links). Sorting/tidying Social Posts further can come later; we still prefer it over Content.
- The Airtable-style builder metadata (`tables`, `views`, `view_blocks`) stays in the legacy app.

## Persistence

| Environment | Store |
|-------------|--------|
| Local demo (`AUTH_BYPASS` / no service role) | `.data/store.json` on disk |
| Production (service role set, bypass off) | Supabase `public.hub_store` JSON snapshot (durable across serverless instances); local file used as cache only |

## Unused greenfield tables

The v2 schema also created empty tables such as `events`, `content_items`, `sponsorships`, `contacts`, `resource_links` (see `supabase/migrations/001_hub_v2_schema.sql`). **Do not write app data there yet** — runtime CRUD goes through the hub store. Core Data `table_*` tables remain the import source.

## Import behaviour

When `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set:

1. Resolve physical table names via `public.tables`
2. Map rows into the simple v2 shapes
3. **Normalise** on the way in (`src/lib/data/normalize.ts`):
   - Strip HTML from notes/captions
   - Map generic `Social Post` / `social_post` → platform (LinkedIn, Instagram, …) from title/caption hints
   - Unpack JSON attachment blobs into a plain `asset_url`
   - Humanise event types (`commercial_event` → Commercial, etc.)
   - **Dedupe** Social Posts (same title) and Events (same title + start day)
4. Replace the hub store Events / Content / Sponsorships+Memberships / Contacts / Awards / Themes / Resources sections (demo seed overwritten for those modules). **Merch, staff requests, and reports stay hub-local.**

To re-clean an existing `.data/store.json` without re-importing:

```bash
node scripts/clean-store.mjs
```

Turn off `AUTH_BYPASS` / `NEXT_PUBLIC_AUTH_BYPASS` in production and set Supabase env vars (including service role) for real staff login and durable store writes.
