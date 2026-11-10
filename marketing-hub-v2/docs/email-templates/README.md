# Auth email templates (branded header)

All Marketing Hub Auth emails share the same Peters &amp; May header (navy + P&amp;M Blue accent) and footer.

CTA links use `/auth/confirm?token_hash=…`. That page does not verify on open — the user must click Continue first (Outlook Safe Links safe). Do not switch back to `{{ .ConfirmationURL }}` or restore auto-verify-on-GET.

## Apply in Supabase (required for production)

### Preferred: Management API push

```bash
# Token: https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
node docs/email-templates/push-to-supabase.mjs
```

This updates all six Auth templates (subjects + HTML) on project `hwtycgvclhckglmuwnmw`.

### Manual (dashboard)

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/hwtycgvclhckglmuwnmw/auth/templates)
2. Select the template name below
3. Set the **Subject**
4. Paste the full HTML from the matching file
5. Save

| Dashboard name | File | Subject |
|---|---|---|
| Invite user | `invite-user.html` | You're invited to Peters & May Marketing Hub |
| Confirm signup | `confirm-signup.html` | Confirm your Marketing Hub email |
| Magic Link | `magic-link.html` | Your Marketing Hub sign-in link |
| Reset Password | `reset-password.html` | Reset your Marketing Hub password |
| Change Email Address | `change-email.html` | Confirm your new Marketing Hub email |
| Reauthentication | `reauthentication.html` | Confirm it’s you — Marketing Hub |

Regenerate HTML after editing `brand-shell.mjs` or `generate.mjs`:

```bash
node docs/email-templates/generate.mjs
```

## Local CLI (optional)

`supabase/config.toml` points at these files for local Auth email previews.
