import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StateBlock } from "@/components/app/AppChrome";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage";

/**
 * Shown when the browser refuses to store the session. Embedded previews and
 * privacy-hardened browsers do this, and without an explanation the app just
 * looks broken after a sign-in attempt.
 */
export function StorageBlockedNotice({ detail }: { detail?: string | undefined }) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-5">
      <StateBlock
        tone="danger"
        icon={<ShieldAlert className="size-5" aria-hidden />}
        title="Sign-in can't be remembered here"
        body={detail ?? STORAGE_BLOCKED_MESSAGE}
        action={
          <Button
            onClick={() => window.open(window.location.href, "_blank", "noopener")}
            className="h-12"
          >
            Open RAVQEN in a new tab
          </Button>
        }
      />
    </div>
  );
}
