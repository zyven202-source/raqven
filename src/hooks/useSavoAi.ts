import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/hooks/useSession";
import { AiError, askSavoAi, type AiChatTurn } from "@/services/ai.service";

/**
 * Conversation state for Pith AI.
 *
 * Deliberately not React Query: this is a conversation, not a cache, and
 * refetching it on window focus would be wrong. It is also deliberately not in
 * the database — the transcript belongs to the tab, is scoped to one account and
 * one shop, and is gone when the tab closes. That is the privacy position the
 * product can defend without a retention policy nobody reads.
 *
 * Nothing here runs on mount. The first provider request happens when the
 * person sends a message, which is the only thing that should ever cost tokens.
 */

const MAX_TURNS = 12;
const STORAGE_PREFIX = "savo.ai.chat";

type StoredChat = { turns: AiChatTurn[]; updatedAt: number };

function storageKey(userId: string | null, shopId: string | null): string | null {
  if (!userId) return null;
  return `${STORAGE_PREFIX}.${userId}.${shopId ?? "general"}`;
}

function readStored(key: string | null): AiChatTurn[] {
  if (!key) return [];
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChat;
    if (!parsed || !Array.isArray(parsed.turns)) return [];
    return parsed.turns.filter(
      (turn) =>
        (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string",
    );
  } catch {
    return [];
  }
}

function writeStored(key: string | null, turns: AiChatTurn[]): void {
  if (!key) return;
  try {
    if (turns.length === 0) window.sessionStorage.removeItem(key);
    else
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ turns: turns.slice(-MAX_TURNS), updatedAt: Date.now() } satisfies StoredChat),
      );
  } catch {
    /* Session storage full or blocked: the conversation still works in memory. */
  }
}

export type SavoAiState = {
  turns: AiChatTurn[];
  pending: boolean;
  error: AiError | null;
  /** True once a message has been sent — the panel uses it to show suggestions. */
  started: boolean;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  clear: () => void;
  dismissError: () => void;
};

export function useSavoAi(shopId: string | null): SavoAiState {
  const { user } = useSession();
  const key = useMemo(() => storageKey(user?.id ?? null, shopId), [user?.id, shopId]);

  const [turns, setTurns] = useState<AiChatTurn[]>(() => readStored(key));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [started, setStarted] = useState(() => readStored(key).length > 0);

  // The shop can change under an open panel. Reload rather than carry one
  // shop's transcript into another's context.
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    const restored = readStored(key);
    setTurns(restored);
    setStarted(restored.length > 0);
    setError(null);
  }, [key]);

  useEffect(() => {
    writeStored(key, turns);
  }, [key, turns]);

  const run = useCallback(
    async (history: AiChatTurn[]) => {
      setPending(true);
      setError(null);
      try {
        const result = await askSavoAi({ shopId, messages: history.slice(-MAX_TURNS) });
        setTurns([...history, { role: "assistant", content: result.reply }]);
      } catch (cause) {
        setError(
          cause instanceof AiError
            ? cause
            : new AiError("Pith AI could not answer that. Try again.", "internal"),
        );
      } finally {
        setPending(false);
      }
    },
    [shopId],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || pending) return;
      setStarted(true);
      const history = [...turns, { role: "user" as const, content: message }].slice(-MAX_TURNS);
      setTurns(history);
      await run(history);
    },
    [pending, turns, run],
  );

  /** Re-sends the last question without adding a duplicate turn. */
  const retry = useCallback(async () => {
    if (pending) return;
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    if (!lastUser) return;
    const withoutTrailingFailure =
      turns[turns.length - 1]?.role === "user" ? turns : [...turns, lastUser];
    setTurns(withoutTrailingFailure);
    await run(withoutTrailingFailure);
  }, [pending, turns, run]);

  const clear = useCallback(() => {
    setTurns([]);
    setError(null);
    setStarted(false);
    writeStored(key, []);
  }, [key]);

  const dismissError = useCallback(() => setError(null), []);

  return { turns, pending, error, started, send, retry, clear, dismissError };
}
