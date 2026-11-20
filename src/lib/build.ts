/**
 * Which build is this page running?
 *
 * The value is injected by `vite.config.ts` at build time (the short commit
 * SHA, with a `+dirty` suffix when the tree had uncommitted changes) and is
 * also written to `/version.json` by `scripts/write-build-info.mjs`. Those two
 * are the only places a deployment's identity comes from, and they must agree:
 * the running bundle knows what it is, the server says what is currently
 * published, and the difference is what tells the app an update exists.
 *
 * Why the care: SAVO is a PWA on shop phones that may stay open for days. When
 * the shell and its chunks disagree, a reload used to be able to bring back an
 * older release. A build id is what makes "am I current?" answerable instead of
 * guessed at.
 *
 * `HAS_BUILD_ID` is false only in development or if the injection ever fails.
 * Callers use it to stay silent rather than show a permanent, false "update
 * available" banner — a build with no id cannot prove it is out of date.
 */
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string =
  typeof __BUILD_ID__ === "string" && __BUILD_ID__.length > 0 ? __BUILD_ID__ : "dev";

export const HAS_BUILD_ID = BUILD_ID !== "dev";
