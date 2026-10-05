#!/usr/bin/env node
/**
 * Minimal App Store Connect API client (no dependencies), used by the iOS
 * signing scripts. Reads the API key from the environment:
 *   ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_P8_BASE64 (or ASC_KEY_P8_PATH).
 * Never prints the key or the token.
 */
import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

function privateKey() {
  const b64 = process.env.ASC_KEY_P8_BASE64?.replace(/\s+/g, "");
  const pem = b64 ? Buffer.from(b64, "base64").toString("utf8") : readFileSync(process.env.ASC_KEY_P8_PATH ?? "", "utf8");
  return createPrivateKey(pem);
}

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** An ES256 JWT for the App Store Connect API, valid for 15 minutes. */
export function token() {
  const keyId = process.env.ASC_KEY_ID;
  const issuer = process.env.ASC_ISSUER_ID;
  if (!keyId || !issuer) throw new Error("ASC_KEY_ID and ASC_ISSUER_ID are required");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }));
  const signer = createSign("SHA256");
  signer.update(`${head}.${body}`);
  const sig = signer.sign({ key: privateKey(), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

/** Calls the API; throws with Apple's error detail on failure. */
export async function asc(method, path, body) {
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      break;
    } catch (e) {
      // Network hiccups (connect timeouts) are retried; HTTP errors are not.
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors ?? []).map((e) => `${e.title}: ${e.detail}`).join("; ");
    throw new Error(`${method} ${path} failed (${res.status}): ${detail || text.slice(0, 300)}`);
  }
  return json;
}
