/**
 * A UUID for an operation id.
 *
 * `crypto.randomUUID()` is the right tool and is what runs everywhere Pith
 * targets (secure context: HTTPS, localhost, the installed PWA). The fallback
 * exists only so a non-secure origin does not throw mid-checkout — it draws
 * from `crypto.getRandomValues`, never `Math.random`, because this value is a
 * financial operation's identity and must not be guessable.
 */
export function randomUUID(): string {
  const cryptoApi = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Nothing cryptographic available: still unique enough to never collide
  // within one device's queue, and the server's unique index backstops it.
  return `tx-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
