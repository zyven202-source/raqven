/**
 * The SAVO AI mascot — the canonical artwork.
 *
 * One function draws the character, and both the in-app illustration and the
 * downloaded asset come from it, so a copy exported from Studio can never drift
 * from the one on screen. The artwork is inline SVG with literal brand colours
 * (not theme tokens): an exported file has no CSS variables to inherit, and a
 * mascot that changes colour in a downloaded ad would not be a mascot.
 *
 * Canonical spec — keep these in sync with `docs/savo-ai-brand.md`:
 *   - Round emerald head, 38 units of a 64-unit box, with a teal-navy visor.
 *   - Two pale eyes; no mouth — the visor is the face.
 *   - Gold antenna bead, two gold ear pads, one gold collar line.
 *   - Silhouette: a sphere on a short rounded torso, wider than it is tall.
 *   - Proportions never change. Only the eyes and the antenna glow do.
 */

export const MASCOT = {
  viewBox: 64,
  colors: {
    emerald: "#10B981",
    emeraldDeep: "#059669",
    emeraldDark: "#064E3B",
    visor: "#082B33",
    pale: "#F0FDF4",
    gold: "#F59E0B",
    goldDeep: "#B45309",
  },
} as const;

export type MascotExpression = "idle" | "thinking" | "happy";

const EYES: Record<MascotExpression, string> = {
  // Two soft bars with a highlight — reading, not staring.
  idle: `
    <rect x="24.4" y="24.6" width="4.2" height="6.4" rx="2.1" fill="${MASCOT.colors.pale}"/>
    <rect x="35.4" y="24.6" width="4.2" height="6.4" rx="2.1" fill="${MASCOT.colors.pale}"/>
    <rect x="25.6" y="25.8" width="1.5" height="1.9" rx="0.75" fill="${MASCOT.colors.visor}" opacity="0.5"/>
    <rect x="36.6" y="25.8" width="1.5" height="1.9" rx="0.75" fill="${MASCOT.colors.visor}" opacity="0.5"/>`,
  // One eye narrowed, one open: the "working it out" face.
  thinking: `
    <rect x="24.2" y="24.6" width="4.2" height="6.4" rx="2.1" fill="${MASCOT.colors.pale}"/>
    <path d="M35.6 27.4h4" stroke="${MASCOT.colors.pale}" stroke-width="2.2" stroke-linecap="round"/>`,
  // Two smiles. Never used as a loading spinner.
  happy: `
    <path d="M24.2 28.4q2.2-3.8 4.4 0" stroke="${MASCOT.colors.pale}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M35.4 28.4q2.2-3.8 4.4 0" stroke="${MASCOT.colors.pale}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`,
};

/** A complete, standalone `<svg>` — used on screen and for downloads alike. */
export function mascotSvgMarkup(expression: MascotExpression = "idle", title?: string): string {
  const c = MASCOT.colors;
  const glow = expression === "thinking" ? 0.55 : 0.28;
  const label = title ? `<title>${title.replace(/[<>&]/g, "")}</title>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" role="${title ? "img" : "presentation"}"${title ? "" : ' aria-hidden="true"'}>
${label}
<defs>
  <radialGradient id="savo-ai-body" cx="0.35" cy="0.28" r="0.85">
    <stop offset="0" stop-color="${c.emerald}"/>
    <stop offset="0.62" stop-color="${c.emeraldDeep}"/>
    <stop offset="1" stop-color="${c.emeraldDark}"/>
  </radialGradient>
  <linearGradient id="savo-ai-visor" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${c.visor}"/>
    <stop offset="1" stop-color="#04191F"/>
  </linearGradient>
  <radialGradient id="savo-ai-aura" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${c.gold}" stop-opacity="${glow}"/>
    <stop offset="1" stop-color="${c.gold}" stop-opacity="0"/>
  </radialGradient>
</defs>

<!-- antenna: the only part that ever glows -->
<circle cx="32" cy="4.6" r="7" fill="url(#savo-ai-aura)"/>
<rect x="31.1" y="6.4" width="1.8" height="4.4" rx="0.9" fill="${c.emeraldDark}"/>
<circle cx="32" cy="4" r="2.8" fill="${c.gold}"/>
<circle cx="31.1" cy="3.1" r="0.9" fill="${c.pale}" opacity="0.55"/>

<!-- torso, behind the head so the silhouette stays a single sphere on a base -->
<rect x="19" y="36" width="26" height="15.5" rx="7.6" fill="url(#savo-ai-body)"/>
<rect x="24.8" y="41.4" width="14.4" height="2.2" rx="1.1" fill="${c.gold}"/>
<circle cx="32" cy="47.6" r="1.6" fill="${c.pale}" opacity="0.22"/>

<!-- ear pads -->
<circle cx="12.4" cy="27" r="3.6" fill="${c.goldDeep}"/>
<circle cx="12.4" cy="27" r="2.5" fill="${c.gold}"/>
<circle cx="51.6" cy="27" r="3.6" fill="${c.goldDeep}"/>
<circle cx="51.6" cy="27" r="2.5" fill="${c.gold}"/>

<!-- head -->
<circle cx="32" cy="27" r="19" fill="url(#savo-ai-body)"/>
<circle cx="32" cy="27" r="19" stroke="${c.emeraldDark}" stroke-opacity="0.35" stroke-width="1"/>
<path d="M18.6 18.4a17.2 17.2 0 0 1 13-7.2" stroke="${c.pale}" stroke-opacity="0.35" stroke-width="2.2" stroke-linecap="round"/>

<!-- visor and face -->
<rect x="18.4" y="18.6" width="27.2" height="17.2" rx="8.6" fill="url(#savo-ai-visor)"/>
<rect x="18.4" y="18.6" width="27.2" height="17.2" rx="8.6" stroke="${c.pale}" stroke-opacity="0.12" stroke-width="0.8"/>
${EYES[expression]}
</svg>`;
}

/**
 * The illustration as a React element.
 *
 * Rendered through `dangerouslySetInnerHTML` on purpose: it is the same string
 * the download button writes to a file, produced by this module and nothing
 * else. There is no user input in it.
 */
export function SavoMascot({
  className,
  expression = "idle",
  title,
}: {
  className?: string;
  expression?: MascotExpression;
  title?: string;
}) {
  return (
    <span
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: mascotSvgMarkup(expression, title) }}
    />
  );
}
