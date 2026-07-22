#!/usr/bin/env node
// Trims scripts/luna-protocol-schema.json (the full extraction, 114 KB) down
// to what the app actually needs, and writes it into app/assets.
//
//   node scripts/build-schema.mjs

import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  "insta360.messages.Options",
  "insta360.messages.PhotographyOptions",
  "insta360.messages.GetOptions",
  "insta360.messages.GetOptionsResp",
  "insta360.messages.SetOptions",
  "insta360.messages.SetOptionsResp",
  "insta360.messages.GetPhotographyOptions",
  "insta360.messages.GetPhotographyOptionsResp",
  "insta360.messages.SetPhotographyOptions",
  "insta360.messages.SetPhotographyOptionsResp",
  "insta360.messages.GetCurrentCaptureStatusResp",
  "insta360.messages.CameraCaptureStatus",
  "insta360.messages.StartCapture",
  "insta360.messages.StopCapture",
  "insta360.messages.TakePicture",
];

/** Enums reachable only through option-type lists, not through a field. */
const EXTRA_ENUMS = [
  "insta360.messages.OptionType",
  "insta360.messages.PhotographyOptionType",
  "insta360.messages.FunctionMode",
  "insta360.messages.CaptureMode",
  "insta360.messages.VideoSubMode",
  "insta360.messages.PhotoSubMode",
];

const full = JSON.parse(fs.readFileSync("scripts/luna-protocol-schema.json", "utf8"));

const messages = new Set();
const enums = new Set(EXTRA_ENUMS);

function walk(name) {
  if (messages.has(name) || !full.messages[name]) return;
  messages.add(name);
  for (const field of Object.values(full.messages[name])) {
    if (!field.ref) continue;
    if (full.messages[field.ref]) walk(field.ref);
    else if (full.enums[field.ref]) enums.add(field.ref);
  }
}
for (const root of ROOTS) walk(root);

const missing = ROOTS.filter((root) => !full.messages[root]);
if (missing.length > 0) {
  console.error("missing roots:", missing);
  process.exit(1);
}

const trimmed = {
  messages: Object.fromEntries([...messages].sort().map((n) => [n, full.messages[n]])),
  enums: Object.fromEntries(
    [...enums].sort().filter((n) => full.enums[n]).map((n) => [n, full.enums[n]]),
  ),
};

const out = path.join("app", "assets", "luna-protocol-schema.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(trimmed));
console.log(
  `wrote ${out}: ${messages.size} messages, ${enums.size} enums, ` +
    `${fs.statSync(out).size} bytes`,
);
