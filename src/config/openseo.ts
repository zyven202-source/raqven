/**
 * OpenSEO integration configuration for SAVO.
 *
 * OpenSEO is wired as a long-lived MCP client that connects to the hosted
 * OpenSEO endpoint at https://app.openseo.so. This module lives in the
 * client bundle so the app never has to ask for secrets to use the connector:
 * the credentials live server-side or in the user's OpenSEO account and are
 * only referenced by this config at runtime.
 *
 * Keep this file free of any secret values. Secrets belong behind a
 * server-side proxy or the user's account; they are never stored in the
 * browser bundle and never logged here.
 *
 * The standard OpenSEO install flow (per its docs) is:
 *   1. plugin-only agents install the official plugin (bundles MCP + SEO
 *      skills, with OpenSEO namespacing and shared updates);
 *   2. MCP + skills fall back to the connector; and
 *   3. sign-in happens with OAuth, or the user pastes the key into their
 *      client's secret settings. Hand-editing this file is not part of the
 *      supported install path.
 */

export type OpenSEOEndpoint = {
  /**
   * The MCP endpoint OpenSEO uses (hosted or self-hosted). Hosted endpoint:
   * https://app.openseo.so/mcp, self-hosted MCP: /mcp.
   */
  endpoint: string;
  /** Prefer OAuth sign-in over a personal API key. */
  useOAuth: boolean;
};

/**
 * The OpenSEO endpoint we connect to. Keep this idiomatic: hosted OpenSEO
 * is the standard, so we point at the official endpoint. The value here is
 * a public API; the private credential that backs it is configured outside
 * this repo (OpenSEO account or a server-side proxy).
 */
export const OpenSEOEndpoint: OpenSEOEndpoint = {
  endpoint: "https://app.openseo.so/mcp",
  useOAuth: true,
};

/** Plain-language reprs so tooling and logs can identify this connector. */
export function describeOpenSEOEndpoint(): string {
  return `OpenSEO -> ${OpenSEOEndpoint.endpoint} (OAuth: ${OpenSEOEndpoint.useOAuth})`;
}
