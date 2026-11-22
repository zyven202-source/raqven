import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Download,
  ImagePlus,
  Info,
  Loader2,
  RotateCcw,
  Scissors,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/fields";
import { StorageImage } from "@/components/app/StorageImage";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/hooks/useProducts";
import { useSaveStudioPhoto } from "@/hooks/useStudio";
import { cloneImageData, removePlainBackground } from "@/lib/plain-background";
import { countTransparent, removeBackgroundWithModel } from "@/lib/model-background";
import { cn } from "@/lib/utils";
import { STORAGE_BUCKETS } from "@/types/savo";

/**
 * SAVO Studio — the product photo editor.
 *
 * Everything here runs in the tab. The photo is read with `createImageBitmap`,
 * edited as `ImageData` on a canvas, and only leaves the device when the user
 * saves it. Background removal uses a real segmentation model (ISNet, through
 * ONNX Runtime Web) on this device; a colour-matching flood fill is kept as an
 * explicit fallback for a device where the model cannot start, and the screen
 * always says which one produced the cut.
 */

const OUTPUT = 1024;
const MAX_SOURCE = 1400;
const HISTORY_LIMIT = 10;

type Preset = {
  id: string;
  label: string;
  colour?: string;
  gradient?: [string, string];
};

const PRESETS: Preset[] = [
  { id: "white", label: "White", colour: "#ffffff" },
  { id: "paper", label: "Warm paper", colour: "#f4ede1" },
  { id: "sand", label: "Sand", colour: "#e7d8c3" },
  { id: "grey", label: "Studio grey", colour: "#e9e9e6" },
  { id: "sage", label: "Sage", colour: "#dfe7dd" },
  { id: "emerald", label: "SAVO emerald", colour: "#0d3b2e" },
  { id: "charcoal", label: "Charcoal", colour: "#1d2420" },
  { id: "sunrise", label: "Sunrise", gradient: ["#ffe9c9", "#ffb27a"] },
  { id: "sky", label: "Soft sky", gradient: ["#e8f1ff", "#b7d2f2"] },
  { id: "transparent", label: "Transparent" },
];

function paintBackground(
  ctx: CanvasRenderingContext2D,
  preset: Preset,
  customColour: string | null,
) {
  ctx.clearRect(0, 0, OUTPUT, OUTPUT);
  if (preset.id === "transparent") return;

  if (customColour) {
    ctx.fillStyle = customColour;
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    return;
  }
  if (preset.gradient) {
    const gradient = ctx.createLinearGradient(0, 0, OUTPUT, OUTPUT);
    gradient.addColorStop(0, preset.gradient[0]);
    gradient.addColorStop(1, preset.gradient[1]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = preset.colour ?? "#ffffff";
  }
  ctx.fillRect(0, 0, OUTPUT, OUTPUT);
}

/** Loads a chosen file into editing pixels, at a bounded size. */
async function fileToPixels(file: File): Promise<ImageData> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPEG, PNG or WebP).");
  if (file.size > 20 * 1024 * 1024) throw new Error("That photo is larger than 20 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SOURCE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not open a canvas for editing.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

export function PhotoStudio({ shopId }: { shopId: string }) {
  const products = useProducts({ shopId, includeArchived: false, limit: 200 });
  const savePhoto = useSaveStudioPhoto(shopId);

  const [source, setSource] = useState<ImageData | null>(null);
  const [working, setWorking] = useState<ImageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [tolerance, setTolerance] = useState(28);
  const [presetId, setPresetId] = useState("white");
  const [customColour, setCustomColour] = useState<string | null>(null);
  const [scale, setScale] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [historyDepth, setHistoryDepth] = useState(0);
  const [productId, setProductId] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; percent: number | null } | null>(null);
  const [removalNote, setRemovalNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const history = useRef<ImageData[]>([]);
  const drag = useRef<{ pointerId: number; x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const preset = useMemo(
    () => PRESETS.find((entry) => entry.id === presetId) ?? PRESETS[0]!,
    [presetId],
  );
  const selectedProduct = useMemo(
    () => (products.data ?? []).find((product) => product.id === productId) ?? null,
    [products.data, productId],
  );

  // `removePercent` is informational only; a ref keeps it out of the redraw path.
  const lastRemoved = useRef(0);
  const removePercent = working
    ? Math.round((lastRemoved.current / Math.max(1, working.width * working.height)) * 100)
    : 0;

  // ------------------------------------------------------------------ drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    paintBackground(ctx, preset, customColour);
    if (!working) return;

    const layer = document.createElement("canvas");
    layer.width = working.width;
    layer.height = working.height;
    layer.getContext("2d")?.putImageData(working, 0, 0);

    const fit = Math.min(OUTPUT / working.width, OUTPUT / working.height);
    const drawScale = fit * (scale / 100);
    const width = working.width * drawScale;
    const height = working.height * drawScale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      layer,
      (OUTPUT - width) / 2 + offset.x,
      (OUTPUT - height) / 2 + offset.y,
      width,
      height,
    );
  }, [working, preset, customColour, scale, offset]);

  // ------------------------------------------------------------------- input
  async function loadFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const pixels = await fileToPixels(file);
      history.current = [];
      setHistoryDepth(0);
      setSource(pixels);
      setWorking(cloneImageData(pixels));
      setScale(100);
      setOffset({ x: 0, y: 0 });
      setSavedPath(null);
      lastRemoved.current = 0;
      toast.success("Photo opened", {
        description: `${pixels.width} × ${pixels.height} pixels, edited on this device.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That photo could not be opened.");
    } finally {
      setBusy(false);
      if (galleryInput.current) galleryInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  // --------------------------------------------------------------- background
  function snapshot() {
    if (!working) return;
    history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), cloneImageData(working)];
    setHistoryDepth(history.current.length);
  }

  /** The real thing: a segmentation model that finds the subject as an object. */
  async function removeBackground() {
    if (!working || busy) return;
    snapshot();
    setBusy(true);
    setProgress({ label: "Starting the segmentation model…", percent: null });
    try {
      const image = await removeBackgroundWithModel(working, setProgress);
      const cleared = countTransparent(image);
      lastRemoved.current = cleared;
      setWorking(image);
      setRemovalNote("Removed with the on-device segmentation model.");
      toast.success("Background removed", {
        description: `${Math.round((cleared / (image.width * image.height)) * 100)}% of the photo is now transparent. The photo never left this device.`,
      });
    } catch (error) {
      // Never pretend the model ran. Fall back to the colour match and name it.
      const fallback = removePlainBackground(working, tolerance);
      lastRemoved.current = fallback.removed;
      setWorking(fallback.image);
      setRemovalNote("The model could not start here, so the colour match was used instead.");
      toast.error("The model could not start on this device", {
        description: `${error instanceof Error ? error.message : "Unknown error."} The plain-colour fallback ran instead — check the edges.`,
        duration: 10_000,
      });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  /** The fallback: border-colour flood fill. Kept deliberately, labelled as such. */
  function removePlainBackgroundFallback() {
    if (!working || busy) return;
    snapshot();
    const result = removePlainBackground(working, tolerance);
    lastRemoved.current = result.removed;
    setWorking(result.image);
    setRemovalNote("Removed with the plain-colour fallback.");
    toast.success("Plain background removed", {
      description: `${Math.round((result.removed / result.total) * 100)}% of pixels cleared. Adjust the match strength if any stayed.`,
    });
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setHistoryDepth(history.current.length);
    setWorking(previous);
  }

  function reset() {
    if (!source) return;
    history.current = [];
    setHistoryDepth(0);
    setWorking(cloneImageData(source));
    setScale(100);
    setOffset({ x: 0, y: 0 });
    lastRemoved.current = 0;
    setRemovalNote(null);
  }

  // ------------------------------------------------------------------ gestures
  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!working) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = OUTPUT / Math.max(1, rect.width);
    const x = Math.max(-800, Math.min(800, state.ox + (event.clientX - state.x) * ratio));
    const y = Math.max(-800, Math.min(800, state.oy + (event.clientY - state.y) * ratio));
    setOffset({ x, y });
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // -------------------------------------------------------------------- output
  async function renderBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }

  async function exportPng() {
    const blob = await renderBlob();
    if (!blob) {
      toast.error("The photo could not be exported.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `savo-studio-${selectedProduct?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "photo"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("PNG downloaded", {
      description: `${OUTPUT} × ${OUTPUT}, transparent where you cleared it.`,
    });
  }

  async function saveToProduct() {
    if (!selectedProduct) {
      toast.error("Choose the product this photo belongs to.");
      return;
    }
    const blob = await renderBlob();
    if (!blob) {
      toast.error("The photo could not be rendered.");
      return;
    }
    const file = new File([blob], `studio-${selectedProduct.id}.png`, { type: "image/png" });
    try {
      const result = await savePhoto.mutateAsync({
        shopId,
        productId: selectedProduct.id,
        file,
      });
      setSavedPath(result.productPath);
      toast.success(`Saved to ${selectedProduct.name}`, {
        description: result.listingUpdated
          ? "The product and its Marketlink listing now show the new photo. The original file is untouched."
          : "The product now shows the new photo. The original file is untouched.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The photo could not be saved.", {
        duration: 8000,
      });
    }
  }

  const saving = savePhoto.isPending;
  const disabled = !working || busy;

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------------- honesty */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-surface)] px-3.5 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">The cut runs on this device.</span>{" "}
          Background removal uses a segmentation model (ISNet) in this tab — the first use downloads
          it, then it is cached. The photo is never uploaded for editing, and a save never
          overwrites the original file.
        </p>
      </div>

      {/* --------------------------------------------------------------- canvas */}
      <div className="relative mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-[var(--brand-line)] bg-[var(--brand-raised)]">
          <canvas
            ref={canvasRef}
            width={OUTPUT}
            height={OUTPUT}
            role="img"
            aria-label={
              working
                ? "Product photo preview. Drag to reposition the product."
                : "Empty product photo preview"
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              "block aspect-square w-full touch-none select-none",
              working ? "cursor-grab active:cursor-grabbing" : "opacity-0",
            )}
            style={
              working && preset.id === "transparent"
                ? {
                    backgroundImage:
                      "linear-gradient(45deg,#d9d9d6 25%,transparent 25%,transparent 75%,#d9d9d6 75%),linear-gradient(45deg,#d9d9d6 25%,transparent 25%,transparent 75%,#d9d9d6 75%)",
                    backgroundSize: "24px 24px",
                    backgroundPosition: "0 0,12px 12px",
                  }
                : undefined
            }
          />

          {!working ? (
            <div className="absolute inset-0 grid place-items-center px-6">
              {busy ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Opening the photo…
                </span>
              ) : (
                <div className="w-full text-center">
                  <ImagePlus className="mx-auto size-7 text-muted-foreground" aria-hidden />
                  <p className="mt-2 text-sm font-medium">Start with a real photo</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Take one now, or pick one from this device. A plain wall, sheet or cloth behind
                    the product gives the cleanest cut.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      type="button"
                      className="h-11 w-full"
                      onClick={() => cameraInput.current?.click()}
                    >
                      <Camera className="size-4" /> Take a photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={() => galleryInput.current?.click()}
                    >
                      <ImagePlus className="size-4" /> Choose from gallery
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void loadFile(event.target.files?.[0] ?? null)}
        />
        <input
          ref={galleryInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void loadFile(event.target.files?.[0] ?? null)}
        />

        {working ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => galleryInput.current?.click()}
              >
                <ImagePlus className="size-3.5" /> Replace
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => cameraInput.current?.click()}
              >
                <Camera className="size-3.5" /> Camera
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={undo}
                disabled={historyDepth === 0}
              >
                <Undo2 className="size-3.5" /> Undo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={reset}
                disabled={!source}
              >
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------------------- controls */}
      {working ? (
        <>
          <section className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Background</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  A segmentation model finds the product itself, so patterned cloth, shadows and
                  busy shelves no longer leave patches behind. It runs in this tab.
                </p>
              </div>
            </div>

            <Button
              type="button"
              className="mt-3 h-11 w-full"
              onClick={() => void removeBackground()}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
              {busy ? "Removing background…" : "Remove background"}
            </Button>

            {progress ? (
              <p
                className="mt-1.5 text-center text-[11px] text-muted-foreground"
                aria-live="polite"
              >
                {progress.label}
                {progress.percent !== null ? ` ${progress.percent}%` : ""}
              </p>
            ) : (
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                The first run downloads the model once, then it is cached. The photo never leaves
                this device.
              </p>
            )}

            {removalNote ? (
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{removalNote}</p>
            ) : null}

            <details className="mt-3 rounded-lg border border-[var(--brand-line)] px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium">
                Colour-match fallback
              </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                For a plain wall or sheet, and for a device where the model cannot start. It only
                clears pixels joined to the edge that match the edge colour.
              </p>

              <label className="mt-2 block">
                <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Match strength
                  <span className="tnum text-foreground">{tolerance}</span>
                </span>
                <input
                  type="range"
                  min={4}
                  max={80}
                  step={1}
                  value={tolerance}
                  onChange={(event) => setTolerance(Number(event.target.value))}
                  className="mt-2 h-2 w-full accent-[var(--brand-primary)]"
                />
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Higher clears more of a pale, even backdrop. Too high starts eating pale products.
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-9 w-full"
                onClick={removePlainBackgroundFallback}
                disabled={busy}
              >
                <Scissors className="size-3.5" /> Use the colour match
              </Button>
            </details>
          </section>

          <section className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-3.5">
            <h2 className="text-sm font-semibold">Studio backdrop</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((entry) => {
                const active = presetId === entry.id && !customColour;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setPresetId(entry.id);
                      setCustomColour(null);
                    }}
                    className={cn(
                      "press flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      active
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-foreground"
                        : "border-[var(--brand-line)] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-4 shrink-0 rounded-full border border-black/10"
                      style={{
                        background: entry.gradient
                          ? `linear-gradient(135deg, ${entry.gradient[0]}, ${entry.gradient[1]})`
                          : (entry.colour ?? "transparent"),
                      }}
                    />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <label className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Custom colour</span>
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColour ?? preset.colour ?? "#ffffff"}
                  onChange={(event) => setCustomColour(event.target.value)}
                  className="size-9 cursor-pointer rounded-md border border-[var(--brand-line)] bg-transparent p-0.5"
                  aria-label="Custom backdrop colour"
                />
                {customColour ? (
                  <button
                    type="button"
                    onClick={() => setCustomColour(null)}
                    className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </span>
            </label>
          </section>

          <section className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-3.5">
            <h2 className="text-sm font-semibold">Position and size</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Drag the photo, or use the sliders.
            </p>

            <label className="mt-3 block">
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Size <span className="tnum text-foreground">{scale}%</span>
              </span>
              <input
                type="range"
                min={25}
                max={180}
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
                className="mt-2 h-2 w-full accent-[var(--brand-primary)]"
              />
            </label>
            <label className="mt-3 block">
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Horizontal <span className="tnum text-foreground">{Math.round(offset.x)}</span>
              </span>
              <input
                type="range"
                min={-700}
                max={700}
                value={Math.round(offset.x)}
                onChange={(event) =>
                  setOffset((current) => ({ ...current, x: Number(event.target.value) }))
                }
                className="mt-2 h-2 w-full accent-[var(--brand-primary)]"
              />
            </label>
            <label className="mt-3 block">
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vertical <span className="tnum text-foreground">{Math.round(offset.y)}</span>
              </span>
              <input
                type="range"
                min={-700}
                max={700}
                value={Math.round(offset.y)}
                onChange={(event) =>
                  setOffset((current) => ({ ...current, y: Number(event.target.value) }))
                }
                className="mt-2 h-2 w-full accent-[var(--brand-primary)]"
              />
            </label>
          </section>

          <section className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-3.5">
            <h2 className="text-sm font-semibold">Save</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Export the PNG, or attach it to a product. A save writes a new file; the original
              photo is never replaced.
            </p>

            <div className="mt-3 space-y-2">
              <Field label="Product" htmlFor="studio-product">
                <Select
                  value={selectedProduct?.id ?? ""}
                  onValueChange={(value) => {
                    setProductId(value);
                    setSavedPath(null);
                  }}
                >
                  <SelectTrigger id="studio-product" className="h-11">
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products.data ?? []).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selectedProduct ? (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-surface)] px-2.5 py-2">
                  <StorageImage
                    bucket={STORAGE_BUCKETS.productImages}
                    path={savedPath ?? selectedProduct.image_url}
                    alt={`${selectedProduct.name} — current photo`}
                    className="size-10 shrink-0"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {savedPath ? "New photo saved. " : "Current product photo. "}
                    Saving adds another file to storage; it does not delete this one.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {(products.data ?? []).length === 0
                    ? "Add a product first — a Studio photo is saved onto a real product."
                    : "Choose the product this photo belongs to."}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => void exportPng()}
                >
                  <Download className="size-4" /> Export PNG
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1"
                  onClick={() => void saveToProduct()}
                  disabled={saving || !selectedProduct}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {savedPath ? "Saved" : "Save to product"}
                </Button>
              </div>
              {savedPath ? (
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-positive">
                  <Check className="size-3.5" aria-hidden /> Saved as a new file
                </p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted-foreground">
        {working ? `${removePercent}% of pixels cleared so far · ` : ""}
        Edits stay in this tab until you save or export.
      </p>
    </div>
  );
}
