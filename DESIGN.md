# Mira Health Design System

## Direction

Soft clinical commerce cockpit: airy light-blue canvas, white operational surfaces, deep blue ink, and small cyan or mint accents. The reference is a polished mobile workflow tool, adapted for hospital package purchase, AI guidance, and personal health records.

## Color

- Canvas: `#D9EAF8`
- Surface: `#F7FBFF`
- Strong surface: `#FFFFFF`
- Ink: `#17324A`
- Soft ink: `#42657E`
- Primary: `#0D72D9`
- Aqua accent: `#37B7D5`
- Mint accent: `#5ED5A8`
- Amber status: `#F2C04B`

## Type

Use compact product typography with clear hierarchy: 29-30px for screen headlines, 18px for section titles, 14-16px for body and inputs, 11-13px for labels.

## Layout

Mobile first. Use safe areas, bottom tab navigation, large touch targets, and scrollable content. Keep cards at 8px radius or less and avoid nesting cards inside cards.

## Components

Primary surfaces are package cards, AI recommendation rows, booking handoff panels, health metric snapshots, referral commission rows, input groups, and status chips. Each repeated item should have one clear accent and one clear action cue.

## UX Handoff Notes

- Designer should create mobile frames for login, AI intake, package marketplace, package detail, checkout, order status, hospital admin lookup, referral partner dashboard, and health dashboard.
- Each flow needs empty/loading/error/success states before production.
- Hospital admin screens can be utilitarian and denser than user screens.
- Health dashboard can support multiple display modes, but the simple visual mode should be the default.

## Anti-Patterns

- Do not make the health app look like a web dashboard squeezed onto a phone.
- Do not use purple-blue gradients as the main identity.
- Do not rely on gray text on colored backgrounds.
- Do not overdecorate AI recommendations; they should feel useful, not magical.
