#!/usr/bin/env node
/**
 * Publishes a release of the apps to the public downloads repo
 * (github.com/Lukefen31/horus-releases) with the stable asset names the
 * site's /download page links to. Takes the files from a folder: locally
 * built ones, or a folder filled by `gh run download` from a CI run.
 *
 *   node apps/scripts/publish-release.mjs <version> <folder> [--notes "…"]
 *
 * The folder is searched recursively for:
 *   Horus-Setup-*.exe          → Horus-Setup.exe
 *   Horus-*-portable.exe       → Horus-portable.exe
 *   Horus-*.dmg                → Horus.dmg
 *   Horus-*.AppImage           → Horus.AppImage
 *   Horus-*.deb                → Horus.deb
 *   club/…/app-release.apk     → Horus-club.apk      (and .aab → Horus-club.aab)
 *   member/…/app-release.apk   → Horus-member.apk    (and .aab → Horus-member.aab)
 *   Horus-*-simulator.app.zip, Horus-*.xcarchive.zip → kept as they are
 * Missing files are skipped and listed; the release is created (or updated)
 * with whatever is present, so a partial release can be completed later.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const [version, folder, ...rest] = process.argv.slice(2);
if (!version || !folder) {
  console.error("usage: publish-release.mjs <version> <folder> [--notes text]");
  process.exit(1);
}
const notes = rest[0] === "--notes" ? rest[1] : `Horus ${version}: the desktop app for Windows, macOS and Linux, and the Android apps. See horus.farm/download.`;
const REPO = "Lukefen31/horus-releases";
const tag = `v${version}`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(folder);
const pick = (test) => files.find((f) => test(f.replace(/\\/g, "/")));
const wanted = [
  ["Horus-Setup.exe", pick((f) => /Horus-Setup-[\d.]+\.exe$/.test(f))],
  ["Horus-portable.exe", pick((f) => /Horus-[\d.]+-portable\.exe$/.test(f))],
  ["Horus.dmg", pick((f) => /Horus-[\d.]+\.dmg$/.test(f))],
  ["Horus.AppImage", pick((f) => /Horus-.*\.AppImage$/.test(f))],
  ["Horus.deb", pick((f) => /\.deb$/.test(f))],
  ["Horus-club.apk", pick((f) => /club.*app-release\.apk$/.test(f) || /horus-club-android.*\.apk$/.test(f))],
  ["Horus-club.aab", pick((f) => /club.*app-release\.aab$/.test(f) || /horus-club-android.*\.aab$/.test(f))],
  ["Horus-member.apk", pick((f) => /member.*app-release\.apk$/.test(f) || /horus-member-android.*\.apk$/.test(f))],
  ["Horus-member.aab", pick((f) => /member.*app-release\.aab$/.test(f) || /horus-member-android.*\.aab$/.test(f))],
  ["Horus-club-ios-simulator.app.zip", pick((f) => /Horus-club-simulator\.app\.zip$/.test(f))],
  ["Horus-member-ios-simulator.app.zip", pick((f) => /Horus-member-simulator\.app\.zip$/.test(f))],
  ["Horus-club.xcarchive.zip", pick((f) => /Horus-club\.xcarchive\.zip$/.test(f))],
  ["Horus-member.xcarchive.zip", pick((f) => /Horus-member\.xcarchive\.zip$/.test(f))],
];

const stage = path.join(tmpdir(), `horus-release-${version}`);
mkdirSync(stage, { recursive: true });
const assets = [];
const missing = [];
for (const [name, src] of wanted) {
  if (!src) {
    missing.push(name);
    continue;
  }
  const dst = path.join(stage, name);
  copyFileSync(src, dst);
  assets.push(dst);
  console.log(`${name.padEnd(36)} ${(statSync(dst).size / 1048576).toFixed(1)} MB  ← ${path.relative(folder, src)}`);
}
if (missing.length) console.log("not in this release (no file found):", missing.join(", "));
if (!assets.length) {
  console.error("nothing to publish");
  process.exit(1);
}

const gh = (args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
let exists = true;
try {
  gh(["release", "view", tag, "--repo", REPO, "--json", "tagName"]);
} catch {
  exists = false;
}
if (!exists) {
  gh(["release", "create", tag, "--repo", REPO, "--title", `Horus ${version}`, "--notes", notes, "--latest", ...assets]);
  console.log(`release ${tag} created with ${assets.length} file(s)`);
} else {
  gh(["release", "upload", tag, "--repo", REPO, "--clobber", ...assets]);
  console.log(`release ${tag} updated with ${assets.length} file(s)`);
}
console.log(`https://github.com/${REPO}/releases/tag/${tag}`);
