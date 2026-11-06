// Raw IndexedDB upgrade diagnostics: does a versionchange transaction behave
// in this browser, do the stores exist, and what exactly throws?
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.stack ?? String(e)));
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async () => {
  const out = {};
  // The app's module FIRST, while the database is still pristine.
  try {
    const mod = await import("/src/lib/offline/db.ts");
    await mod.setMeta("probe:meta", { hello: "world" });
    out.app = { meta: await mod.getMeta("probe:meta") };
    const db = await mod.openOfflineDb();
    out.app.stores = Array.from(db.objectStoreNames);
  } catch (err) {
    out.app = { error: String(err), stack: String(err.stack ?? "").slice(0, 600) };
  }
  // 2. Raw open, to see the same upgrade path without the module.
  out.raw = await new Promise((resolve) => {
    const req = indexedDB.open("savo-offline", 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const log = ["upgrade fires", `existing=[${Array.from(db.objectStoreNames)}]`];
      try {
        const o = db.createObjectStore("outbox", { keyPath: "txId" });
        o.createIndex("shopId", "shopId", { unique: false });
        db.createObjectStore("products", { keyPath: "id" }).createIndex("shopId", "shopId", {
          unique: false,
        });
        db.createObjectStore("meta", { keyPath: "key" });
        log.push(`created ok now=[${Array.from(db.objectStoreNames)}]`);
      } catch (err) {
        log.push(`THROW ${err} @ ${err.stack}`);
      }
      resolve(log);
    };
    req.onsuccess = () => {
      resolve([
        `already exists version=${req.result.version} stores=[${Array.from(req.result.objectStoreNames)}]`,
      ]);
      req.result.close();
    };
    req.onerror = () => resolve([`open error: ${req.error}`]);
    req.onblocked = () => resolve(["open blocked"]);
  });
  return out;
});

console.log(JSON.stringify(result, null, 1));
await browser.close();
