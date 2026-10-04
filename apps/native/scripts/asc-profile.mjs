#!/usr/bin/env node
/**
 * Downloads an app's App Store provisioning profile ("Horus <app> App Store",
 * made by ios-signing-setup.mjs) through the App Store Connect API and
 * installs it where Xcode looks. Prints the profile's name on stdout.
 *
 *   node apps/native/scripts/asc-profile.mjs <club|member|home> [--patch <project.pbxproj>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { asc } from "./asc-api.mjs";

const app = process.argv[2];
if (!["club", "member", "home"].includes(app)) {
  console.error("usage: asc-profile.mjs <club|member|home>");
  process.exit(1);
}
const name = `Horus ${app} App Store`;
const res = await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(name)}&fields[profiles]=name,uuid,profileState,profileContent&limit=10`);
const profile = res.data.find((p) => p.attributes.profileState === "ACTIVE");
if (!profile) {
  console.error(`No active profile named "${name}". Run ios-signing-setup.mjs.`);
  process.exit(1);
}
const content = Buffer.from(profile.attributes.profileContent, "base64");
for (const dir of [
  path.join(homedir(), "Library/MobileDevice/Provisioning Profiles"),
  path.join(homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles"),
]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${profile.attributes.uuid}.mobileprovision`), content);
}

// --patch <project.pbxproj>: switch the app target (only it: the Swift
// packages must stay unsigned) to manual signing with this profile.
const patchAt = process.argv.indexOf("--patch");
if (patchAt > 0) {
  const pbx = process.argv[patchAt + 1];
  let s = readFileSync(pbx, "utf8");
  let n = 0;
  s = s.replace(/buildSettings = \{([^}]*?PRODUCT_BUNDLE_IDENTIFIER = farm\.horus\.[a-z]+;[^}]*?)\};/gs, (block, body) => {
    n += 1;
    let b = body
      .replace(/\n\t+CODE_SIGN_IDENTITY(\[[^\]]*\])? = [^;]+;/g, "")
      .replace(/\n\t+"CODE_SIGN_IDENTITY\[[^\]]*\]" = [^;]+;/g, "")
      .replace(/\n\t+PROVISIONING_PROFILE_SPECIFIER = [^;]+;/g, "");
    b = b.replace(
      /(\t+)CODE_SIGN_STYLE = [A-Za-z]+;/,
      `$1CODE_SIGN_IDENTITY = "Apple Distribution";\n$1CODE_SIGN_STYLE = Manual;\n$1PROVISIONING_PROFILE_SPECIFIER = "${name}";`,
    );
    return `buildSettings = {${b}};`;
  });
  if (n === 0) {
    console.error(`No app target found in ${pbx}`);
    process.exit(1);
  }
  writeFileSync(pbx, s);
}
process.stdout.write(name);
