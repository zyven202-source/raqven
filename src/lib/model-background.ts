/**
 * Background removal with a real segmentation model, on the device.
 *
 * The flood fill in `plain-background.ts` only knows the colour it touched at
 * the edge of the photo. This module runs ISNet — a segmentation network trained
 * for exactly this job — in the browser through `@imgly/background-removal` and
 * ONNX Runtime Web. It finds the subject as an object, so a striped sheet, a
 * shadow or a busy shelf no longer leaves chunks behind.
 *
 * What that costs, honestly:
 *   - The first run downloads the model (tens of MB) and the WASM runtime. The
 *     library caches them in the browser, so later runs are local and quick.
 *   - The photo itself never leaves the device. There is no upload here.
 *   - It needs enough memory to hold one inference. A very large photo is
 *     resized by the caller before it gets here.
 */

/**
 * Where ONNX Runtime Web fetches its WASM runtime from.
 *
 * It is deliberately not shipped in the app bundle: the threaded JSEP build is
 * about 23 MB, which is far past what a static deployment should carry for a
 * feature most visitors never open. The CDN copy is the same file, pinned to the
 * exact runtime version this app installs, and the browser caches it after the
 * first download.
 */
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

export interface ModelProgress {
  /** A short sentence for the status line. */
  label: string;
  /** 0–100 when the library reports a total, otherwise null. */
  percent: number | null;
}

function imageDataToCanvas(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not open a canvas for background removal.");
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be prepared."))),
      "image/png",
    );
  });
}

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not open a canvas for the result.");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** How much of the result is now see-through. Used for the honest status line. */
export function countTransparent(image: ImageData): number {
  const data = image.data;
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 255) === 0) count += 1;
  }
  return count;
}

/**
 * Runs the model and returns a new ImageData with the subject kept.
 *
 * Throws when the runtime cannot start (no WebAssembly, no memory, network
 * blocked on the very first run). The caller falls back to the colour match and
 * says which one it used, rather than pretending the model ran.
 */
export async function removeBackgroundWithModel(
  source: ImageData,
  onProgress?: (progress: ModelProgress) => void,
): Promise<ImageData> {
  onProgress?.({ label: "Loading the segmentation model…", percent: null });

  // Configure the runtime before the library creates a session. Threads need a
  // cross-origin-isolated page; without one, a single thread is the correct and
  // working choice rather than a failed start.
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = ORT_WASM_PATH;
  ort.env.wasm.numThreads =
    typeof globalThis.crossOriginIsolated !== "undefined" && globalThis.crossOriginIsolated
      ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 1))
      : 1;

  const { removeBackground } = await import("@imgly/background-removal");

  const sourceBlob = await canvasToBlob(imageDataToCanvas(source));

  const result = await removeBackground(sourceBlob, {
    // "medium" is the fp16 ISNet build: the same network at half the download.
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key, current, total) => {
      const percent =
        Number.isFinite(total) && total > 0
          ? Math.min(100, Math.round((current / total) * 100))
          : null;
      const what = key.startsWith("fetch")
        ? "Downloading the model (cached after this)…"
        : "Separating the subject from the background…";
      onProgress?.({ label: what, percent });
    },
  });

  onProgress?.({ label: "Finishing the edges…", percent: 100 });
  return blobToImageData(result);
}
