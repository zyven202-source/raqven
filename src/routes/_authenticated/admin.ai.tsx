import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, StateBlock } from "@/components/app/AppChrome";
import {
  ASSISTANT_ICON_DOWNLOAD,
  ASSISTANT_ICON_SRC,
  SavoMascot,
} from "@/components/ai/SavoMascot";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchIsPlatformAdmin } from "@/services/analytics.service";
import {
  fetchAiStatus,
  listKnowledge,
  saveKnowledge,
  type AiStatus,
  type KnowledgeEntry,
} from "@/services/ai.service";

/**
 * Platform console → SAVO AI.
 *
 * Every figure on this page is returned by the `savo-ai` function or by an admin
 * RPC that re-checks `app.platform_admins` itself. Nothing is estimated, and no
 * secret is ever rendered: the panel can say "configured" but not what the key
 * is, because the function does not return it.
 *
 * The knowledge editor is the supported way to correct an answer without a
 * deploy. Overrides live in `app.ai_knowledge` and are layered over the bundled
 * text at request time, so an edit takes effect on the next question.
 */

export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({ meta: [{ title: "SAVO — AI console" }] }),
  component: AdminAiPage,
});

const TEMPLATES: { name: string; brief: string }[] = [
  {
    name: "Reel: know your day",
    brief:
      "30-second Reel for Instagram. Goal: show a shop owner that SAVO already knows what sold today. Audience: owners with one shop and a paper book. Feature: reports. Tone: warm, plain English. No statistics.",
  },
  {
    name: "WhatsApp Status: stock-out",
    brief:
      "Short WhatsApp Status caption for existing users. Goal: remind them to set a low-stock threshold. Feature: stock control. Tone: practical. Under 100 words. English with one Swahili phrase.",
  },
  {
    name: "TikTok: credit customers",
    brief:
      "20-second TikTok script, scene by scene. Goal: show that credit customers and repayments are recorded in one place. Feature: debtors. Tone: playful but honest. No testimonials.",
  },
  {
    name: "Poster: offline selling",
    brief:
      "Poster concept for a shop counter. Goal: explain that sales can be recorded offline and sync later. Feature: offline selling. Tone: calm. Include a headline, two lines of body and a call to action.",
  },
];

const MASCOT_NOTES = [
  "Round emerald head with a teal-navy visor; no mouth — the visor is the face.",
  "Gold antenna bead, two gold ear pads, one gold collar line.",
  "Silhouette is a sphere on a short rounded torso; proportions never change.",
  "Only the eyes and the antenna glow change between expressions.",
  "Emerald #10B981 · deep emerald #064E3B · gold #F59E0B · pale #F0FDF4.",
];

function AdminAiPage() {
  const access = useQuery({
    queryKey: ["platform-admin"],
    queryFn: fetchIsPlatformAdmin,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (access.isLoading) return <LoadingState label="Checking access…" />;

  if (!access.data) {
    return (
      <div className="min-h-screen bg-background">
        <AiHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
          <StateBlock
            icon={<ShieldAlert className="size-5" aria-hidden />}
            title="Not available"
            body="This console is limited to the platform owner. Your shop workspace is unaffected."
            action={
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to my shops</Link>
              </Button>
            }
          />
        </main>
      </div>
    );
  }

  return <Console />;
}

function AiHeader() {
  return (
    <header className="border-b border-border bg-card/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
        <Logo compact />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Platform</p>
          <h1 className="truncate text-[1.0625rem] leading-tight">SAVO AI</h1>
        </div>
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2.5 text-sm">
          <Link to="/admin/analytics">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Console</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-right text-sm font-medium">
        {ok === true ? <CheckCircle2 className="size-3.5 text-positive" aria-hidden /> : null}
        {ok === false ? <XCircle className="size-3.5 text-negative" aria-hidden /> : null}
        {value}
      </span>
    </div>
  );
}

function StatusPanel({
  status,
  onRefresh,
  refreshing,
}: {
  status: AiStatus;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const usedPercent = status.limits.requests
    ? Math.min(100, Math.round((status.usageToday.requests / status.limits.requests) * 100))
    : 0;

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Provider</h2>
          <p className="text-xs text-muted-foreground">Groq · OpenAI-compatible chat completions</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Test
        </Button>
      </div>

      <StatusRow
        label="Configured"
        value={status.configured ? "Yes" : "No"}
        ok={status.configured}
      />
      <StatusRow label="Configured model" value={status.model ?? "Not set"} />
      <StatusRow
        label="Model available on account"
        value={status.configured ? (status.modelAvailable ? "Yes" : "No") : "Unknown"}
        {...(status.configured ? { ok: status.modelAvailable } : {})}
      />
      <StatusRow
        label="Connection"
        value={
          status.reachable
            ? `Reachable${status.latencyMs !== null ? ` · ${status.latencyMs} ms` : ""}`
            : status.configured
              ? "Unreachable"
              : "Not configured"
        }
        ok={status.reachable}
      />
      <StatusRow
        label="Daily request limit"
        value={`${status.usageToday.requests} / ${status.limits.requests} used (${usedPercent}%)`}
      />
      <StatusRow
        label="Tokens today"
        value={`${status.usageToday.tokens.toLocaleString()} / ${status.limits.tokens.toLocaleString()}`}
      />
      <StatusRow label="Accounts using AI today" value={String(status.usageToday.accounts)} />

      {status.providerError ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-negative/30 bg-negative-soft/50 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-negative" aria-hidden />
          <span className="leading-relaxed">{status.providerError}</span>
        </div>
      ) : null}

      {!status.configured ? (
        <p className="mt-3 rounded-lg border border-caution/30 bg-caution-soft/50 px-3 py-2 text-xs leading-relaxed">
          Set <code className="font-mono">GROQ_API_KEY</code> and{" "}
          <code className="font-mono">GROQ_MODEL</code> as function secrets (
          <code className="font-mono">supabase secrets set</code>), then ask a question. The key is
          never returned to this page.
        </p>
      ) : null}

      {status.availableModels.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Models visible to this account ({status.availableModels.length})
          </summary>
          <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {status.availableModels.join(", ")}
          </p>
        </details>
      ) : null}
    </section>
  );
}

function FeatureList() {
  const features = [
    { name: "Assistant chat", on: true, note: "Read-only tools, shop-scoped" },
    { name: "SAVO Studio", on: true, note: "Scripts, captions, prompts" },
    { name: "Shop data tools", on: true, note: "Owner and employee, per RLS" },
    { name: "Image generation", on: false, note: "No provider connected" },
    { name: "Voice generation", on: false, note: "No provider connected" },
    { name: "Video generation", on: false, note: "No provider connected" },
  ];
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <h2 className="mb-2 text-sm font-semibold">Feature availability</h2>
      <ul className="space-y-1.5">
        {features.map((feature) => (
          <li key={feature.name} className="flex items-start justify-between gap-3 text-sm">
            <span>
              <span className="block leading-tight">{feature.name}</span>
              <span className="block text-[11px] text-muted-foreground">{feature.note}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                feature.on
                  ? "bg-positive/15 text-foreground ring-1 ring-positive/30"
                  : "bg-sunken text-muted-foreground ring-1 ring-border",
              )}
            >
              {feature.on ? "On" : "Off"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KnowledgeEditor() {
  const queryClient = useQueryClient();
  const knowledge = useQuery({
    queryKey: ["admin-ai-knowledge"],
    queryFn: listKnowledge,
    retry: 1,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const entries: KnowledgeEntry[] = knowledge.data ?? [];

  function loadEntry(entry: KnowledgeEntry) {
    setSelected(entry.slug);
    setSlug(entry.slug);
    setTitle(entry.title);
    setBody(entry.body);
  }

  const save = useMutation({
    mutationFn: () => saveKnowledge({ slug, title, body }),
    onSuccess: async () => {
      toast.success("Help topic saved");
      await queryClient.invalidateQueries({ queryKey: ["admin-ai-knowledge"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Knowledge base</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Overrides layered over the bundled help text. Leave a topic alone to keep the shipped copy.
        Only verified product facts belong here — no prices, partnerships or guarantees.
      </p>

      {knowledge.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading topics…</p>
      ) : knowledge.isError ? (
        <ErrorState message={knowledge.error.message} onRetry={() => void knowledge.refetch()} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No overrides yet. Start a new topic below.
              </p>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.slug}
                  type="button"
                  onClick={() => loadEntry(entry)}
                  className={cn(
                    "press rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    selected === entry.slug
                      ? "border-positive/40 bg-positive/15"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.slug}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setSlug("");
                setTitle("");
                setBody("");
              }}
              className="press rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              + New topic
            </button>
          </div>

          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!slug.trim() || !title.trim() || !body.trim()) {
                toast.error("Slug, title and body are all required.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Slug
                </span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="receipts"
                  maxLength={60}
                  className="h-9 w-full rounded-md border border-input bg-sunken px-2.5 font-mono text-sm outline-none focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Receipts and refunds"
                  maxLength={120}
                  className="h-9 w-full rounded-md border border-input bg-sunken px-2.5 text-sm outline-none focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Verified text
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                maxLength={4000}
                className="w-full resize-y rounded-md border border-input bg-sunken px-2.5 py-2 text-sm leading-relaxed outline-none focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : null}
                Save topic
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Takes effect on the next question.
              </span>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

function MascotPanel() {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <h2 className="text-sm font-semibold">Mascot reference</h2>
      <p className="text-xs text-muted-foreground">
        The one approved character. Do not restyle it.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="grid size-16 place-items-center rounded-lg bg-sunken ring-1 ring-border">
          <SavoMascot className="size-14" />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          One supplied illustration, used at every size. It has no expression variants.
        </p>
      </div>

      <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        {MASCOT_NOTES.map((note) => (
          <li key={note} className="flex gap-1.5">
            <span aria-hidden className="mt-1 size-1 shrink-0 rounded-full bg-positive" />
            {note}
          </li>
        ))}
      </ul>

      <Button asChild variant="outline" size="sm" className="mt-3">
        <a href={ASSISTANT_ICON_SRC} download={ASSISTANT_ICON_DOWNLOAD}>
          <Download /> Download PNG
        </a>
      </Button>
    </section>
  );
}

function TemplatesPanel() {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <h2 className="text-sm font-semibold">Advertising templates</h2>
      <p className="text-xs text-muted-foreground">
        Starting briefs for Studio. Copy one, then adjust it there.
      </p>
      <ul className="mt-2 divide-y divide-border">
        {TEMPLATES.map((template) => (
          <li key={template.name} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{template.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {template.brief}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Copy ${template.name} brief`}
              onClick={() => {
                void navigator.clipboard
                  .writeText(template.brief)
                  .then(() => toast.success("Brief copied"))
                  .catch(() => toast.error("Copy failed"));
              }}
            >
              <Copy />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Console() {
  const status = useQuery({
    queryKey: ["admin-ai-status"],
    queryFn: fetchAiStatus,
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-background">
      <AiHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 sm:px-6">
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Operational truth for the assistant: what is configured, what it has actually served
          today, and which capabilities are on. No API key or token is ever shown here.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {status.isLoading ? (
            <LoadingState label="Testing the provider…" />
          ) : status.isError ? (
            <ErrorState message={status.error.message} onRetry={() => void status.refetch()} />
          ) : status.data ? (
            <StatusPanel
              status={status.data}
              refreshing={status.isFetching}
              onRefresh={() => void status.refetch()}
            />
          ) : null}

          <FeatureList />
          <KnowledgeEditor />
          <MascotPanel />
          <TemplatesPanel />
        </div>

        <section className="mt-4 rounded-xl border border-border bg-card/60 p-4">
          <h2 className="text-sm font-semibold">Privacy and retention</h2>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
            <li>Conversations are held in the browser tab only, cleared when the tab closes.</li>
            <li>
              A question is sent to Groq for processing. Shop figures are read live under the
              caller&apos;s own access and are not stored by the assistant.
            </li>
            <li>SAVO keeps a daily request and token counter per account — no message content.</li>
            <li>Nothing is used to train an external model.</li>
            <li>
              The assistant is read-only: it cannot change prices, stock, balances or permissions.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
