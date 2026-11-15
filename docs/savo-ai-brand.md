# SAVO AI — brand and mascot specification

The single reference for SAVO AI. Any asset used in the app, a store listing, a
tutorial or an advert must match this document.

## The character

SAVO AI's face is **one supplied illustration**, not a drawing in code. It ships
as `public/assistant-icon.png` (256 px) with `public/assistant-icon-512.png` for
larger placements, and `src/components/ai/SavoMascot.tsx` renders that file
wherever the assistant appears — the launcher, the messages, the Studio preview
and the download button.

The illustration has transparent corners and is used whole: no crops, no
recolours, no filters, and no redrawing it in SVG. It replaced an earlier
hand-drawn robot, and the old SVG generator was removed rather than kept beside
it, because two canonical versions of one character is how a brand drifts.

There is one expression. Anything that used to ask for `idle`, `happy` or
`thinking` gets the same picture.

## Colour

| Role | Hex |
| --- | --- |
| Emerald (body, primary) | `#10B981` |
| Emerald deep (gradient) | `#059669` |
| Emerald dark (edge, outline) | `#064E3B` |
| Visor | `#082B33` |
| Pale (eyes, highlights) | `#F0FDF4` |
| Gold (antenna, ears, collar) | `#F59E0B` |
| Gold deep (ear edge) | `#B45309` |

The mascot uses these literal values, not theme tokens: an exported file has no
CSS variables to inherit.

## Expressions

| Name | Eyes | Used for |
| --- | --- | --- |
| `idle` | Two open bars | Default; launcher, headers, ads |
| `happy` | Two upturned arcs | Greeting, success, empty state |
| `thinking` | One eye, one line | While a request is in flight, and antenna glows |

Only the eyes and the antenna aura change. Proportions, colours and silhouette do
not.

## Placement rules

- Floating launcher: 60 px desktop, 54 px mobile, bottom-right, above the dock.
- Never on the POS screen: the till bar occupies that corner and "Take payment"
  must never be covered.
- Respect `env(safe-area-inset-*)` and reduce or remove motion when the operating
  system asks for it.
- The launcher is a button, not a notification: the gold dot is brand, not a badge,
  and it never pulses.

## Voice

Friendly, practical, brief, honest. Plain Kenyan English by default; answer in the
language the person used. Never hype, never invent a number, never call takings
"profit". When something is unknown, say so and point to support:
`mahircade341@gmail.com` · `0143897900`.

## Asset naming

```
savo-ai-mascot.svg              canonical idle character
savo-ai-mascot-happy.svg        greeting variant
savo-ai-mascot-thinking.svg     in-flight variant
savo-studio-<slug>.md           an exported Studio draft
```

Approved assets are the files produced by `mascotSvgMarkup()` in this repository.
Anything else is a draft and must not be published with the SAVO name.

## What SAVO AI may claim

Only real product capabilities: point of sale, offline sales with sync, inventory
and stock movements, low-stock thresholds, expenses, debtors and repayments,
receipts, refunds, reports with CSV export, SAVO Pulse insights, employee access
codes, multiple shops and per-shop data isolation.

It may not claim: M-Pesa statement connections, tax filing, money movement,
universal printer support, customer counts, ratings, awards, discounts or
partnerships. Media generation (image, voice, video) is not connected; Studio
writes prompts and scripts only.
