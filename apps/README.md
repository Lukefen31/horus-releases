# Horus apps

Horus runs as one web product (`web/`, deployed at horus.farm) and installs on
every kind of device. This folder holds the native shells and the desktop
app; the web app itself is already installable from the browser (see
`web/src/lib/pwa.ts`).

| Device | What ships | Where it comes from |
|---|---|---|
| iPhone, iPad | "Horus" (staff, opens at /club) and "Horus Member" (members, opens at /portal) | `apps/native/{club,member}/ios`, built by `.github/workflows/ios.yml` on a macOS runner |
| Android phones, tablets | the same two apps as APK (direct install, device management) and AAB (Play) | `apps/native/{club,member}/android`, built locally or by `.github/workflows/android.yml` |
| Windows, macOS, Linux | "Horus" desktop app (installer and portable on Windows, dmg on macOS, AppImage and deb on Linux) | `apps/desktop`, built by `.github/workflows/desktop.yml` |
| Any browser | the web app, installable from the browser (Chrome, Edge, Safari's Add to Home Screen) | `web/` |

Downloads for clients live in the public repo **github.com/Lukefen31/horus-releases**
(releases carry the installers and APKs with stable file names); the site's
`/download` page links there. What Luke must do before store distribution is
in `SHIP.md`.

## How the native shells work

Each phone app is a Capacitor project that loads the live product over HTTPS
(`server.url` in `apps/native/shared/config.ts`). The app is therefore always
the deployed version: no app update is needed for a product change, the site's
service worker keeps the last pages readable offline, and the code-based
sign-in works inside the shell. The shell adds what only a native app has: the
icon, the splash screen, the status bar, universal links / app links (an
emailed sign-in link opens the app rather than the browser, once the site's
`/.well-known` files name the apps), and a place in a club's device management.

- `apps/native/shared/config.ts`: the shared Capacitor config; `club/` and
  `member/` only set the app id, the name and the start path.
- `apps/native/scripts/brand-assets.mjs`: icon and splash sources from the
  website's favicon; `@capacitor/assets` makes every size.
- `apps/native/scripts/patch-native.mjs`: the native-project edits Capacitor
  doesn't make (release signing from the environment, version, app links,
  `WKAppBoundDomains`). Idempotent; run after `cap add` / `cap sync`.
- The site: `web/public/.well-known/assetlinks.json` (Android app links, keyed
  on the upload certificate) and `/.well-known/apple-app-site-association`
  (served by `web/src/app/api/aasa/route.ts` from `APPLE_TEAM_ID`).
  `web/src/components/pwa/register.tsx` handles `appUrlOpen` inside the shell
  and the site hides its "Install app" links there.

## Building

```
cd apps/native
npm ci
npm run assets                       # brand sources + every icon and splash size, both apps
cd club && npx cap sync && cd ..     # (and member)
node scripts/patch-native.mjs
```

Android, locally (Android Studio's JDK and SDK, as on Luke's machine), signed
with the upload key from `.secrets/android-upload.env` at the repo root (never
committed):

```
set -a; . ../../.secrets/android-upload.env; set +a; export ANDROID_VERSION_CODE=1
cd club/android && ./gradlew bundleRelease assembleRelease
# → app/build/outputs/apk/release/app-release.apk, app/build/outputs/bundle/release/app-release.aab
```

Note (2026-10-03): run that from a normal terminal or Android Studio. Under the
Claude Code agent's sandbox on Luke's machine, Gradle fails at start with
`java.io.IOException: Unable to establish loopback connection` (Java's NIO
pipe on Windows needs a loopback socket the sandbox refuses), so the agent
builds Android on GitHub Actions instead.

iOS: open `apps/native/club/ios/App/App.xcodeproj` in Xcode on a Mac, or let
`.github/workflows/ios.yml` build it (unsigned archive and a simulator build
without secrets; a signed .ipa once the Apple secrets exist).

Desktop:

```
cd apps/desktop && npm ci && npm run icons
npm run dist:win     # Windows: dist/Horus-Setup-<version>.exe and Horus-<version>-portable.exe
npm run dist:mac     # on macOS
npm run dist:linux   # on Linux
```

## Versions

`apps/native/package.json` and `apps/desktop/package.json` carry the version
(`1.0.0`). Android's `versionCode` is the CI run number (or
`ANDROID_VERSION_CODE` locally). Bump the version in both files for a release.

## Publishing downloads

Releases are built and published by the public repo
**Lukefen31/horus-releases**, which holds only the shells in this folder
(synced; no product code). Its workflow `release.yml` (source:
`apps/public-repo/.github/workflows/release.yml`) builds Android, iOS and the
three desktop targets on GitHub's runners and publishes a release with the
stable file names, using the repo's own token.

```
node apps/scripts/sync-releases-repo.mjs                     # copy the shells across and push
gh workflow run release.yml --repo Lukefen31/horus-releases -f version=1.0.0
```

Stable asset names (`Horus-Setup.exe`, `Horus-portable.exe`, `Horus.dmg`,
`Horus.AppImage`, `Horus.deb`, `Horus-club.apk`, `Horus-member.apk`, plus the
iOS simulator and archive zips) keep the `/download` links valid across
versions via `releases/latest/download/<name>`. The private repo's own
workflows (`.github/workflows/{android,ios,desktop}.yml`) remain as CI checks.
The Android signing secrets exist on both repos.
