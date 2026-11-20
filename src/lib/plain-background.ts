/**
 * Plain-background removal, on the device, with no model.
 *
 * This is a flood fill, not segmentation. It estimates the background colour
 * from the photo's border, then walks inward from every edge pixel and clears
 * pixels whose colour is within `tolerance` of that estimate. A pixel in the
 * middle of the product is never cleared just because it happens to be white —
 * it has to be connected to the edge through similar pixels.
 *
 * What that means honestly: a product shot on a plain wall, sheet or studio
 * cloth comes out clean. A busy background, a strong shadow or a product that
 * shares its colour with the backdrop will keep some pixels. The UI says this
 * in the same words.
 */

export interface RemovalResult {
  /** A new ImageData. The input is never modified. */
  image: ImageData;
  removed: number;
  total: number;
  /** The colour the border suggested, for the UI swatch. */
  background: { r: number; g: number; b: number };
}

/** Perceptual distance between two RGB triples, 0–255. */
function distance(
  r: number,
  g: number,
  b: number,
  ref: { r: number; g: number; b: number },
): number {
  const dr = r - ref.r;
  const dg = g - ref.g;
  const db = b - ref.b;
  return Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
}

/**
 * The border colour, as the median of a sample of edge pixels.
 *
 * The median rather than the mean: one bright object touching the edge should
 * not drag the estimate far enough to swallow the product. Fully transparent
 * edge pixels are ignored — they are already cut out.
 */
function estimateBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const step = Math.max(1, Math.floor(Math.max(width, height) / 240));

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0) return;
    reds.push(data[i] ?? 0);
    greens.push(data[i + 1] ?? 0);
    blues.push(data[i + 2] ?? 0);
  };

  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (reds.length === 0) return { r: 255, g: 255, b: 255 };
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  return { r: median(reds), g: median(greens), b: median(blues) };
}

/**
 * @param source      Pixels to work on.
 * @param tolerance   0–100 slider value. 0 removes only the exact border
 *                    colour; 100 removes almost anything reachable from the
 *                    edge, which is usually too much.
 */
export function removePlainBackground(source: ImageData, tolerance: number): RemovalResult {
  const { width, height } = source;
  const pixels = new Uint8ClampedArray(source.data);
  const total = width * height;
  const background = estimateBackground(pixels, width, height);

  // 0 → 0, 100 → 190 of a 255 perceptual range.
  const threshold = Math.max(2, (Math.min(100, Math.max(0, tolerance)) / 100) * 190);
  const softBand = Math.max(6, threshold * 0.45);

  const isCandidate = (index: number) => {
    const p = index * 4;
    if ((pixels[p + 3] ?? 0) === 0) return true;
    const d = distance(pixels[p] ?? 0, pixels[p + 1] ?? 0, pixels[p + 2] ?? 0, background);
    return d <= threshold;
  };

  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const push = (index: number) => {
    if (mask[index] === 1) return;
    if (!isCandidate(index)) return;
    mask[index] = 1;
    queue[tail++] = index;
  };

  // Every border pixel is a possible entry point.
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  let removed = 0;
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  for (let index = 0; index < total; index += 1) {
    if (mask[index] === 1) {
      pixels[index * 4 + 3] = 0;
      removed += 1;
    }
  }

  // A hard one-pixel edge looks jagged, especially on a light product against a
  // light wall. Pixels just outside the mask that are still close to the
  // background get a partial alpha, so the cut reads as an edge rather than a
  // staircase.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1) continue;
      const touchesMask =
        (x > 0 && mask[index - 1] === 1) ||
        (x < width - 1 && mask[index + 1] === 1) ||
        (y > 0 && mask[index - width] === 1) ||
        (y < height - 1 && mask[index + width] === 1);
      if (!touchesMask) continue;

      const p = index * 4;
      const d = distance(pixels[p] ?? 0, pixels[p + 1] ?? 0, pixels[p + 2] ?? 0, background);
      if (d <= threshold + softBand) {
        const alpha = Math.round(Math.min(1, (d - threshold) / softBand) * 255);
        pixels[p + 3] = Math.min(pixels[p + 3] ?? 255, alpha);
      }
    }
  }

  return {
    image: new ImageData(pixels, width, height),
    removed,
    total,
    background,
  };
}

/** A copy, so history snapshots never share memory with the live pixels. */
export function cloneImageData(image: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}
