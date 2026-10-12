import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { OfflineBanner, UpdateBanner } from "@/components/app/ConnectivityBar";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { useSession } from "@/hooks/useSession";
import {
  OG_IMAGE_ALT,
  OG_IMAGE_URL,
  SEO_DESCRIPTION,
  SEO_TITLE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import appCss from "../styles.css?url";
import { SEARCH_CONSOLE_VERIFICATION_TOKEN } from "@/lib/store-links";
import { reportLovableError } from "../lib/lovable-error-reporting";

/**
 * The branded not-found page.
 *
 * Two things it has to get right. It must not look like a crash — a shopkeeper
 * who tapped a stale link needs to see that the *page* is missing and their
 * records are not. And "back" means somewhere different depending on who is
 * asking: a signed-in owner wants their shop list, a visitor wants the landing
 * page. Neither choice bypasses anything — `/dashboard` carries the same
 * session gate as every other authenticated route, so a signed-out visitor who
 * follows it is bounced to the sign-in screen with their return path kept.
 */
function NotFoundComponent() {
  const { user, loading } = useSession();
  const signedIn = !loading && user !== null;
  const home = signedIn ? "/dashboard" : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-14">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl leading-tight text-foreground">This page isn&rsquo;t here</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The address may be wrong, or the page has moved. Nothing in your shop has changed — a
          missing page never touches your records.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 px-5">
            <Link to={home}>{signedIn ? "Go to my shops" : "Go home"}</Link>
          </Button>
          {signedIn ? (
            <Button asChild variant="outline" className="h-11 px-5">
              <Link to="/">SAVO home</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SEO_TITLE },
      { name: "description", content: SEO_DESCRIPTION },
      { name: "author", content: SITE_NAME },
      // Every route is crawlable unless it says otherwise; the authenticated
      // app redirects signed-out crawlers to /auth, so there is nothing to
      // hide. Without this the per-page `robots` meta on the landing page
      // disagrees with pages that carry none at all.
      { name: "robots", content: "index, follow" },
      // Search Console's HTML-tag verification, emitted on every route. The
      // token is empty until it is pasted from the Search Console console,
      // and an empty value renders no tag at all.
      ...(SEARCH_CONSOLE_VERIFICATION_TOKEN
        ? [{ name: "google-site-verification", content: SEARCH_CONSOLE_VERIFICATION_TOKEN }]
        : []),
      /*
        The fallback social card for every route. The home page overrides
        these with its own set, but a shared link to `/auth/login` or `/app/pos`
        still has to unfurl into something better than a bare URL, and an
        `og:image` that is only declared on one route is an image that is
        missing from every other one.
      */
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SEO_TITLE },
      { property: "og:description", content: SEO_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:locale", content: "en_KE" },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: SEO_TITLE },
      { name: "twitter:description", content: SEO_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE_URL },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap",
      },
      // The favicon is the flat, single-ink cut of the R tile: a gradient and
      // a gloss are mud at 16px, so `generate-icons.mjs` renders these without
      // the lighting. The larger icons carry the full material, for the home
      // screen and for anything that asks for a real app icon.
      //
      // Only `rel`/`href` descriptors belong here. A `{ name, content }`
      // descriptor — `theme-color`, `apple-mobile-web-app-title` — is written
      // into the prerendered shell as a `<link>` but rendered by React as a
      // `<meta>`, and the two disagreeing makes every single page load throw a
      // hydration error. Both of those values live in `manifest.webmanifest`
      // instead, which is where the platform actually reads them from.
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { online, updateReady, applyUpdate } = useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      {/* The two slivers of PWA truth: connectivity and a pending update. */}
      {!online ? <OfflineBanner /> : null}
      {updateReady ? <UpdateBanner onUpdate={applyUpdate} /> : null}
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
