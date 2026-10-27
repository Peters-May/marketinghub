/**
 * Resume Asia to Americas. Skips addresses already recorded as sent.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(fileURLToPath(import.meta.url));
const react = require("react") as { cache?: unknown };
if (typeof react.cache !== "function") {
  react.cache = (fn: unknown) => fn;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  console.log("resuming");
  const { sendEmailCampaign } = await import("@/lib/email/send-campaign");
  const result = await sendEmailCampaign("ecamp_asia_americas", { manual: true });
  console.log(
    JSON.stringify({
      ok: result.ok,
      sent: result.sent,
      failed: result.failed,
      status: result.campaign?.status ?? null,
      error: result.error ?? "",
    })
  );
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
