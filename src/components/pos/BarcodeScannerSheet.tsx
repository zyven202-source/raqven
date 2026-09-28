import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * The native Barcode Detection API. It is shipped on Chrome for Android — the
 * target device — and absent on most desktop browsers and Safari, so the
 * component must work either way.
 */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function getDetectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof candidate === "function" ? (candidate as BarcodeDetectorConstructor) : null;
}

type ScanState = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error";

/**
 * Scans a barcode with the device camera and looks it up.
 *
 * There is no fake animation here: the preview is the real camera stream and a
 * code is only reported when the detector actually reads one. When the browser
 * cannot scan, the sheet says so and switches to manual entry rather than
 * pretending.
 */
export function BarcodeScannerSheet({
  open,
  onOpenChange,
  onDetected,
  onManualSubmit,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once per successful scan. */
  onDetected: (barcode: string) => void;
  /** Fallback path — a typed or keypad-entered code. */
  onManualSubmit: (barcode: string) => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string>("");
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setState("idle");
      setMessage("");
      return;
    }

    const Detector = getDetectorConstructor();
    if (!Detector) {
      setState("unsupported");
      setMessage(
        "This browser cannot scan barcodes. Type or paste the code below — it is looked up the same way.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setMessage("No camera is available here. Enter the barcode below instead.");
      return;
    }

    let cancelled = false;
    setState("starting");
    setMessage("Starting the camera…");

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"],
        });

        setState("scanning");
        setMessage("Point the camera at the barcode.");

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          const el = videoRef.current;
          if (el.readyState === el.HAVE_ENOUGH_DATA) {
            try {
              const results = await detector.detect(el);
              const code = results[0]?.rawValue?.trim();
              if (code) {
                stop();
                onDetected(code);
                return;
              }
            } catch {
              // A single failed frame is normal; keep scanning.
            }
          }
          frameRef.current = requestAnimationFrame(() => void tick());
        };
        frameRef.current = requestAnimationFrame(() => void tick());
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState("denied");
          setMessage("Camera access was blocked. Allow it in the browser, or type the code below.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setState("error");
          setMessage("No usable camera was found. Enter the barcode below.");
        } else {
          setState("error");
          setMessage(
            error instanceof Error
              ? `The camera could not start: ${error.message}`
              : "The camera could not start. Enter the barcode below.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onDetected, stop]);

  const cameraLive = state === "scanning" || state === "starting";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" /> Scan a barcode
          </SheetTitle>
        </SheetHeader>

        <div className="relative overflow-hidden rounded-xl border border-border bg-ink-deep">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cameraLive ? "block h-56 w-full object-cover" : "hidden"}
          />
          {!cameraLive ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-background">
              {state === "unsupported" || state === "denied" || state === "error" ? (
                <CameraOff className="size-6" aria-hidden />
              ) : (
                <Camera className="size-6 animate-pulse" aria-hidden />
              )}
              <p className="px-6 text-center text-xs text-background/80">{message}</p>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-champagne/90" />
          )}
        </div>

        {cameraLive ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{message}</p>
        ) : null}

        <div className="mt-5 space-y-2">
          <Label htmlFor="manual-barcode" className="flex items-center gap-1.5 text-xs">
            <Keyboard className="size-3.5" /> Or enter the barcode
          </Label>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const code = manual.trim();
              if (!code) return;
              stop();
              setManual("");
              onManualSubmit(code);
            }}
          >
            <Input
              id="manual-barcode"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="e.g. 5449000000996"
              inputMode="numeric"
              autoComplete="off"
              className="h-12 font-mono"
            />
            <Button type="submit" className="h-12 px-5" disabled={busy || !manual.trim()}>
              Look up
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
