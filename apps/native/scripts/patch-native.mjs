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
 * iOS (App/Info.plist, App/App.entitlements, App.xcodeproj)
 *   - WKAppBoundDomains = horus.farm, so the site's service worker runs in the shell
 *   - ITSAppUsesNonExemptEncryption = false (HTTPS only), the display name
 *   - Associated Domains (applinks + webcredentials for horus.farm) in the
 *     entitlements file, wired into the App target's build settings
 *   - the Apple team (23Y8G4D63V, Luke's developer account: public, it is in
 *     every signed app) and MARKETING_VERSION from package.json; the build
 *     number comes from CI (CURRENT_PROJECT_VERSION on the xcodebuild line)
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
export const APPLE_TEAM_ID = "23Y8G4D63V";

const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:horus.farm</string>
		<string>webcredentials:horus.farm</string>
	</array>
</dict>
</plist>
`;

function patchXcodeProject(app) {
  const dir = path.join(ROOT, app, "ios/App");
  const pbx = path.join(dir, "App.xcodeproj/project.pbxproj");
  if (!existsSync(pbx)) {
    console.log(`${app}: no ios project yet`);
    return;
  }
  writeFileSync(path.join(dir, "App/App.entitlements"), ENTITLEMENTS);
  let s = readFileSync(pbx, "utf8");
  // Only the App target's build configurations carry the bundle id.
  s = s.replace(/buildSettings = \{([^}]*?PRODUCT_BUNDLE_IDENTIFIER = farm\.horus\.[a-z]+;[^}]*?)\};/gs, (block, body) => {
    let b = body;
    if (!b.includes("CODE_SIGN_ENTITLEMENTS")) b = b.replace(/(\t+)CODE_SIGN_STYLE = Automatic;/, `$1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n$1CODE_SIGN_STYLE = Automatic;`);
    if (!b.includes("DEVELOPMENT_TEAM")) b = b.replace(/(\t+)CODE_SIGN_STYLE = Automatic;/, `$1CODE_SIGN_STYLE = Automatic;\n$1DEVELOPMENT_TEAM = ${APPLE_TEAM_ID};`);
    b = b.replace(/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`);
    return `buildSettings = {${b}};`;
  });
  writeFileSync(pbx, s);
  const n = (s.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length;
  console.log(`${app}: xcode project patched (entitlements in ${n} configurations, team ${APPLE_TEAM_ID}, version ${version})`);
}

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
  patchXcodeProject(app);
}
