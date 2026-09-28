import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage";

/**
 * Shown when the browser refuses to store the session. Embedded previews and
 * privacy-hardened browsers do this, and without an explanation the app just
 * looks broken after a sign-in attempt.
 */
export function StorageBlockedNotice({ detail }: { detail?: string | undefined }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5">
      <div className="surface-panel w-full max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto size-6 text-ink-soft" aria-hidden />
        <h1 className="mt-3 text-lg">Sign-in can&apos;t be remembered here</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {detail ?? STORAGE_BLOCKED_MESSAGE}
        </p>
        <Button
          className="mt-5 w-full"
          onClick={() => window.open(window.location.href, "_blank", "noopener")}
        >
          Open RAVQEN in a new tab
        </Button>
      </div>
    </div>
  );
}
