#!/usr/bin/env bun
/**
 * Public asset surface check for SAVO.
 *
 * Purpose: the single concrete finding from the public-surface crawl is that
 * `/.well-known/assetlinks.json` and `/assetlinks.json` both return the SPA
 * shell (text/html) instead of JSON. This script is the real verification step
 * for that finding — it fails hard if any asset serves the wrong content type,
 * and it validates the assetlinks JSON against the two real package/fingerprint
 * pairs we verified from the APK in a prior step.
 *
 * Used after a fix so the result is falsifiable.
 */

const BASE = process.env.SCRAP_BASE ?? "https://savo.freebuff.page";

const EXPECTED_ASSETS = {
  "/manifest.webmanifest": "application/manifest+json",
  "/robots.txt": "text/plain",
  "/sitemap.xml": "application/xml",
  "/.well-known/assetlinks.json": "application/json",
  "/assetlinks.json": "application/json",
  "/favicon.ico": "image/vnd.microsoft.icon",
  "/icon-192.png": "image/png",
  "/icon-512.png": "image/png",
  "/sw.js": "application/javascript",
};

const EXPECTED_ASSETLINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "app.freebuff.savo.twa",
      sha256_cert_fingerprints: [
        "F7:C1:E4:96:79:3C:1B:26:10:EE:C9:1D:17:70:D7:31:E9:33:1D:8E:69:61:57:EA:71:3B:39:EC:CF:CC:13:23",
      ],
    },
  },
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "ke.savo.app",
      sha256_cert_fingerprints: [
        "2A:2D:07:6E:07:14:E7:7A:D0:F6:0F:BF:C1:33:4C:D5:CC:40:4D:87:4B:EB:DF:24:17:65:21:E8:0B:2D:2B:01",
      ],
    },
  },
];

const main = async () => {
  const failures = [];

  for (const [path, expectedType] of Object.entries(EXPECTED_ASSETS)) {
    const res = await fetch(new URL(path, BASE).href, { redirect: "follow" });
    /*
      RFC 9239 made `text/javascript` the standard JavaScript media type and
      retired `application/javascript`; the host now sends the standard one.
      Normalise before comparing so the check asserts "this is JavaScript",
      not which of the two equivalent labels is on the wire.
    */
    const type = (res.headers.get("content-type")?.split(";")[0].trim() ?? "(none)").replace(
      /^text\/javascript$/,
      "application/javascript",
    );
    const ok = res.status === 200 && type === expectedType;
    if (!ok) failures.push(`${path}: expect ${expectedType}, got ${res.status} ${type}`);
  }

  // assetlinks content
  for (const path of ["/.well-known/assetlinks.json", "/assetlinks.json"]) {
    const res = await fetch(new URL(path, BASE).href, { redirect: "follow" });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "(none)";
    if (type !== "application/json") {
      failures.push(`${path}: expected application/json, got ${type} (${res.status})`);
      continue;
    }
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      failures.push(`${path}: not parseable JSON`);
      continue;
    }
    const want = EXPECTED_ASSETLINKS;
    const got =
      Array.isArray(parsed) &&
      parsed.length === want.length &&
      parsed.every((s, i) => JSON.stringify(s) === JSON.stringify(want[i]));
    if (!got)
      failures.push(`${path}: assetlinks content does not match the expected two statements`);
  }

  if (failures.length) {
    console.error("SAVO asset surface FAILED:");
    for (const f of failures) console.error("  " + f);
    process.exitCode = 1;
  } else {
    console.log("SAVO asset surface OK");
  }
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
