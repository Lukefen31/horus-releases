#!/usr/bin/env node
/**
 * One-time (or yearly) setup of iOS distribution signing for CI, run on a
 * developer machine with the App Store Connect API key in the environment
 * (see asc-api.mjs). It:
 *   1. makes a private key and certificate request with openssl,
 *   2. creates an Apple Distribution certificate through the API,
 *   3. writes <out>/horus-ios-distribution.p12 and a random password to
 *      <out>/ios-distribution.env (both secrets: never commit them),
 *   4. creates (or replaces) an App Store provisioning profile for each app,
 *      named "Horus <app> App Store", tied to that certificate.
 *
 *   node apps/native/scripts/ios-signing-setup.mjs <out-dir>
 *
 * Then store IOS_DIST_P12_BASE64 and IOS_DIST_P12_PASSWORD as Actions
 * secrets. CI downloads the profiles at build time (asc-profiles.mjs), so
 * they never need to be stored. The certificate lasts a year; rerun this
 * before it expires, then revoke the old one.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { asc } from "./asc-api.mjs";

const APPS = { club: "farm.horus.club", member: "farm.horus.member", home: "farm.horus.home" };
const profileName = (app) => `Horus ${app} App Store`;

const out = process.argv[2];
if (!out) {
  console.error("usage: ios-signing-setup.mjs <out-dir>");
  process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "horus-ios-"));
const openssl = (args) => execFileSync("openssl", args, { cwd: work, stdio: ["ignore", "pipe", "pipe"] });

try {
  // 1. Key and certificate request
  openssl(["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "dist.key", "-out", "dist.csr", "-subj", "/CN=Horus CI/O=Luke Fenech/C=MT"]);
  const csr = readFileSync(path.join(work, "dist.csr"), "utf8");

  // 2. Apple Distribution certificate
  const created = await asc("POST", "/v1/certificates", {
    data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csr } },
  });
  const certId = created.data.id;
  const der = Buffer.from(created.data.attributes.certificateContent, "base64");
  writeFileSync(path.join(work, "dist.cer"), der);
  openssl(["x509", "-inform", "DER", "-in", "dist.cer", "-out", "dist.pem"]);
  console.log(`certificate ${certId} created (expires ${created.data.attributes.expirationDate?.slice(0, 10)})`);

  // 3. .p12 with the legacy algorithms macOS keychains import reliably
  const password = randomBytes(18).toString("base64url");
  const p12 = path.join(out, "horus-ios-distribution.p12");
  openssl([
    "pkcs12", "-export", "-inkey", "dist.key", "-in", "dist.pem", "-name", "Horus CI distribution",
    "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1",
    "-out", p12, "-passout", `pass:${password}`,
  ]);
  writeFileSync(path.join(out, "ios-distribution.env"), `IOS_DIST_CERT_ID=${certId}\nIOS_DIST_P12_PASSWORD=${password}\n`);
  console.log(`wrote ${p12} and ios-distribution.env`);

  // 4. App Store profiles, one per app
  const ids = await asc("GET", "/v1/bundleIds?limit=200&fields[bundleIds]=identifier");
  for (const [app, identifier] of Object.entries(APPS)) {
    const bundle = ids.data.find((b) => b.attributes.identifier === identifier);
    if (!bundle) throw new Error(`no App ID for ${identifier}`);
    const name = profileName(app);
    const existing = await asc("GET", `/v1/profiles?filter[name]=${encodeURIComponent(name)}&limit=10`);
    for (const p of existing.data) await asc("DELETE", `/v1/profiles/${p.id}`);
    const profile = await asc("POST", "/v1/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_STORE" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundle.id } },
          certificates: { data: [{ type: "certificates", id: certId }] },
        },
      },
    });
    console.log(`profile "${name}" created (${profile.data.id})`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
