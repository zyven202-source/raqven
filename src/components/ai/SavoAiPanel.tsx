import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";

import { SavoMascot } from "@/components/ai/SavoMascot";
import { SavoStudio } from "@/components/ai/SavoStudio";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSavoAi } from "@/hooks/useSavoAi";

/**
 * The Pith AI assistant panel.
 *
 * Two surfaces, one component: a near-full-height sheet on a phone and a panel
 * anchored above the mascot on a desktop. It is a real modal — `aria-modal`,
 * Escape to close, focus moved to the input on open and returned to the launcher
 * on close — because a chat window that traps a keyboard user is worse than no
 * chat window.
 *
 * Model output is rendered as text, never as HTML or markdown. The model is
 * asked for plain answers, and nothing it writes can become markup here.
 */

type Tab = "ask" | "studio";

const MAX_INPUT = 2000;

type Suggestion = { label: string; prompt: string; needs: "any" | "shop" | "owner" };

const SUGGESTIONS: Suggestion[] = [
  { label: "Help me use Pith", prompt: "Help me use Pith", needs: "any" },
  { label: "Check low stock", prompt: "Which products are running low on stock?", needs: "shop" },
  { label: "Summarize my sales today", prompt: "Summarize my recorded sales for today.", needs: "shop" },
  { label: "Explain my business report", prompt: "Explain how to read my business report.", needs: "any" },
  { label: "Who owes me money?", prompt: "Which debtors have outstanding balances?", needs: "shop" },
  { label: "How did this month go?", prompt: "How did my shop do this month so far?", needs: "owner" },
  { label: "Create a Pith advertisement", prompt: "", needs: "any" },
];

export function SavoAiPanel({
  onClose,
  shopId,
  shopName,
  isOwner,
  signedIn,
}: {
  onClose: () => void;
  shopId: string | null;
  shopName: string | null;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("ask");
  const { turns, pending, error, started, send, retry, clear, dismissError } = useSavoAi(shopId);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, pending]);

  // Grow with the text up to a ceiling, then scroll inside the box.
  const resize = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void send(text);
  }, [draft, pending, send]);

  const suggestions = SUGGESTIONS.filter((suggestion) => {
    if (!signedIn) return suggestion.needs === "any";
    if (suggestion.needs === "shop") return shopId !== null;
    if (suggestion.needs === "owner") return shopId !== null && isOwner;
    return true;
  });

  return (
    <>
      {/* Scrim: mobile only. On a desktop the panel is anchored, not modal over
          the whole page, so a full-screen dim would be heavier than the job. */}
      <button
        type="button"
        aria-label="Close Pith AI"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-ink-deep/45 backdrop-blur-[2px] sm:hidden"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="savo-ai-title"
        className={cn(
          "glass-sheet fixed z-50 flex flex-col overflow-hidden border border-glass-1-line bg-[var(--glass-1)] backdrop-blur-2xl backdrop-saturate-150",
          "inset-x-0 bottom-0 h-[min(88dvh,46rem)] rounded-t-glass-lg",
          "sm:inset-x-auto sm:right-5 sm:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:h-[min(38rem,calc(100dvh-3rem))] sm:w-[26rem] sm:rounded-glass-lg",
        )}
        style={{ boxShadow: "var(--shadow-glass-sheet)" }}
      >
        {/* ------------------------------------------------------------- header */}
        <header className="flex items-start gap-2.5 border-b border-glass-line px-3.5 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-positive/15 ring-1 ring-positive/30">
            <SavoMascot
              className="block size-7 [&>svg]:size-full"
              expression={pending ? "thinking" : "idle"}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="savo-ai-title" className="text-[0.9375rem] font-semibold leading-tight">
              Pith AI
            </h2>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {shopName ? `Answers for ${shopName}` : "Ask about Pith"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {turns.length > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={clear}
                aria-label="Clear this conversation"
                title="Clear conversation"
                className="text-muted-foreground"
              >
                <Trash2 />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Minimise Pith AI"
              className="text-muted-foreground"
            >
              <ChevronDown />
            </Button>
          </div>
        </header>

        {/* --------------------------------------------------------------- tabs */}
        <div role="tablist" aria-label="Pith AI" className="flex gap-1 border-b border-glass-line px-3 pt-2">
          {(
            [
              { key: "ask", label: "Ask" },
              { key: "studio", label: "Studio" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.key}
              role="tab"
              type="button"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={cn(
                "press relative rounded-t-md px-3 pb-2 pt-1 text-sm font-medium transition-colors",
                tab === entry.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
              {tab === entry.key ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-positive"
                />
              ) : null}
            </button>
          ))}
        </div>

        {tab === "studio" ? (
          <SavoStudio isOwner={isOwner} shopId={shopId} />
        ) : (
          <>
            {/* --------------------------------------------------------- transcript */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3"
              aria-live="polite"
              aria-busy={pending}
            >
              {turns.length === 0 ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <SavoMascot className="mt-0.5 block size-8 shrink-0 [&>svg]:size-full" expression="happy" />
                    <div className="rounded-xl rounded-tl-sm bg-positive/10 px-3 py-2.5 text-sm leading-relaxed ring-1 ring-positive/20">
                      <p className="font-medium">Hello — I&rsquo;m Pith AI.</p>
                      <p className="mt-1 text-muted-foreground">
                        {shopId
                          ? "Ask me about this shop's recorded sales, stock, expenses or debtors — or how to do something in Pith."
                          : "Ask me how Pith works, or what a screen is for. Sign in and open a shop to ask about its figures."}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pl-0.5">
                    <p className="eyebrow">Try one of these</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          onClick={() => {
                            if (suggestion.prompt) {
                              void send(suggestion.prompt);
                            } else {
                              setTab("studio");
                            }
                          }}
                          className="press rounded-full border border-glass-line bg-glass-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <ol className="space-y-3">
                  {turns.map((turn, index) =>
                    turn.role === "user" ? (
                      <li key={index} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-ink px-3 py-2 text-sm leading-relaxed text-primary-foreground">
                          {turn.content}
                        </p>
                      </li>
                    ) : (
                      <li key={index} className="flex items-start gap-2">
                        <SavoMascot className="mt-1 block size-6 shrink-0 [&>svg]:size-full" />
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-tl-sm bg-sunken px-3 py-2 text-sm leading-relaxed ring-1 ring-glass-line">
                          {turn.content}
                        </div>
                      </li>
                    ),
                  )}
                  {pending ? (
                    <li className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      Reading your records…
                    </li>
                  ) : null}
                  <li>
                    <div ref={endRef} />
                  </li>
                </ol>
              )}

              {error ? (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-caution/30 bg-caution-soft/60 px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-foreground">
                    {error.code === "rate_limited"
                      ? "Pith AI is at its limit"
                      : error.code === "not_configured"
                        ? "Pith AI is not configured"
                        : error.code === "provider_unavailable" || error.code === "network"
                          ? "Pith AI is unavailable"
                          : "That didn't work"}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
                  <div className="mt-2 flex gap-2">
                    {error.code !== "not_configured" && error.code !== "forbidden" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void retry()}
                        disabled={pending}
                      >
                        <RotateCcw /> Try again
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={dismissError}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* ------------------------------------------------------------ composer */}
            <div className="border-t border-glass-line px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2.5 sm:pb-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
                className="flex items-end gap-2"
              >
                <label htmlFor="savo-ai-input" className="sr-only">
                  Ask Pith AI
                </label>
                <textarea
                  id="savo-ai-input"
                  ref={inputRef}
                  value={draft}
                  rows={1}
                  maxLength={MAX_INPUT}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    resize();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={shopId ? "Ask about this shop…" : "Ask about Pith…"}
                  className="tnum max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-input bg-sunken px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-10 shrink-0 rounded-full"
                  disabled={pending || draft.trim().length === 0}
                  aria-label="Send message"
                >
                  {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                </Button>
              </form>

              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {shopId
                  ? "Figures are read live from your shop's records, under your own access. Answers can be wrong — check anything important."
                  : "Pith AI explains the product. It cannot change prices, stock, balances or permissions."}
              </p>
              {started && turns.length > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  <Sparkles className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                  Messages go to the AI provider for processing and are cleared when you close this tab.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}

