# PM Website Chat (WordPress)

Thin WordPress plugin for the Peters & May website chatbot. AI, knowledge base, staff inbox, and enquiry leads live in **Marketing Hub**.

## Install

1. Copy this folder to `wp-content/plugins/pm-website-chat/` on the WordPress host.
2. Activate **PM Website Chat** in Plugins.
3. Settings → PM Website Chat:
   - Hub base URL: `https://marketing.petersandmay.com`
   - Site key: same value as Hub env `CHAT_SITE_KEY`
   - Enable widget

## Hub setup

1. Apply migration `041_website_chat.sql`.
2. Set Vercel env on Marketing Hub:
   - `CHAT_SITE_KEY` — shared with the plugin
   - `CHAT_CORS_ORIGINS` — optional, defaults include `https://www.petersandmay.com`
   - `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY`
   - `RESEND_API_KEY` (for handoff/lead emails)
3. In Hub → **Website chat**:
   - Train knowledge / guidance
   - Test in playground
   - Turn **Deploy** on

## Retire HubSpot chat

When this plugin is live:

1. In HubSpot, turn off the chat / conversations widget for petersandmay.com (or remove the HubSpot chat embed script from the theme / GTM).
2. Keep HubSpot for CRM/email if still required — only remove the **live chat widget**.
3. Confirm only the PM Website Chat launcher appears on the site.

## Shortcode

`[pm_chat]` mounts an inline mount point (floating launcher still loads site-wide when enabled).
