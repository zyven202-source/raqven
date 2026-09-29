import { useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReportExport, type ReportExportInput } from "@/hooks/useLedger";

/**
 * How long the button says "Saved" before it goes back to offering itself.
 *
 * Long enough to be read, short enough that a second export a minute later is
 * not queued behind a stale confirmation. The toast is the durable record; this
 * is just the button telling the truth about the click it just received.
 */
const CONFIRM_MS = 2400;

type Phase = "idle" | "working" | "saved" | "failed";

/**
 * Export the current report as CSV.
 *
 * The button is `variant="outline"`, which in this system is glass level 2 with
 * a 12px blur — the everyday control surface, one step below the level 1 cards
 * it sits on. That is the whole reason it is not a filled primary button: an
 * export is something an owner does occasionally, and a full-strength action
 * would outrank the figures it is exporting.
 *
 * Every state the brief asks for is real rather than implied:
 *
 *   - **default** — a download icon and a plain label.
 *   - **hover / focus / pressed** — from `press hover-glass` and the focus ring
 *     that every other control in the product carries.
 *   - **loading** — the label changes and the icon becomes a spinner, so the
 *     button never looks idle while a large report is being assembled.
 *   - **success** — the icon becomes a tick and the label reads "Saved".
 *   - **error** — the icon becomes a warning, the label says so, and the reason
 *     goes to a toast that stays long enough to be read.
 *   - **disabled** — only while a download is already in flight, which is a
 *     real state rather than a punishment.
 *
 * It is never disabled for being empty. A period with no sales still produces a
 * valid report — the figures are real, they are zero — and a greyed-out button
 * with no explanation is worse than a file that honestly says nothing happened.
 */
export function ExportReportButton({
  input,
  onError,
  className,
}: {
  input: ReportExportInput;
  /** Called with a message worth showing, on failure. */
  onError: (message: string) => void;
  className?: string;
}) {
  const exportReport = useReportExport();
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | null>(null);

  // The confirmation is cleared on unmount as well as on the next export, so a
  // shopkeeper who navigates away mid-count does not come back to a button that
  // still claims a file was just saved.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const working = exportReport.isPending;

  function onClick() {
    if (working) return;
    setPhase("working");
    exportReport.mutate(input, {
      onSuccess: (result) => {
        if (!result.delivered) {
          setPhase("failed");
          onError("The browser refused the download. Try a different browser.");
          return;
        }
        setPhase("saved");
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setPhase("idle"), CONFIRM_MS);
      },
      onError: (error) => {
        setPhase("failed");
        onError(
          error instanceof Error
            ? error.message
            : "The export failed. Nothing was changed — try again.",
        );
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setPhase("idle"), CONFIRM_MS);
      },
    });
  }

  const icon =
    phase === "working" ? (
      <Loader2 className="animate-spin" aria-hidden />
    ) : phase === "saved" ? (
      <Check aria-hidden />
    ) : phase === "failed" ? (
      <TriangleAlert aria-hidden />
    ) : (
      <Download aria-hidden />
    );

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={working}
      aria-busy={working}
      className={cn(
        "h-11 justify-center gap-2 px-3.5 text-sm font-medium",
        // The label is the control's accessible name, so it is never dropped to
        // an icon alone — on a phone there is no hover to reveal a tooltip with.
        phase === "failed" && "text-negative",
        className,
      )}
    >
      {icon}
      <span>
        {phase === "working"
          ? "Preparing…"
          : phase === "saved"
            ? "Saved"
            : phase === "failed"
              ? "Not saved"
              : "Export CSV"}
      </span>
    </Button>
  );
}
