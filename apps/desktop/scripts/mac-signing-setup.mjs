#!/usr/bin/env node
/**
 * macOS Developer ID signing for the desktop app. Apple only lets the
 * Account Holder create Developer ID certificates (the API key gets a 403),
 * so it's two steps:
 *
 *   1. node apps/desktop/scripts/mac-signing-setup.mjs <secrets-dir> --csr
 *      Makes a private key (horus-mac-developer-id.key, a secret) and a
 *      certificate request (horus-mac-developer-id.csr) with openssl.
 *      The Account Holder uploads the .csr at developer.apple.com,
 *      Certificates, +, "Developer ID Application" (G2 Sub-CA), and
 *      downloads the .cer.
 *   2. node apps/desktop/scripts/mac-signing-setup.mjs <secrets-dir> --import <downloaded.cer>
 *      Writes horus-mac-developer-id.p12 and a random password to
 *      mac-signing.env (both secrets).
 *
 * Then store MAC_CERT_P12_BASE64 and MAC_CERT_PASSWORD as Actions secrets.
 * Notarisation uses the App Store Connect API key (ASC_* secrets).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [out, mode, cerPath] = process.argv.slice(2);
if (!out || !["--csr", "--import"].includes(mode) || (mode === "--import" && !cerPath)) {
  console.error("usage: mac-signing-setup.mjs <secrets-dir> --csr | --import <downloaded.cer>");
  process.exit(1);
}
const KEY = path.join(out, "horus-mac-developer-id.key");
const CSR = path.join(out, "horus-mac-developer-id.csr");
const P12 = path.join(out, "horus-mac-developer-id.p12");
const openssl = (args, cwd = out) => execFileSync("openssl", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

if (mode === "--csr") {
  if (existsSync(KEY)) {
    console.log(`${KEY} already exists; reusing it.`);
  } else {
    openssl(["genrsa", "-out", KEY, "2048"]);
  }
  openssl(["req", "-new", "-key", KEY, "-out", CSR, "-subj", "/emailAddress=hello@horus.farm/CN=Horus desktop/C=MT"]);
  console.log(`certificate request: ${CSR}`);
} else {
  const work = mkdtempSync(path.join(tmpdir(), "horus-mac-"));
  try {
    copyFileSync(cerPath, path.join(work, "devid.cer"));
    openssl(["x509", "-inform", "DER", "-in", "devid.cer", "-out", "devid.pem"], work);
    const password = randomBytes(18).toString("base64url");
    openssl([
      "pkcs12", "-export", "-inkey", KEY, "-in", path.join(work, "devid.pem"), "-name", "Horus desktop Developer ID",
      "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1",
      "-out", P12, "-passout", `pass:${password}`,
    ]);
    writeFileSync(path.join(out, "mac-signing.env"), `MAC_CERT_PASSWORD=${password}\n`);
    console.log(`wrote ${P12} and mac-signing.env`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
