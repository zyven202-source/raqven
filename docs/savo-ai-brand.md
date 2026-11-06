# SAVO AI — brand and mascot specification

The single reference for SAVO AI. Any asset used in the app, a store listing, a
tutorial or an advert must match this document. The code that draws the character
is `src/components/ai/SavoMascot.tsx`; it is the source of truth and the artwork
the Studio download button writes.

## The character

SAVO AI is a small technology mascot: **a sphere on a short rounded torso**.

| Part | Description |
| --- | --- |
| Head | Circle, forest emerald, subtle top-left highlight |
| Visor | Rounded teal-navy panel across the head — the face |
| Eyes | Two pale rounded bars; no mouth, no nose |
| Antenna | Single stem with a gold bead, faint gold aura |
| Ear pads | One gold disc on each side of the head |
| Collar | One gold line across the torso |
| Chest | Small pale dot, low opacity |

The silhouette is deliberately simple so it survives at 16 px (favicon), 54 px
(the launcher) and full width (an advert). Never add limbs, hair, clothes, teeth
or a second accessory.

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
