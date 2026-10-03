#!/usr/bin/env node
/**
 * After `cap add` / `cap sync`: the few native-project edits Capacitor
 * doesn't make for us, applied idempotently to both apps.
 *
 * Android (app/build.gradle, AndroidManifest.xml)
 *   - release signing from the environment (ANDROID_KEYSTORE_PATH, _PASSWORD,
 *     ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD); unsigned release when unset
 *   - versionCode from ANDROID_VERSION_CODE (CI run number), versionName from package.json
 *   - App Links: https://horus.farm/club/* (club) or /portal/* (member) open the app
 *     (verified against public/.well-known/assetlinks.json on the site)
 * iOS (App/Info.plist)
 *   - WKAppBoundDomains = horus.farm, so the site's service worker runs in the shell
 *   - ITSAppUsesNonExemptEncryption = false (HTTPS only), the display name
 *
 *   node scripts/patch-native.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = {
  club: { startPath: "/club", displayName: "Horus" },
  member: { startPath: "/portal", displayName: "Horus Member" },
  home: { startPath: "/home", displayName: "Horus Home" },
};
const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

function patchGradle(app) {
  const file = path.join(ROOT, app, "android/app/build.gradle");
  let s = readFileSync(file, "utf8");
  if (!s.includes("// horus: signing")) {
    s = s.replace(
      /android \{/,
      `// horus: signing from the environment (see scripts/patch-native.mjs); release stays unsigned when unset
def horusKeystore = System.getenv("ANDROID_KEYSTORE_PATH")
def horusVersionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "1").toInteger()

android {
    signingConfigs {
        release {
            if (horusKeystore) {
                storeFile file(horusKeystore)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }`,
    );
    s = s.replace(/versionCode \d+/, "versionCode horusVersionCode").replace(/versionName "[^"]*"/, `versionName "${version}"`);
    s = s.replace(/buildTypes \{\s*release \{/, `buildTypes {\n        release {\n            if (horusKeystore) signingConfig signingConfigs.release`);
    writeFileSync(file, s);
    console.log(`${app}: build.gradle patched`);
  } else {
    s = s.replace(/versionName "[^"]*"/, `versionName "${version}"`);
    writeFileSync(file, s);
    console.log(`${app}: build.gradle already patched (version kept in step)`);
  }
}

function patchManifest(app, startPath) {
  const file = path.join(ROOT, app, "android/app/src/main/AndroidManifest.xml");
  let s = readFileSync(file, "utf8");
  if (s.includes("android:autoVerify")) {
    console.log(`${app}: manifest already has app links`);
    return;
  }
  const filter = `
            <!-- horus: links to the product open the app (App Links, verified by /.well-known/assetlinks.json) -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="horus.farm" android:pathPrefix="${startPath}" />
            </intent-filter>
`;
  // after the launcher intent filter of the main activity
  s = s.replace(/(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/, `$1\n${filter}`);
  writeFileSync(file, s);
  console.log(`${app}: manifest patched with app links for ${startPath}`);
}

function patchInfoPlist(app, displayName) {
  const file = path.join(ROOT, app, "ios/App/App/Info.plist");
  if (!existsSync(file)) {
    console.log(`${app}: no ios project yet`);
    return;
  }
  let s = readFileSync(file, "utf8");
  if (!s.includes("WKAppBoundDomains")) {
    s = s.replace(
      /<\/dict>\s*<\/plist>\s*$/,
      `	<key>WKAppBoundDomains</key>
	<array>
		<string>horus.farm</string>
	</array>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
</dict>
</plist>
`,
    );
  }
  s = s.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleDisplayName</key>\n\t<string>${displayName}</string>`);
  writeFileSync(file, s);
  console.log(`${app}: Info.plist patched`);
}

for (const [app, cfg] of Object.entries(APPS)) {
  patchGradle(app);
  patchManifest(app, cfg.startPath);
  patchInfoPlist(app, cfg.displayName);
}
