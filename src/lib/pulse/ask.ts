/**
 * Ask Pulse — a bounded question interface.
 *
 * The shopkeeper's question is matched against a fixed set of intents, each
 * bound to one tested calculation over data already computed for the screen.
 * There is no SQL generation, no code evaluation and no external model: a
 * question outside the list gets an honest "not supported yet" plus examples,
 * never a fabricated answer.
 *
 * Every answer states the reporting period it used, and every figure in it can
 * be traced back to the same numbers the Pulse overview shows.
 */
import { formatMoney } from "@/lib/format";
import type { AskAnswer, AskContext } from "@/lib/pulse/types";

interface Rule {
  id: string;
  /**
   * Each entry is a group of alternative substrings; a question matches the
   * intent when at least one alternative from *every* group appears in the
   * normalised question. Rules are evaluated in order, so the most specific
   * intent wins when a question would fit more than one.
   */
  groups: string[][];
}

const RULES: Rule[] = [
  {
    id: "restock",
    groups: [
      [
        "restock",
        "reorder",
        "running low",
        "running out",
        "need stock",
        "need restocking",
        "buy more",
        "what should i buy",
        "top up",
      ],
    ],
  },
  {
    id: "profit_change",
    groups: [
      ["profit"],
      ["change", "changed", "why", "explain", "explains", "up", "down", "compare", "versus", "vs"],
    ],
  },
  {
    id: "expenses_change",
    groups: [
      ["expense", "spending"],
      ["change", "changed", "up", "down", "increase", "decrease", "compared", "month", "week"],
    ],
  },
  {
    id: "insufficient_history",
    groups: [["insufficient", "not enough", "enough data", "enough sales", "more history"]],
  },
  {
    id: "top_revenue",
    groups: [
      ["top", "best", "most", "highest", "which products"],
      ["revenue", "selling", "sold", "made", "generated", "money"],
    ],
  },
];

/** The questions Ask Pulse answers today — shown verbatim in the UI. */
export const ASK_EXAMPLES = [
  "Which products generated the most revenue?",
  "Which products may need restocking?",
  "How did recorded expenses change?",
  "Which products have insufficient sales history?",
  "What explains the change in recorded gross profit?",
] as const;

/** The honest reply when nothing matches. */
export const ASK_UNSUPPORTED =
  "I can only answer a few questions precisely. Try one of the examples below — every answer is calculated from your recorded sales, expenses and stock.";

function normalise(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which intent a question maps to, or null when it is outside the list. */
export function matchAskIntent(question: string): string | null {
  const normalised = normalise(question);
  if (!normalised) return null;
  for (const rule of RULES) {
    const matched = rule.groups.every((group) =>
      group.some((alternative) => normalised.includes(alternative)),
    );
    if (matched) return rule.id;
  }
  return null;
}

function money(value: number, ctx: AskContext): string {
  return formatMoney(value, ctx.currency);
}

/**
 * Answers a question from the computed context, or returns null when the
 * question is not supported. Never invents: if the context says the history is
 * thin, the answer says so too.
 */
export function answerAsk(question: string, ctx: AskContext): AskAnswer | null {
  const intent = matchAskIntent(question);
  if (!intent) return null;
  const periodNote = `Based on your ${ctx.periodLabel.toLowerCase()} figures.`;

  switch (intent) {
    case "top_revenue": {
      const top = [...ctx.productLines].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      if (top.length === 0) {
        return {
          intent,
          title: "No recorded sales in this period",
          lines: [{ label: "Recorded sales", value: String(ctx.current.salesCount) }],
          note: periodNote,
          to: "/app/transactions",
        };
      }
      return {
        intent,
        title: "Top products by revenue",
        lines: top.map((line) => ({
          label: line.name,
          value: `${money(line.revenue, ctx)} · ${line.quantity} sold`,
        })),
        note: ctx.thinHistory
          ? `${periodNote} The period is thin, so treat the ranking as provisional.`
          : periodNote,
        to: "/app/transactions",
      };
    }

    case "restock": {
      const flagged = ctx.forecasts
        .filter((row) => row.bucket === "urgent" || row.bucket === "soon")
        .sort((a, b) => (a.daysRemaining ?? 99) - (b.daysRemaining ?? 99))
        .slice(0, 6);
      if (flagged.length === 0) {
        return {
          intent,
          title: "Nothing is flagged for restocking",
          lines: [
            { label: "Products reviewed", value: String(ctx.forecasts.length) },
            {
              label: "Urgent / soon",
              value: "0",
            },
          ],
          note: "Every product is above its reorder threshold or has too little sales history to estimate a run-down date.",
          to: "/app/restock",
        };
      }
      return {
        intent,
        title: "Worth restocking soon",
        lines: flagged.map((row) => ({
          label: row.name,
          value:
            row.daysRemaining !== null
              ? `~${row.daysRemaining} days left · ${row.stock} on shelf`
              : `${row.stock} on shelf · at/below threshold ${row.threshold}`,
        })),
        note: `${periodNote} Estimates use the last 14 days of recorded sales; review quantities before receiving stock.`,
        to: "/app/restock",
      };
    }

    case "expenses_change": {
      const current = ctx.current.expenses;
      const previous = ctx.previous.expenses;
      const change = current - previous;
      const pct = previous === 0 ? null : Math.round((change / previous) * 100);
      const categories = ctx.expenseByCategory
        .filter((row) => row.current > 0 || row.previous > 0)
        .slice(0, 4);
      return {
        intent,
        title: "Recorded expenses",
        lines: [
          { label: ctx.periodLabel, value: money(current, ctx) },
          { label: "Comparison window", value: money(previous, ctx) },
          {
            label: "Change",
            value:
              pct === null
                ? `${change >= 0 ? "+" : ""}${money(change, ctx)} (no comparison to compute a %)`
                : `${change >= 0 ? "+" : ""}${money(change, ctx)} (${pct}%)`,
          },
          ...categories.map((row) => ({
            label: row.category,
            value: `${money(row.current, ctx)} now · ${money(row.previous, ctx)} before`,
          })),
        ],
        note: periodNote,
        to: "/app/expenses",
      };
    }

    case "insufficient_history": {
      return {
        intent,
        title: "Sales history in this period",
        lines: [
          { label: "Sales recorded", value: String(ctx.current.salesCount) },
          { label: "Comparison window", value: String(ctx.previous.salesCount) },
          {
            label: "Verdict",
            value: ctx.thinHistory
              ? "Too few sales for per-product trends"
              : "Enough sales for per-product trends",
          },
        ],
        note: periodNote,
        to: "/app/transactions",
      };
    }

    case "profit_change": {
      const profitNow = ctx.current.estGrossProfit;
      const profitBefore = ctx.previous.estGrossProfit;
      const salesNow = ctx.current.grossSales;
      const salesBefore = ctx.previous.grossSales;
      const costsNow = salesNow - profitNow;
      const costsBefore = salesBefore - profitBefore;
      const expensesDelta = ctx.current.expenses - ctx.previous.expenses;
      const profitDelta = profitNow - profitBefore;
      return {
        intent,
        title: "What moved estimated gross profit",
        lines: [
          {
            label: "Estimated gross profit",
            value: `${money(profitBefore, ctx)} → ${money(profitNow, ctx)} (${
              profitDelta >= 0 ? "+" : ""
            }${money(profitDelta, ctx)})`,
          },
          { label: "Sales", value: `${money(salesBefore, ctx)} → ${money(salesNow, ctx)}` },
          {
            label: "Recorded cost of goods",
            value: `${money(costsBefore, ctx)} → ${money(costsNow, ctx)}`,
          },
          {
            label: "Recorded expenses",
            value: `${money(ctx.previous.expenses, ctx)} → ${money(
              ctx.current.expenses,
              ctx,
            )} (${expensesDelta >= 0 ? "+" : ""}${money(expensesDelta, ctx)})`,
          },
        ],
        note: `${periodNote} Profit here is gross sales less recorded buying costs — an estimate from recorded prices, not a tax figure.`,
        to: "/app/reports",
      };
    }

    default:
      return null;
  }
}
