#!/usr/bin/env node
/**
 * Copies the app shells (and only them) into a checkout of the public repo
 * Lukefen31/horus-releases, commits and pushes. That repo builds every app
 * on GitHub's runners and publishes releases with its own token
 * (apps/public-repo/.github/workflows/release.yml), so the downloads are
 * public and no personal token is needed anywhere. Nothing from web/ except
 * the favicon source goes across.
 *
 *   node apps/scripts/sync-releases-repo.mjs            # sync + push
 *   node apps/scripts/sync-releases-repo.mjs --no-push  # sync only (inspect the checkout)
 *
 * Checkout: <repo root>/../horus-releases (cloned on first run).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT = path.resolve(ROOT, "..", "horus-releases");
const REPO = "https://github.com/Lukefen31/horus-releases.git";
const push = !process.argv.includes("--no-push");
const git = (args, cwd = CHECKOUT) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim();

if (!existsSync(CHECKOUT)) {
  mkdirSync(CHECKOUT, { recursive: true });
  git(["clone", "--quiet", REPO, CHECKOUT], ROOT);
}
git(["checkout", "--quiet", "-B", "main"]);
try {
  git(["pull", "--quiet", "--ff-only", "origin", "main"]);
} catch {
  // empty repo on first sync
}

// Start clean, keep .git
for (const name of ["apps", "web", ".github", "README.md", ".gitignore"]) rmSync(path.join(CHECKOUT, name), { recursive: true, force: true });

const SKIP = new Set(["node_modules", "dist", "build", ".gradle", "www", "resources", "Pods", "xcuserdata", "release", ".assets-stamp", "public-repo"]);
const filter = (src) => {
  const base = path.basename(src);
  if (SKIP.has(base)) return false;
  // Android build outputs under app/build and the generated local.properties
  if (/[\\/]android[\\/]app[\\/]build([\\/]|$)/.test(src)) return false;
  if (base === "local.properties") return false;
  return true;
};
cpSync(path.join(ROOT, "apps"), path.join(CHECKOUT, "apps"), { recursive: true, filter });
mkdirSync(path.join(CHECKOUT, "web/src/app"), { recursive: true });
cpSync(path.join(ROOT, "web/src/app/icon.svg"), path.join(CHECKOUT, "web/src/app/icon.svg"));
cpSync(path.join(ROOT, "apps/public-repo/.github"), path.join(CHECKOUT, ".github"), { recursive: true });
writeFileSync(
  path.join(CHECKOUT, ".gitignore"),
  ["node_modules/", "apps/native/club/www/", "apps/native/member/www/", "apps/native/*/resources/", "apps/native/*/android/app/build/", "apps/native/*/android/.gradle/", "apps/native/*/android/local.properties", "apps/desktop/dist/", "apps/desktop/build/icon.*", ""].join("\n"),
);
const version = JSON.parse(readFileSync(path.join(ROOT, "apps/native/package.json"), "utf8")).version;
writeFileSync(
  path.join(CHECKOUT, "README.md"),
  `# Horus downloads

The apps for Windows, macOS, Linux and Android, and the iPhone and iPad builds, for **Horus** (horus.farm): cultivation, counter and compliance software for licensed cannabis associations.

**Download:** the latest release is on the right, or see https://horus.farm/download for which file is which.

This repository holds only the thin native shells (they open the live product at horus.farm) and the pipeline that builds them; it is synced from the private product repository. Current version: ${version}.
`,
);

git(["add", "-A"]);
const status = git(["status", "--porcelain"]);
if (!status) {
  console.log("public repo already up to date");
} else {
  git(["-c", "user.name=Lukefen31", "-c", "user.email=130406902+Lukefen31@users.noreply.github.com", "commit", "-q", "-m", `sync: apps ${version} from the product repo`]);
  console.log(git(["log", "--oneline", "-1"]));
  if (push) {
    git(["push", "--quiet", "-u", "origin", "main"]);
    console.log("pushed to", REPO);
  }
}
