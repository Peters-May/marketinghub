/**
 * Regenerates all branded Auth email HTML files from brand-shell.mjs.
 * Run: node docs/email-templates/generate.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandEmail, SITE_URL } from "./brand-shell.mjs";

const dir = dirname(fileURLToPath(import.meta.url));

/** SSR-safe links: token_hash → /auth/confirm (sets session cookies). */
function confirmLink(type, next = "/set-password") {
  return `${SITE_URL}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${encodeURIComponent(next)}`;
}

const templates = [
  {
    file: "invite-user.html",
    subject: "You're invited to Peters & May Marketing Hub",
    dashboard: "Invite user",
    html: brandEmail({
      title: "Marketing Hub invitation",
      heading: "You’ve been invited",
      paragraphs: [
        "You’ve been invited to create an account on the Peters &amp; May Marketing Hub.",
        "Click the button below to accept your invitation and set your password.",
      ],
      ctaLabel: "Accept invitation",
      ctaHref: confirmLink("invite", "/set-password"),
      afterCtaHtml: `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#5B6472;">
                  If you didn’t expect this invitation, you can ignore this email.
                </p>`,
    }),
  },
  {
    file: "confirm-signup.html",
    subject: "Confirm your Marketing Hub email",
    dashboard: "Confirm signup",
    html: brandEmail({
      title: "Confirm your email",
      heading: "Confirm your email",
      paragraphs: [
        "Thanks for signing up to the Peters &amp; May Marketing Hub.",
        "Confirm your email address to finish setting up your account.",
      ],
      ctaLabel: "Confirm email",
      ctaHref: confirmLink("signup", "/set-password"),
    }),
  },
  {
    file: "magic-link.html",
    subject: "Your Marketing Hub sign-in link",
    dashboard: "Magic Link",
    html: brandEmail({
      title: "Sign in",
      heading: "Sign in to Marketing Hub",
      paragraphs: [
        "Use the button below to sign in. This link expires shortly and can only be used once.",
      ],
      ctaLabel: "Sign in",
      ctaHref: confirmLink("magiclink", "/login"),
      afterCtaHtml: `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#5B6472;">
                  Or enter this one-time code: <strong style="color:#0B2545;letter-spacing:0.08em;">{{ .Token }}</strong>
                </p>`,
    }),
  },
  {
    file: "reset-password.html",
    subject: "Reset your Marketing Hub password",
    dashboard: "Reset Password",
    html: brandEmail({
      title: "Reset password",
      heading: "Reset your password",
      paragraphs: [
        "We received a request to reset your Marketing Hub password.",
        "Click the button below to choose a new one.",
      ],
      ctaLabel: "Reset password",
      ctaHref: confirmLink("recovery", "/set-password"),
      afterCtaHtml: `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#5B6472;">
                  If you didn’t request this, you can safely ignore this email.
                </p>`,
    }),
  },
  {
    file: "change-email.html",
    subject: "Confirm your new Marketing Hub email",
    dashboard: "Change Email Address",
    html: brandEmail({
      title: "Confirm email change",
      heading: "Confirm email change",
      paragraphs: [
        "Follow the link below to confirm changing your Marketing Hub email to <strong>{{ .NewEmail }}</strong>.",
      ],
      ctaLabel: "Confirm new email",
      ctaHref: confirmLink("email_change", "/app"),
      afterCtaHtml: `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#5B6472;">
                  If you didn’t request this change, you can ignore this email.
                </p>`,
    }),
  },
  {
    file: "reauthentication.html",
    subject: "Confirm it’s you — Marketing Hub",
    dashboard: "Reauthentication",
    html: brandEmail({
      title: "Confirm it’s you",
      heading: "Confirm it’s you",
      paragraphs: [
        "Enter this code to confirm a sensitive change on your Marketing Hub account.",
      ],
      ctaLabel: "Open Marketing Hub",
      ctaHref: "https://marketing.petersandmay.com/login",
      showFallbackLink: false,
      afterCtaHtml: `<p style="margin:24px 0 0;font-size:28px;line-height:1.2;letter-spacing:0.2em;font-weight:700;color:#0B2545;text-align:center;">
                  {{ .Token }}
                </p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5B6472;text-align:center;">
                  This code expires shortly.
                </p>`,
    }),
  },
];

const readme = `# Auth email templates (branded header)

All Marketing Hub Auth emails share the same Peters &amp; May header (navy + P&amp;M Blue accent) and footer.

CTA links use \`/auth/confirm?token_hash=…\`. That page does not verify on open — the user must click Continue first (Outlook Safe Links safe). Do not switch back to \`{{ .ConfirmationURL }}\` or restore auto-verify-on-GET.

## Apply in Supabase (required for production)

### Preferred: Management API push

\`\`\`bash
# Token: https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
node docs/email-templates/push-to-supabase.mjs
\`\`\`

This updates all six Auth templates (subjects + HTML) on project \`hwtycgvclhckglmuwnmw\`.

### Manual (dashboard)

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/hwtycgvclhckglmuwnmw/auth/templates)
2. Select the template name below
3. Set the **Subject**
4. Paste the full HTML from the matching file
5. Save

| Dashboard name | File | Subject |
|---|---|---|
${templates
  .map((t) => `| ${t.dashboard} | \`${t.file}\` | ${t.subject} |`)
  .join("\n")}

Regenerate HTML after editing \`brand-shell.mjs\` or \`generate.mjs\`:

\`\`\`bash
node docs/email-templates/generate.mjs
\`\`\`

## Local CLI (optional)

\`supabase/config.toml\` points at these files for local Auth email previews.
`;

for (const t of templates) {
  const banner = `<!--
  Dashboard: Authentication → Email Templates → ${t.dashboard}
  Subject: ${t.subject}
  Regenerate: node docs/email-templates/generate.mjs
-->
`;
  writeFileSync(join(dir, t.file), banner + t.html, "utf8");
  console.log("wrote", t.file);
}

writeFileSync(join(dir, "README.md"), readme, "utf8");
console.log("wrote README.md");
