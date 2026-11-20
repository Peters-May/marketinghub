# Peters & May Design System

Bespoke logistics group — Global Yacht Transport, Global Freight Forwarding, Commercial Marine Transport, under one Peters & May corporate identity. Brand promise: **"We bring experienced thinking to complex logistics."** Five principles: expertise, consultation, foresight, control, confidence.

Sources: `uploads/Brand Guidelines 2026.pdf` (v2.0, July 2026 — current standard, supersedes the Feb 2016 guide in `uploads/PM-Brand-Guide_FINAL.pdf`, kept for reference only) and the logo artwork files in `uploads/`.

## Components
Core: Button, Badge, Card. Forms: Input, Select, Checkbox. Feedback: Alert. Navigation: Tabs.

## Structure
- `styles.css` — root stylesheet, imports everything in `tokens/`
- `tokens/` — colors, typography, spacing/radius/shadow, fonts, base element defaults
- `components/core|forms|feedback|navigation/` — React primitives, each with `.jsx` + `.d.ts` + `.prompt.md` + a `.card.html` demo
- `assets/logos/` — all approved lock-ups (corporate + three divisional, positive/reversed, plus the Netherlands legacy mark)
- `uploads/` — source brand guide PDFs and raw logo exports

## Visual foundations (Brand Guidelines v2.0, July 2026)
**Colour.** Ensign Navy `#0B2545` carries the brand; white is the working surface. P&M Blue `#007DC5` is the single UI accent. Ensign Red and grey stay in the logo artwork only — never used as a layout or status colour. Working proportion is navy-led for brand/marketing material, white-led for documents, quotations and dashboards where legibility comes first. Status colours (success/warning/danger) come from a separate UI-safe palette, always paired with a word or icon, never colour alone. Legacy 2016 gradients, superyacht gold and racing yellow are retired.

**Type.** League Spartan sets headlines/titles/social; Archivo is the working type for body, labels, tables and interface; Arial is the fallback where fonts can't be installed. Both are SIL Open Font License (free, no seat licence). Practical minimums: 10pt print body, 16px screen, 18pt on slides. Sentence case for headlines; wide-tracked capitals for short labels only. PT Sans lives in the logo wordmark only — never retype the logotype.

**Layout.** Hierarchy before decoration — lead with what the reader needs, structure with rules/space/weight before panels or colour. Marketing material: one idea per page. Working documents (quotations, schedules, dashboards) may be dense — density isn't a fault. Cards/fills are allowed in reports and dashboards when they aid scanning: mist fills, hairline borders, **no shadows or gradients** in that context (component library shadows here are a UI-system allowance, kept subtle and cool-grey). 12-column grid, 4mm gutter for A4; generous outer margins.

**Imagery.** Peters & May's own operational photography leads. Daylight, wide shots showing the scale of the lift; level horizons on vessels, restrained grading, no heavy filters; people shown working rather than posed. Text over image uses a navy scrim or a solid side panel — contrast is what matters, not the device.

**Motion & states.** No brand guidance on animation specifics; this system uses short (120–200ms), standard-eased transitions and keeps interaction subtle — colour/border shifts on hover, a 1px press shift, no bounce.

**Corners & shadows.** Restrained radii (8px controls/cards, up to 18px for a logo-tile feel). Soft, always-cool-grey shadows, never coloured, never used as a design flourish — quiet enough to survive being turned off.

## Content fundamentals (voice)
Consultative, specific, unhurried. Six rules: show the thinking (say why a route/season/method is right); be specific where possible, silent where unverifiable; active voice, short sentences, no jargon a captain or shipper wouldn't use; address one reader ("your yacht," not "clients' vessels"); British English, "Peters & May" in full on first mention; no claim without a verified source.

Avoid: hype, superlatives, exclamation marks, emoji, "seamless," "solutions provider," "world-class," "revolutionary." Never state a company figure (offices, volumes, certifications) from memory — those live in the dated factsheet (Appendix A of the brand guide) and are supplied at point of use, not invented here.

Example — rather than *"World-class seamless logistics solutions,"* write *"Complex movements, planned properly."* Rather than *"We are passionate about exceeding expectations,"* write *"We will tell you what the risk is before you book."*

## Iconography
No bespoke icon font or SVG icon set was found in the supplied materials. Component demos use minimal inline stroke-style glyphs (chevrons, checks, dismiss) sized and weighted to sit quietly beside Archivo text — treat these as placeholders, not a defined icon system. No emoji (explicitly against brand voice). If Peters & May has a house icon library, flag it and it should replace these.

## Logos (`assets/logos/`)
Four approved lock-ups: **Bespoke Logistics** (corporate, default), **Global Yacht Transport**, **Global Freight Forwarding**, **Commercial Marine Transport** (artwork descriptor pending "Marine" addition per v2.0). Each exists positive and reversed. `pm-netherlands.png` is the legacy Transport Partners transition mark — pending retirement, do not use in new work. Never rebuild, recolour or retype any wordmark; request fresh artwork from marketing@petersandmay.com for anything not already in this folder.

## Caveats — please help me iterate
- **Font substitution risk removed** for headlines/body (League Spartan + Archivo are now loaded from Google Fonts, matching the guide exactly) — but the **logo wordmark's PT Sans** is not embedded anywhere except as locked artwork, per the guide's own rule.
- Status colours (success/warning/danger) are my own UI-safe palette, since the guide only says "take them from the approved digital token set" without giving hex values — **please confirm or correct these three.**
- No icon system was supplied — if one exists, send it and I'll wire it in instead of the placeholder glyphs.
- No product UI (app/dashboard) screenshots, Figma, or codebase were supplied, so no UI kit exists yet — tell me which surface (marketing site, quotation tool, ops dashboard) to mock first and I'll build it.
- The brand guide is still a "working draft" with several **decisions pending** (strapline choice, Netherlands retirement date, Pantone matching) — none of those affect this system, but flagging so nothing here gets treated as final ahead of sign-off.
