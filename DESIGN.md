# Mira Health Design System

## Direction

Clinical marketplace, not admin dashboard. Use an airy ice-white canvas, white cards, teal as the health/trust anchor, blue for marketplace/action, amber/coral for watch/risk status, and visual health graphics before explanatory text.

## Color

- Canvas: `#F4F9FA`
- Surface: `#FFFFFF`
- Strong surface: `#FFFFFF`
- Ink: `#12343B`
- Soft ink: `#587177`
- Primary: `#0EA5A4`
- Blue accent: `#3278C7`
- Mint accent: `#5ED5A8`
- Amber status: `#F5B84B`
- Coral risk: `#EE6B6E`

## Type

Use compact but warmer product typography: 24-31px for screen headlines, 18px for section titles, 14-16px for body and inputs, 11-13px for labels. Use fewer paragraphs; let rings, bars, chips, and metric tiles carry status.

## Layout

Mobile first. Use safe areas, bottom tab navigation, large touch targets, and scrollable content. Keep cards at 8px radius or less and avoid nesting cards inside cards.

## Components

Primary surfaces are health status heroes, package cards, AI match panels, freshness indicators, metric snapshot cards, referral commission cards, and booking handoff panels. Status should be visual first: rings, bars, dots, figure diagrams, and simple colored signals before text.

## UX Handoff Notes

- Designer should create mobile frames for login, AI intake, package marketplace, package detail, checkout, order status, hospital admin lookup, referral partner dashboard, and health dashboard.
- Each flow needs empty/loading/error/success states before production.
- Hospital admin screens can be utilitarian and denser than user screens.
- Health dashboard can support multiple display modes, but the simple visual mode should be the default.
- Marketplace cards should look like trustworthy healthcare service cards, not generic ecommerce cards.
- User profile should show identity, consent, goals, and data freshness visually.

## Anti-Patterns

- Do not make the health app look like a web dashboard squeezed onto a phone.
- Do not use purple-blue gradients as the main identity.
- Do not rely on gray text on colored backgrounds.
- Do not overdecorate AI recommendations; they should feel useful, not magical.
