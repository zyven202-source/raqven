/**
 * The whole server for the Sites deployment.
 *
 * SAVO is a static single-page app: `bun run build` prerenders the shell to
 * `dist/index.html` and every runtime query goes from the browser straight to
 * Supabase. So the Worker's only job is to hand the request to the static
 * assets binding — Sites supplies `env.ASSETS` for the uploaded build, and the
 * manifest's `spa: true` makes an unknown path resolve to `index.html` instead
 * of a 404, which is what the client router needs for deep links such as
 * `/legal/privacy` or `/app/pos`.
 *
 * The one exception is the Digital Asset Links statement. Google Play's TWA
 * check fetches `/.well-known/assetlinks.json`, and the Sites uploader rejects
 * dot-directories, so the file is uploaded as `/assetlinks.json` and mapped
 * here. Without this the Play-installed package cannot be verified against the
 * origin (README, "Android").
 */
const ASSETLINKS_PATH = "/.well-known/assetlinks.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === ASSETLINKS_PATH) {
      const target = new URL("/assetlinks.json", url);
      return env.ASSETS.fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  },
};
