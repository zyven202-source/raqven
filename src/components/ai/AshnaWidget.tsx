import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * The Ashna AI widget — an additional assistant alongside the native SAVO AI.
 *
 * Loaded from the root layout rather than from a route, so it belongs to the
 * whole product and no screen has to remember to mount it. The loader is
 * injected as a real `<script>` element in an effect: React does not reliably
 * execute a `<script>` that arrives as JSX, whereas an element the browser
 * appends is fetched and run exactly as the vendor's snippet intends.
 *
 * The embed token is a publishable, origin-restricted identifier that ships in
 * the client bundle by design. It still comes from `VITE_ASHNA_AI_TOKEN` rather
 * than a literal so the repository holds a name, not a value, and rotating it
 * is an env change rather than a code change. Unset means no widget at all —
 * never a half-embed or console noise.
 *
 * The till is the one screen where a fixed bubble in that corner would sit on
 * top of "Take payment". The native mascot already steps aside there, so this
 * one does the same: the host element is hidden rather than torn down, so
 * walking back from the till does not fetch and re-initialise the widget.
 */

const WIDGET_SRC = "https://app.ashna.ai/embed/agent-widget.js";
const AGENT_ID = "6af4b2760a3887001318c482";
const TOKEN = import.meta.env["VITE_ASHNA_AI_TOKEN"] as string | undefined;

/** Screens where a floating launcher would cover the primary control. */
const HIDDEN_ON = new Set(["/app/pos"]);

export function AshnaWidget() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = HIDDEN_ON.has(pathname);

  useEffect(() => {
    if (!TOKEN) {
      // Missing is a build problem, not a runtime one. Say so plainly rather
      // than shipping a page that quietly has no assistant: the previous
      // deploy did exactly that because the build had no env file to read.
      console.warn("[ashna] VITE_ASHNA_AI_TOKEN is not set — the assistant is not loaded.");
      return;
    }
    // The router can remount the root; never inject the loader twice.
    if (document.querySelector("script[data-ashna-widget]")) return;

    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.dataset["ashnaWidget"] = "true";
    script.setAttribute("data-agent-id", AGENT_ID);
    script.setAttribute("data-token", TOKEN);
    // SAVO's emerald rather than the vendor's default violet, so the launcher
    // reads as part of this product. Rounded to match the app's own controls.
    // SAVO's forest green rather than the vendor's default violet, so the
    // launcher belongs to the product it sits in.
    script.setAttribute("data-icon-color", "#123C2D");
    script.setAttribute("data-icon-shape", "rounded");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.dataset["ashnaHidden"] = "true";
    else delete root.dataset["ashnaHidden"];
  }, [hidden]);

  return null;
}
