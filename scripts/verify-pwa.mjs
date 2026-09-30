// Post-build PWA check: proves Serwist emitted a valid service worker.
// Runs automatically after `pnpm run build` via the `postbuild` script.
// Uses only node builtins so it needs no test framework.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const swPath = join(ROOT, "public/sw.js");

check("sw.js is emitted", () => {
  assert(existsSync(swPath), "public/sw.js is missing (was Serwist disabled?)");
  assert(statSync(swPath).size > 10_000, "public/sw.js is suspiciously small");
});

check("worker bundles runtime caching (not next-pwa chunks)", () => {
  const sw = readFileSync(swPath, "utf8");
  assert(
    sw.includes("google-fonts-webfonts"),
    "expected defaultCache strategies in bundle"
  );
  assert(
    !/importScripts\(.*workbox-/s.test(sw),
    "found legacy next-pwa workbox chunk imports"
  );
});

check("precache manifest is injected", () => {
  const sw = readFileSync(swPath, "utf8");
  assert(
    sw.includes("/_next/static/"),
    "no precached build chunks found (injectionPoint not replaced?)"
  );
  assert(
    !sw.includes("self.__SW_MANIFEST") || sw.includes("__SW_MANIFEST=["),
    "unreplaced __SW_MANIFEST placeholder"
  );
});

check("web manifest is valid", () => {
  const raw = readFileSync(join(ROOT, "public/manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  assert(
    Array.isArray(manifest.icons) && manifest.icons.length > 0,
    "manifest needs at least one icon"
  );
  assert(typeof manifest.start_url === "string", "manifest needs start_url");
});

if (failures > 0) {
  console.error(`\n${failures} PWA check(s) failed`);
  process.exit(1);
}
console.log("\nAll PWA checks passed");
