import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Download, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { SavoMascot, mascotSvgMarkup } from "@/components/ai/SavoMascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AiError,
  generateStudioDraft,
  type AiStudioDraft,
  type AiStudioScene,
} from "@/services/ai.service";

/**
 * Pith Studio — the advertising writer.
 *
 * The model is given a brief and returns structured JSON (script, scenes,
 * captions, prompts). Everything is editable through another brief, and every
 * output can be copied or exported, because a draft that can only be read on
 * screen is not a deliverable.
 *
 * No media is generated: there is no image, voice or video service connected,
 * and the screen says so. What it does give is the prompt or script a person can
 * paste into whichever tool they already use.
 */

type Option = { value: string; label: string };

const PLATFORMS: Option[] = [
  { value: "Instagram Reels", label: "Instagram Reels" },
  { value: "TikTok", label: "TikTok" },
  { value: "WhatsApp Status", label: "WhatsApp Status" },
  { value: "Facebook", label: "Facebook" },
  { value: "YouTube Shorts", label: "YouTube Shorts" },
  { value: "In-app poster", label: "Poster / flyer" },
];

const FORMATS: Option[] = [
  { value: "Short video script", label: "Scene-by-scene video" },
  { value: "Voiceover script", label: "Voiceover only" },
  { value: "Social caption", label: "Social caption" },
  { value: "Campaign concept", label: "Campaign concept" },
  { value: "Poster concept", label: "Poster concept" },
  { value: "Image prompt", label: "Image prompt" },
  { value: "Video prompt", label: "Video prompt" },
  { value: "Tutorial outline", label: "Tutorial / onboarding" },
];

const TONES: Option[] = [
  { value: "Warm and practical", label: "Warm and practical" },
  { value: "Playful", label: "Playful" },
  { value: "Professional", label: "Professional" },
  { value: "Calm and reassuring", label: "Calm and reassuring" },
  { value: "Direct", label: "Direct" },
];

const LANGUAGES: Option[] = [
  { value: "English", label: "English" },
  { value: "Swahili", label: "Swahili" },
  { value: "English with Swahili phrases", label: "English + Swahili" },
  { value: "Sheng", label: "Sheng" },
];

const FEATURES: Option[] = [
  { value: "Point of sale", label: "Point of sale" },
  { value: "Stock control", label: "Stock control" },
  { value: "Expenses", label: "Expenses" },
  { value: "Debtors", label: "Debtors" },
  { value: "Receipts", label: "Receipts" },
  { value: "Refunds", label: "Refunds" },
  { value: "Reports", label: "Reports" },
  { value: "Pith Pulse", label: "Pith Pulse" },
  { value: "Employee access", label: "Employee access" },
  { value: "Multiple shops", label: "Multiple shops" },
  { value: "Offline selling", label: "Offline selling" },
];

const DURATIONS: Option[] = [
  { value: "15 seconds", label: "15 seconds" },
  { value: "30 seconds", label: "30 seconds" },
  { value: "45 seconds", label: "45 seconds" },
  { value: "60 seconds", label: "60 seconds" },
  { value: "Under 100 words", label: "Under 100 words" },
];

const VARIATIONS = ["Original", "Shorter, harder hook", "Different opening scene", "More practical, less emotional"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-9 w-full rounded-md border border-input bg-sunken px-2.5 text-sm outline-none focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30";

function draftToMarkdown(draft: AiStudioDraft): string {
  const lines: string[] = [];
  lines.push(`# ${draft.title || "Pith Studio draft"}`);
  lines.push("");
  if (draft.format) lines.push(`**Format:** ${draft.format}`);
  lines.push("");
  if (draft.hook) {
    lines.push("## Hook");
    lines.push(draft.hook);
    lines.push("");
  }
  if (draft.scenes && draft.scenes.length > 0) {
    lines.push("## Scenes");
    for (const scene of draft.scenes) {
      lines.push(`### Scene ${scene.scene ?? ""} — ${scene.duration ?? ""}`.trim());
      if (scene.visual) lines.push(`- **Visual:** ${scene.visual}`);
      if (scene.narration) lines.push(`- **Narration:** ${scene.narration}`);
      if (scene.onScreen) lines.push(`- **On screen:** ${scene.onScreen}`);
      if (scene.transition) lines.push(`- **Transition:** ${scene.transition}`);
      if (scene.sound) lines.push(`- **Sound:** ${scene.sound}`);
      lines.push("");
    }
  }
  if (draft.voiceover) {
    lines.push("## Voiceover");
    lines.push(draft.voiceover);
    lines.push("");
  }
  if (draft.caption) {
    lines.push("## Caption");
    lines.push(draft.caption);
    lines.push("");
  }
  if (draft.hashtags && draft.hashtags.length > 0) {
    lines.push(draft.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" "));
    lines.push("");
  }
  if (draft.cta) {
    lines.push("## Call to action");
    lines.push(draft.cta);
    lines.push("");
  }
  if (draft.notes) {
    lines.push("## Notes");
    lines.push(draft.notes);
    lines.push("");
  }
  lines.push("---");
  lines.push("Written with Pith Studio. Claims are limited to Pith's real features.");
  return lines.join("\n");
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "draft"
  );
}

export function SavoStudio({ isOwner, shopId }: { isOwner: boolean; shopId: string | null }) {
  const [goal, setGoal] = useState("Get more shop owners to try Pith");
  const [audience, setAudience] = useState("Kenyan shop owners running one or two shops");
  const [platform, setPlatform] = useState(PLATFORMS[0]?.value ?? "Instagram Reels");
  const [format, setFormat] = useState(FORMATS[0]?.value ?? "Short video script");
  const [duration, setDuration] = useState(DURATIONS[1]?.value ?? "30 seconds");
  const [tone, setTone] = useState(TONES[0]?.value ?? "Warm and practical");
  const [language, setLanguage] = useState(LANGUAGES[0]?.value ?? "English");
  const [feature, setFeature] = useState(FEATURES[0]?.value ?? "Point of sale");
  const [details, setDetails] = useState("");
  const [variation, setVariation] = useState(VARIATIONS[0] ?? "Original");

  const [draft, setDraft] = useState<AiStudioDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);

  const generate = useCallback(async (nextVariation?: string) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await generateStudioDraft({
        goal,
        audience,
        platform,
        format,
        duration,
        tone,
        language,
        feature,
        details,
        variation: nextVariation ?? variation,
      });
      setDraft(result.studio);
    } catch (cause) {
      setError(
        cause instanceof AiError
          ? cause
          : new AiError("Studio could not write that. Try again.", "internal"),
      );
    } finally {
      setPending(false);
    }
  }, [audience, details, duration, feature, format, goal, language, pending, platform, tone, variation]);

  const markdown = useMemo(() => (draft ? draftToMarkdown(draft) : ""), [draft]);

  async function copyAll() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Draft copied");
    } catch {
      toast.error("Copy failed — select the text instead.");
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Write an advert, caption or video script for Pith. Studio only claims features Pith really
        has — it will not invent statistics, testimonials or discounts.
      </p>

      <div className="mt-3 space-y-2.5">
        <Field label="Objective">
          <input value={goal} onChange={(event) => setGoal(event.target.value)} className={inputClass} maxLength={200} />
        </Field>
        <Field label="Audience">
          <input
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            className={inputClass}
            maxLength={200}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Platform">
            <select value={platform} onChange={(event) => setPlatform(event.target.value)} className={inputClass}>
              {PLATFORMS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select value={format} onChange={(event) => setFormat(event.target.value)} className={inputClass}>
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length">
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className={inputClass}>
              {DURATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tone">
            <select value={tone} onChange={(event) => setTone(event.target.value)} className={inputClass}>
              {TONES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className={inputClass}>
              {LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Feature">
            <select value={feature} onChange={(event) => setFeature(event.target.value)} className={inputClass}>
              {FEATURES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Verified details (optional)">
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Only things that are true, e.g. free to start, works offline. Leave blank rather than guess."
            className="w-full resize-none rounded-md border border-input bg-sunken px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-positive focus-visible:ring-2 focus-visible:ring-positive/30"
          />
        </Field>

        <Button onClick={() => void generate()} disabled={pending} className="h-10 w-full">
          {pending ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {pending ? "Writing…" : draft ? "Write another version" : "Write it"}
        </Button>
      </div>

      {error ? (
        <div role="alert" className="mt-3 rounded-lg border border-caution/30 bg-caution-soft/60 px-3 py-2.5 text-sm">
          <p className="font-medium">
            {error.code === "rate_limited" ? "Studio is at its limit" : "Studio couldn't write that"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void generate()}>
            <RotateCcw /> Try again
          </Button>
        </div>
      ) : null}

      {draft ? (
        <section className="mt-4 rounded-lg border border-glass-line bg-sunken/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{draft.title || "Draft"}</h3>
              <p className="text-[11px] text-muted-foreground">
                {[draft.format, platform, duration].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {draft.hook ? (
            <p className="mt-2 rounded-md bg-positive/10 px-2.5 py-2 text-sm font-medium ring-1 ring-positive/20">
              {draft.hook}
            </p>
          ) : null}

          {draft.scenes && draft.scenes.length > 0 ? (
            <ol className="mt-2.5 space-y-2">
              {draft.scenes.map((scene: AiStudioScene, index) => (
                <li key={index} className="rounded-md border border-glass-line bg-background/30 p-2.5 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Scene {scene.scene ?? index + 1} · {scene.duration ?? "—"}
                  </p>
                  {scene.visual ? <p className="mt-1 leading-relaxed">{scene.visual}</p> : null}
                  {scene.narration ? (
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">VO:</span> {scene.narration}
                    </p>
                  ) : null}
                  {scene.onScreen ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">On screen:</span> {scene.onScreen}
                    </p>
                  ) : null}
                  {scene.transition || scene.sound ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[scene.transition, scene.sound].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {draft.caption ? (
            <div className="mt-2.5">
              <p className="eyebrow mb-1">Caption</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.caption}</p>
            </div>
          ) : null}

          {draft.voiceover ? (
            <div className="mt-2.5">
              <p className="eyebrow mb-1">Voiceover</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.voiceover}</p>
            </div>
          ) : null}

          {draft.hashtags && draft.hashtags.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {draft.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}
            </p>
          ) : null}

          {draft.cta ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold">CTA:</span> {draft.cta}
            </p>
          ) : null}

          {draft.notes ? (
            <p className="mt-2 rounded-md bg-sunken px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {draft.notes}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void copyAll()}>
              {copied ? <Check /> : <Copy />} Copy all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(`savo-studio-${slug(draft.title ?? feature)}.md`, markdown, "text/markdown")}
            >
              <Download /> Markdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  `savo-studio-${slug(draft.title ?? feature)}.json`,
                  JSON.stringify({ brief: { goal, audience, platform, format, duration, tone, language, feature, details }, draft }, null, 2),
                  "application/json",
                )
              }
            >
              <Download /> JSON
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIATIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setVariation(option);
                  void generate(option);
                }}
                disabled={pending}
                className={cn(
                  "press rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                  variation === option
                    ? "border-positive/40 bg-positive/15 text-foreground"
                    : "border-glass-line text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- mascot assets */}
      <section className="mt-4 rounded-lg border border-glass-line bg-sunken/60 p-3">
        <button
          type="button"
          onClick={() => setAssetsOpen((open) => !open)}
          aria-expanded={assetsOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span>
            <span className="block text-sm font-semibold">Mascot assets</span>
            <span className="block text-[11px] text-muted-foreground">
              The canonical character, as a scalable file
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">{assetsOpen ? "Hide" : "Open"}</span>
        </button>

        {assetsOpen ? (
          <div className="mt-2.5">
            <div className="flex items-center gap-3">
              {(["idle", "happy", "thinking"] as const).map((expression) => (
                <div key={expression} className="flex-1 text-center">
                  <div className="grid aspect-square place-items-center rounded-lg bg-emerald-950/40 ring-1 ring-glass-line">
                    <SavoMascot className="block size-12 [&>svg]:size-full" expression={expression} />
                  </div>
                  <p className="mt-1 text-[10px] capitalize text-muted-foreground">{expression}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Emerald body, gold antenna and ear pads, teal-navy visor. Keep proportions identical in
              every placement; only the eyes change.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  download("savo-ai-mascot.svg", mascotSvgMarkup("idle", "Pith AI mascot"), "image/svg+xml")
                }
              >
                <Download /> SVG
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Media generation (images, voice, video) is not connected. Studio writes the prompts and
              scripts; it never claims a file was generated.
            </p>
          </div>
        ) : null}
      </section>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {shopId && isOwner
          ? "Studio is separate from your shop's figures — nothing from your records is sent with a brief."
          : "Studio writes advertising copy for Pith. It does not read or change shop records."}
      </p>
    </div>
  );
}
