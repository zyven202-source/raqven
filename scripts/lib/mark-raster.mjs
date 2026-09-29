// The rasteriser both the icon generator and the mark verifier use.
//
// It lives here rather than inside either script for one reason: the verifier's
// whole job is to measure what the generator actually wrote. If the two had
// their own flattening, or their own idea of where a curve's edge falls, a mark
// that rendered badly would still pass its own test — and a test that is
// confidently wrong is worse than no test. One implementation, two callers.
//
// There is no image library in this project and there is not going to be one.
// The mark is three filled outlines, so it is filled the way a plotter fills a
// shape: flatten the curves, then scanline with four sub-rows per pixel row and
// exact horizontal spans. That gives a properly anti-aliased edge, which is the
// only thing a rasteriser would really have been for.

/**
 * Flatten a path to a list of closed polylines.
 *
 * Handles exactly the commands the mark is authored in — move, cubic, line and
 * close — and throws on anything else. A path is data, not code, so a silently
 * skipped command would show up as a shape quietly missing part of itself
 * rather than as an error, and that is exactly the kind of bug that survives
 * until someone looks at the favicon.
 */
export function flatten(d, steps = 24) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? [];
  const polys = [];
  let poly = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case "M":
        if (poly && poly.length > 2) polys.push(poly);
        x = num();
        y = num();
        poly = [[x, y]];
        break;
      case "L":
        x = num();
        y = num();
        poly?.push([x, y]);
        break;
      case "C": {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const x3 = num();
        const y3 = num();
        for (let s = 1; s <= steps; s += 1) {
          const t = s / steps;
          const u = 1 - t;
          poly?.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ]);
        }
        x = x3;
        y = y3;
        break;
      }
      case "Z":
        if (poly && poly.length > 2) polys.push(poly);
        poly = null;
        break;
      default:
        throw new Error(`mark-raster: unsupported path command "${cmd}"`);
    }
  }
  if (poly && poly.length > 2) polys.push(poly);
  return polys;
}

/** Apply a point transform to a set of polylines. */
export function place(polys, fn) {
  return polys.map((poly) => poly.map(([x, y]) => fn(x, y)));
}

/**
 * Scanline-fill the polylines into a coverage buffer in [0, 1].
 *
 * `polys` must be in the same space as the buffer: [0, size] on both axes.
 * Nonzero winding, which is what an SVG fill means and what the overlapping
 * ribbons at the mark's junction rely on.
 */
export function coverage(polys, size, samples = 4) {
  const cov = new Float32Array(size * size);
  const edges = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      if (ay !== by) edges.push([ax, ay, bx, by]);
    }
  }

  const inv = 1 / samples;
  for (let sy = 0; sy < size * samples; sy += 1) {
    const y = (sy + 0.5) * inv;
    const row = ((sy / samples) | 0) * size;
    const xs = [];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push([ax + ((bx - ax) * (y - ay)) / (by - ay), by > ay ? 1 : -1]);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p[0] - q[0]);

    let winding = 0;
    for (let i = 0; i < xs.length - 1; i += 1) {
      winding += xs[i][1];
      if (winding === 0) continue;
      const left = Math.max(0, xs[i][0]);
      const right = Math.min(size, xs[i + 1][0]);
      for (let x = Math.floor(left); x < Math.ceil(right); x += 1) {
        if (x < 0 || x >= size) continue;
        const l = Math.max(left, x);
        const r = Math.min(right, x + 1);
        if (r > l) cov[row + x] += (r - l) * inv;
      }
    }
  }
  return cov;
}

/** Distance from a point to an open polyline. Used for creases and highlights. */
export function polylineDistance(px, py, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const d = Math.hypot(px - ax - dx * t, py - ay - dy * t);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distance from a point to a superellipse's edge, negative inside.
 *
 * The boundary is solved in polar form: r(θ) = ( |cosθ|^n + |sinθ|^n )^(-1/n),
 * which is the same curve the SVG path is sampled from — a rounded rectangle
 * would be a different function and the icon would stop matching the tile the
 * app draws.
 *
 * This is the radial difference rather than a true Euclidean distance, which is
 * fine for a smooth anti-aliased edge: it is monotonic in the outward
 * direction, and it is only ever compared against a pixel-sized threshold.
 */
export function squircleDistance(px, py, radius, exponent) {
  const theta = Math.atan2(py, px);
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const boundary = radius * (c ** exponent + s ** exponent) ** (-1 / exponent);
  return Math.hypot(px, py) - boundary;
}

// ------------------------------------------------------------- gradients

export const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgb = (hex) => hexToRgb(hex);
export const stop = (at, hex, alpha) => ({ at, colour: rgb(hex), alpha });

/**
 * A linear gradient with `gradientUnits="userSpaceOnUse"`, evaluated the way
 * SVG evaluates one: project the point onto the axis between the two endpoints
 * and walk the stops. The endpoints go through the mark's transform, so a
 * gradient authored in glyph space lands in the right place on the tile.
 *
 * Returns `[r, g, b, alpha]`.
 */
export function makeGradient(stops, from, to) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  return (px, py) => {
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1].at) i += 1;
    const a = stops[i];
    const b = stops[i + 1];
    const local = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
    return [
      mix(a.colour[0], b.colour[0], local),
      mix(a.colour[1], b.colour[1], local),
      mix(a.colour[2], b.colour[2], local),
      mix(a.alpha ?? 1, b.alpha ?? 1, local),
    ];
  };
}
