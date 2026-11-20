import fs from "fs";
import path from "path";
import zlib from "zlib";

const src =
  process.argv[2] ||
  "c:/Users/Sophie.Edgerley/Downloads/Output format discovery – 2027 Marketing Strategy v3.html";
const outDir =
  "c:/Users/Sophie.Edgerley/OneDrive - Peters&May/Marketing/Website/2025/Marketing Hub/marketing-hub-v2/public/plan/2027";

console.log("source:", src);
const html = fs.readFileSync(src, "utf8");
const manifest = JSON.parse(
  html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1]
);
let tpl = JSON.parse(
  html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/)[1]
);

function extFor(mime) {
  if (!mime) return "bin";
  if (mime.includes("javascript")) return "js";
  if (mime.includes("css")) return "css";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("woff2")) return "woff2";
  if (mime.includes("woff")) return "woff";
  if (mime.includes("json")) return "json";
  return "bin";
}

function decodeEntry(entry) {
  const raw = Buffer.from(entry.data, "base64");
  if (!entry.compressed) return raw;
  try {
    return zlib.gunzipSync(raw);
  } catch {
    try {
      return zlib.inflateSync(raw);
    } catch {
      return raw;
    }
  }
}

const idToFile = {};
for (const [id, entry] of Object.entries(manifest)) {
  const mime = entry.mime || "application/octet-stream";
  const fileName = `${id}.${extFor(mime)}`;
  const buf = decodeEntry(entry);
  fs.writeFileSync(path.join(outDir, fileName), buf);
  idToFile[id] = fileName;
  console.log("wrote", fileName, buf.length, mime);
}

for (const [id, fileName] of Object.entries(idToFile)) {
  tpl = tpl.replaceAll(`src="${id}"`, `src="/plan/2027/${fileName}"`);
  tpl = tpl.replaceAll(`url("${id}")`, `url("/plan/2027/${fileName}")`);
  tpl = tpl.replaceAll(`url('${id}')`, `url('/plan/2027/${fileName}')`);
}

if (!tpl.includes('name="robots"')) {
  tpl = tpl.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">'
  );
}
tpl = tpl.replace(
  "<title>2027 Marketing Strategy v3</title>",
  "<title>2027 Marketing Strategy (draft)</title>"
);

const banner = `<div role="status" class="plan-draft-banner" style="background:#071A2E;color:#E3E6E9;font-family:'Archivo',Arial,sans-serif;font-size:13px;line-height:1.4;letter-spacing:0.02em;text-align:center;padding:10px 16px;border-bottom:1px solid #1B3A5B">Internal draft — Marketing 2027 strategy (not final)</div>`;

tpl = tpl.replace(
  /<sc-if value="\{\{ showPhotos \}\}"[\s\S]*?<\/sc-if>/,
  `<sc-if value="{{ showPhotos }}" hint-placeholder-val="{{ true }}">
      <div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#1b3a5b">
        <img src="/plan/2027/assets/hero.png" alt="Peters &amp; May yacht lift at the quayside" width="1200" height="900" style="display:block;width:100%;height:100%;object-fit:cover">
      </div>
    </sc-if>`
);

tpl = tpl.replace(
  /<nav aria-label="Plan sections"[^>]*>/,
  `<nav aria-label="Plan sections" class="plan-sticky-nav" style="position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e3e6e9">\n${banner}\n`
);

// Remove any legacy standalone draft banner / header Comments control from older exports.
tpl = tpl.replace(
  /<div role="status"[^>]*>Internal draft — Marketing 2027 strategy \(not final\)<\/div>\s*/g,
  (match) => (match.includes("plan-draft-banner") ? match : "")
);
tpl = tpl.replace(
  /<div style="margin-left:auto;display:flex;align-items:center;flex-shrink:0;padding-left:12px"><button type="button" class="plan-comments-toggle"[\s\S]*?<\/button><\/div>/g,
  ""
);

const headExtras = `<link rel="stylesheet" href="/plan/2027/annotations.css">
<style>html{scroll-padding-top:140px}body.plan-comments-open{padding-right:320px}@media (max-width:899px){body.plan-comments-open{padding-right:0}}x-dc{display:block}nav.plan-sticky-nav{position:sticky;top:0;z-index:50}</style>
`;
if (!tpl.includes("annotations.css")) {
  tpl = tpl.replace("</head>", `${headExtras}</head>`);
} else {
  tpl = tpl.replace(
    /<style>html\{scroll-padding-top:140px\}[\s\S]*?<\/style>/,
    `<style>html{scroll-padding-top:140px}body.plan-comments-open{padding-right:320px}@media (max-width:899px){body.plan-comments-open{padding-right:0}}x-dc{display:block}nav.plan-sticky-nav{position:sticky;top:0;z-index:50}</style>`
  );
}
if (!tpl.includes("annotations.js")) {
  tpl = tpl.replace(
    "</body>",
    `<script src="/plan/2027/annotations.js"></script>\n</body>`
  );
}

fs.writeFileSync(path.join(outDir, "index.html"), tpl, "utf8");
console.log("index.html bytes", tpl.length);
console.log({
  draft: tpl.includes("Internal draft"),
  stickyNav: tpl.includes("plan-sticky-nav"),
  hero: tpl.includes("assets/hero.png"),
  jump: tpl.includes("Jump to division"),
  annotations: tpl.includes("annotations.js"),
});
