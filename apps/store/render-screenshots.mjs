#!/usr/bin/env node
/**
 * Store screenshots for the three phone apps, from the live product:
 *   Horus for Clubs  as the demo association's Key Officer
 *   Horus Member     as its demo member (two-step sign-in)
 *   Horus Home       with a prepared journal imported through Settings
 * at the sizes the stores ask for:
 *   iphone   1320 x 2868  (App Store, 6.9" display)
 *   ipad     2064 x 2752  (App Store, 13" display)
 *   android  1080 x 2160  (Google Play phone)
 * Each screen is saved raw and framed with a caption, plus a Play feature
 * graphic (1024 x 500) and icon (512 x 512) per app.
 *
 *   node apps/store/render-screenshots.mjs [club|member|home ...]
 *
 * Needs: the demo association (web/scripts/seed-demo-club.mjs), the
 * Supabase service key in web/.env.local (or HORUS_ENV_FILE), the demo
 * member's authenticator secret in .secrets/demo-accounts.json, the
 * installed Chrome, and the network (Google Fonts for the frames).
 * Output: apps/store/screenshots/ (git-ignored; large).
 */
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "web");
const OUT = path.join(HERE, "screenshots");
const ORIGIN = "https://horus.farm";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { createClient } = await import(pathToFileURL(path.join(WEB, "node_modules/@supabase/supabase-js/dist/index.mjs")).href);
const { createRequire } = await import("node:module");
const sharp = createRequire(path.join(WEB, "package.json"))("sharp");

const ENV = readFileSync(process.env.HORUS_ENV_FILE || path.join(WEB, ".env.local"), "utf8");
const env = (k) => ENV.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
const service = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
// .secrets/ lives at the main checkout's root (git-ignored), also when this runs from a worktree under .worktrees/.
const SECRETS = [path.join(REPO, ".secrets"), path.resolve(REPO, "../../.secrets")].find((d) => existsSync(path.join(d, "demo-accounts.json")));
if (!SECRETS) throw new Error(".secrets/demo-accounts.json not found (run web/scripts/seed-demo-club.mjs first)");
const demo = JSON.parse(readFileSync(path.join(SECRETS, "demo-accounts.json"), "utf8"));

const DEVICES = {
  iphone: { width: 440, height: 956, dpr: 3, mobile: true },
  ipad: { width: 1032, height: 1376, dpr: 2, mobile: false },
  android: { width: 360, height: 720, dpr: 3, mobile: true },
};

// ─── Screens and captions (no em dashes; nothing about products in the member app) ─────

const APPS = {
  club: {
    name: "Horus for Clubs",
    tagline: "Grow, counter and compliance for licensed associations",
    screens: [
      { path: "/club", slug: "overview", caption: "Every plant, every lot, every gram. On the record." },
      { path: "/club/counter", slug: "counter", caption: "The counter checks the allowance before anything is handed over" },
      { path: "/club/lots", slug: "lots", caption: "Lots released only after their lab results" },
      { path: "/club/grow", slug: "grow", caption: "Counts and harvests with a second witness" },
      { path: "/club/members", slug: "members", caption: "Members and dues, pseudonymous by design" },
      { path: "/club/audit", slug: "audit", caption: "An audit trail nothing edits quietly" },
    ],
  },
  member: {
    name: "Horus Member",
    tagline: "Your account with your association",
    screens: [
      { path: "/portal", slug: "home", caption: "Your own records, and nothing else" },
      { path: "/portal/history", slug: "history", caption: "What you have received, and when" },
      { path: "/portal/dues", slug: "dues", caption: "Your membership dues at a glance" },
      { path: "/portal/notices", slug: "notices", caption: "Notices from your association" },
      { path: "/portal/account", slug: "account", caption: "Two-step sign-in, always on" },
    ],
  },
  home: {
    name: "Horus Home",
    tagline: "A private grow journal for personal growers",
    screens: [
      { path: "/home", slug: "dashboard", caption: "A private journal for a few plants at home" },
      { path: "PLANT", slug: "plant", caption: "Every entry on a timeline, with photos" },
      { path: "/home/reminders", slug: "reminders", caption: "Reminders for lights and watering" },
      { path: "/home/limits", slug: "limits", caption: "Your local limit, with its source" },
      { path: "/home/space", slug: "space", caption: "Your grow space and its targets" },
    ],
  },
};

// ─── Chrome over CDP ──────────────────────────────────────────────────────────

async function getJson(url, method = "GET") {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(url, { method });
      if (r.ok) return r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`DevTools not reachable: ${url}`);
}

async function openBrowser(port) {
  const profile = mkdtempSync(path.join(tmpdir(), "horus-shots-"));
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  const target = await getJson(`http://127.0.0.1:${port}/json/new?about:blank`, "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let seq = 0;
  const pending = new Map();
  const events = new Set();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`));
      else p.res(m.result);
    } else if (m.method) for (const l of events) l(m);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
    return r.result.value;
  };
  const waitFor = async (expr, timeout = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await ev(expr)) return true;
      } catch {}
      await sleep(250);
    }
    throw new Error(`timeout: ${expr}`);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");
  const page = {
    send,
    ev,
    waitFor,
    async device(d) {
      await send("Emulation.setDeviceMetricsOverride", { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: d.mobile });
    },
    async go(url) {
      await send("Page.navigate", { url: url.startsWith("http") ? url : ORIGIN + url });
      await waitFor("document.readyState === 'complete'");
      await ev("document.fonts.ready.then(() => true)");
      await sleep(1200);
    },
    async shot(file) {
      await ev("window.scrollTo(0, 0); true");
      await sleep(300);
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
    async setFile(selector, file) {
      const { root } = await send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`no ${selector}`);
      await send("DOM.setFileInputFiles", { nodeId, files: [file] });
    },
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill();
      await sleep(400);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {}
    },
  };
  return page;
}

// ─── Sign-in helpers (our own confirm pages; Supabase mints the token, nothing is emailed) ─────

async function linkFor(email) {
  const r = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (r.error) throw new Error(`generateLink ${email}: ${r.error.message}`);
  return r.data.properties;
}

async function serverSkewMs() {
  const r = await fetch(ORIGIN, { method: "HEAD" });
  return new Date(r.headers.get("date")).getTime() - Date.now();
}

function totp(secretB32, at) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

const submitFirstForm = (actionPart) => `(() => { const f = [...document.querySelectorAll('form')].find(f => (f.getAttribute('action') || '').includes(${JSON.stringify(actionPart)})); if (!f) return false; f.requestSubmit ? f.requestSubmit() : f.submit(); return true; })()`;

async function signInStaff(page, email) {
  const p = await linkFor(email);
  await page.go(`/club/auth/confirm?token_hash=${encodeURIComponent(p.hashed_token)}&type=${p.verification_type}`);
  if (!(await page.ev(submitFirstForm("/club/auth/verify")))) throw new Error("club confirm form not found");
  await page.waitFor("location.pathname === '/club'", 30000);
}

async function signInMember(page, email) {
  const p = await linkFor(email);
  await page.go(`/portal/auth/confirm?token_hash=${encodeURIComponent(p.hashed_token)}&type=${p.verification_type}`);
  if (!(await page.ev(submitFirstForm("/portal/auth/verify")))) throw new Error("portal confirm form not found");
  await page.waitFor("location.pathname.startsWith('/portal') && !location.pathname.startsWith('/portal/auth/confirm')", 30000);
  await sleep(1500);
  if ((await page.ev("location.pathname")).startsWith("/portal/auth/two-step")) {
    const skew = await serverSkewMs();
    const code = totp(demo[email].totpSecret, Date.now() + skew);
    const ok = await page.ev(`(() => {
      const input = document.querySelector('input[autocomplete="one-time-code"], input[name=code], input[inputmode=numeric]');
      if (!input) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(code)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const form = input.closest('form');
      const btn = form?.querySelector('button[type=submit]') || form?.querySelector('button');
      btn?.click();
      return true;
    })()`);
    if (!ok) throw new Error("two-step input not found");
    await page.waitFor("location.pathname === '/portal'", 30000);
  }
}

// ─── Horus Home: a prepared journal ───────────────────────────────────────────

async function homeExportFile() {
  const iso = (daysAgo, hour = 18) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 15, 0, 0);
    return d.toISOString();
  };
  const now = new Date().toISOString();
  const photoSrc = path.join(WEB, "public/marketing/photos/leaves-top-right-on-white.webp");
  const jpg = await sharp(photoSrc).resize(1200, 1200, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  const plants = [
    { id: "p-1", label: "Back left", startedAt: iso(54), stage: "flowering", stageHistory: [{ stage: "seedling", at: iso(54) }, { stage: "vegetative", at: iso(40) }, { stage: "flowering", at: iso(19) }], medium: "soil", spaceNote: "Back left of the tent", archived: false, archivedAt: null, createdAt: iso(54), updatedAt: now },
    { id: "p-2", label: "Back right", startedAt: iso(54), stage: "flowering", stageHistory: [{ stage: "seedling", at: iso(54) }, { stage: "vegetative", at: iso(40) }, { stage: "flowering", at: iso(19) }], medium: "soil", spaceNote: "Back right", archived: false, archivedAt: null, createdAt: iso(54), updatedAt: now },
    { id: "p-3", label: "Front", startedAt: iso(26), stage: "vegetative", stageHistory: [{ stage: "seedling", at: iso(26) }, { stage: "vegetative", at: iso(14) }], medium: "coco", spaceNote: "Front, under the fan", archived: false, archivedAt: null, createdAt: iso(26), updatedAt: now },
  ];
  const base = { note: "", photoIds: [], volumeL: null, ph: null, runoffPh: null, product: "", doseMlPerL: null, ec: null, feedPh: null, trainMethod: null, wetWeightG: null, dryWeightG: null };
  const entries = [
    { ...base, id: "e-1", plantId: "p-1", kind: "photo", at: iso(1, 19), note: "Day 18 of flower. Buds stacking well, leaves still green.", photoIds: ["ph-1"], createdAt: iso(1, 19), updatedAt: iso(1, 19) },
    { ...base, id: "e-2", plantId: "p-1", kind: "feed", at: iso(2, 18), product: "Bloom nutrient, part B", doseMlPerL: 2.5, ec: 1.6, feedPh: 6.2, note: "Half strength this week.", createdAt: iso(2, 18), updatedAt: iso(2, 18) },
    { ...base, id: "e-3", plantId: "p-1", kind: "water", at: iso(4, 18), volumeL: 1.5, ph: 6.3, runoffPh: 6.4, createdAt: iso(4, 18), updatedAt: iso(4, 18) },
    { ...base, id: "e-4", plantId: "p-1", kind: "train", at: iso(9, 17), trainMethod: "defoliation", note: "Took off the fan leaves shading the lower sites.", createdAt: iso(9, 17), updatedAt: iso(9, 17) },
    { ...base, id: "e-5", plantId: "p-1", kind: "issue", at: iso(12, 20), note: "A few yellow tips on the lower leaves. Watching it.", createdAt: iso(12, 20), updatedAt: iso(12, 20) },
    { ...base, id: "e-6", plantId: "p-2", kind: "water", at: iso(1, 18), volumeL: 1.5, ph: 6.2, createdAt: iso(1, 18), updatedAt: iso(1, 18) },
    { ...base, id: "e-7", plantId: "p-3", kind: "train", at: iso(3, 17), trainMethod: "lst", note: "Tied the main stem down to open the canopy.", createdAt: iso(3, 17), updatedAt: iso(3, 17) },
  ];
  const reminders = [
    { id: "r-1", kind: "lights-on", title: "Lights on", plantId: null, everyNDays: null, time: "06:00", lastDoneAt: null, active: true, createdAt: iso(54), updatedAt: now },
    { id: "r-2", kind: "lights-off", title: "Lights off", plantId: null, everyNDays: null, time: "18:00", lastDoneAt: null, active: true, createdAt: iso(54), updatedAt: now },
    { id: "r-3", kind: "watering", title: "Water Back left", plantId: "p-1", everyNDays: 2, time: null, lastDoneAt: iso(2, 18), active: true, createdAt: iso(40), updatedAt: now },
    { id: "r-4", kind: "watering", title: "Water Front", plantId: "p-3", everyNDays: 3, time: null, lastDoneAt: iso(1, 18), active: true, createdAt: iso(20), updatedAt: now },
    { id: "r-5", kind: "custom", title: "Check humidity", plantId: null, everyNDays: 1, time: null, lastDoneAt: iso(1, 9), active: true, createdAt: iso(20), updatedAt: now },
  ];
  const target = (a, b, c, d) => ({ tempMinC: a, tempMaxC: b, humidityMinPct: c, humidityMaxPct: d });
  const space = {
    id: "space", type: "tent", sizeText: "100 x 100 x 200 cm", medium: "soil", lightWatts: 240, lightHoursOn: 12, scheduleStart: "06:00",
    targets: { seedling: target(22, 26, 65, 75), vegetative: target(22, 28, 55, 70), flowering: target(20, 26, 40, 55), drying: target(18, 21, 55, 62), curing: target(18, 21, 58, 62), done: target(18, 24, 40, 60) },
    createdAt: iso(54), updatedAt: now,
  };
  const settings = { id: "settings", ageConfirmed: true, onboardingComplete: true, jurisdictionId: "malta", units: "metric", pin: null, createdAt: iso(54), updatedAt: now };
  const data = { app: "horus-home", version: 1, exportedAt: now, settings, space, plants, entries, reminders, photos: [{ id: "ph-1", type: "image/jpeg", base64: jpg.toString("base64") }] };
  const file = path.join(tmpdir(), "horus-home-demo.json");
  writeFileSync(file, JSON.stringify(data));
  return file;
}

async function prepareHome(page) {
  await page.go("/home/start");
  // Through the age gate and onboarding the way a person would, so the app's own records exist first.
  const clickText = (t, sel = "button, a, [role=option], li") =>
    page.ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => !e.disabled && e.textContent.trim().startsWith(${JSON.stringify(t)})); if (!b) return false; b.click(); return true; })()`);
  for (let i = 0; i < 8; i++) {
    const step = await page.ev("document.querySelector('h1')?.id || location.pathname");
    if (process.env.DEBUG_SHOTS) console.log("  onboarding step:", step);
    if (step === "age-title") await clickText("Yes, I", "button");
    else if (step === "jurisdiction-title") {
      if (!(await clickText("Malta", "button, [role=option], [role=radio], label"))) await clickText("Malta", "li");
      await sleep(400);
      await clickText("Continue", "button");
    } else if (step === "units-title") await clickText("Continue", "button");
    else if (step === "done-title") await page.ev("(() => { const b = [...document.querySelectorAll('button')].find(e => e.className.includes('primary') || e.textContent.trim()); b?.click(); return true; })()");
    else break;
    await sleep(900);
  }
  await page.go("/home/settings");
  if (process.env.DEBUG_SHOTS) console.log("  settings page:", await page.ev("location.pathname + ' | h1=' + (document.querySelector('h1')?.textContent || '') + ' | inputs=' + document.querySelectorAll('input').length + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)"));
  const file = await homeExportFile();
  await page.setFile('input[type=file][accept="application/json"]', file);
  await sleep(2500);
  // A confirm step, if the app asks before replacing the journal.
  await page.ev(`(() => { const b = [...document.querySelectorAll('button')].find(e => /^(Replace|Import|Yes)/.test(e.textContent.trim())); b?.click(); return true; })()`);
  await sleep(2000);
  const plants = await page.ev(`new Promise((res) => { const r = indexedDB.open('horus-home'); r.onsuccess = () => { try { const tx = r.result.transaction('plants'); const q = tx.objectStore('plants').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(-1); } catch (e) { res('err ' + e.message); } }; r.onerror = () => res(-2); })`);
  console.log("  home: imported journal, plants in IndexedDB:", plants);
}

// ─── Frames ───────────────────────────────────────────────────────────────────

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const iconSvg = readFileSync(path.join(WEB, "src/app/icon.svg"), "utf8");

function frameHtml({ caption, shotUrl, W, H, shotW, shotH }) {
  const pad = Math.round(W * 0.07);
  const capSize = Math.round(W * (W > H ? 0.04 : 0.064));
  const capH = Math.round(capSize * 3.4);
  const availW = W - pad * 2;
  const availH = H - capH - pad * 2.2;
  const scale = Math.min(availW / shotW, availH / shotH);
  const w = Math.round(shotW * scale);
  const h = Math.round(shotH * scale);
  const radius = Math.round(w * 0.06);
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{background:#F1F6F3 radial-gradient(circle, rgba(11,35,28,0.16) ${W / 900}px, rgba(11,35,28,0) ${W / 600}px);background-size:${Math.round(W / 50)}px ${Math.round(W / 50)}px;font-family:"Instrument Sans",sans-serif;display:flex;flex-direction:column;align-items:center}
.cap{box-sizing:border-box;width:100%;height:${capH}px;padding:${Math.round(pad * 0.9)}px ${pad}px 0;display:flex;align-items:center;justify-content:center;text-align:center;color:#0B231C;font-weight:600;font-size:${capSize}px;line-height:1.12;letter-spacing:-0.02em}
.shot{margin-top:${Math.round(pad * 0.5)}px;width:${w}px;height:${h}px;border-radius:${radius}px;overflow:hidden;box-shadow:0 ${Math.round(W / 60)}px ${Math.round(W / 18)}px rgba(11,35,28,0.22), 0 0 0 ${Math.max(2, Math.round(W / 400))}px rgba(11,35,28,0.08)}
.shot img{display:block;width:100%;height:100%}
</style></head><body><div class="cap">${esc(caption)}</div><div class="shot"><img src="${shotUrl}"></div></body></html>`;
}

function featureHtml({ name, tagline }) {
  const symbol = iconSvg.replace(/<rect[^>]*\/>/, "");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Unbounded:wght@500&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:1024px;height:500px;overflow:hidden}
body{display:flex;background:#F1F6F3 radial-gradient(circle, rgba(11,35,28,0.2) 1.1px, rgba(11,35,28,0) 1.7px);background-size:20px 20px;font-family:"Instrument Sans",sans-serif;color:#0B231C}
.l{flex:1;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:0 0 0 64px}
.mark{font-family:Unbounded,sans-serif;font-weight:500;font-size:30px;letter-spacing:1px}
h1{margin:0;font-size:58px;line-height:1.02;letter-spacing:-0.035em;font-weight:600}
h1 span{color:#4E2A74}
p{margin:0;font-size:24px;line-height:1.3;color:#34493F;max-width:520px}
.r{width:330px;margin:22px 22px 22px 0;border-radius:20px;display:flex;align-items:center;justify-content:center;background:#061C17;background-image:radial-gradient(circle at 92% 100%, rgba(74,42,99,0.95) 0%, rgba(74,42,99,0) 60%), radial-gradient(circle at 6% 0%, rgba(26,96,76,0.6) 0%, rgba(26,96,76,0) 55%)}
.r svg{width:190px;height:190px}
.r svg path{fill:#EAF4EF}
</style></head><body><div class="l"><div class="mark">HORUS.FARM</div><h1>${esc(name.replace(/^Horus /, "Horus "))}</h1><p>${esc(tagline)}</p></div><div class="r">${symbol}</div></body></html>`;
}

async function renderHtml(page, html, W, H, out) {
  const file = path.join(tmpdir(), `horus-frame-${Date.now()}.html`);
  writeFileSync(file, html);
  await page.device({ width: W, height: H, dpr: 1, mobile: false });
  await page.send("Page.navigate", { url: pathToFileURL(file).href });
  await page.waitFor("document.readyState === 'complete'");
  await page.ev("document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))");
  await page.ev("Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = r; i.onerror = r; })))");
  const { data } = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(data, "base64"));
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const only = process.argv.slice(2);
let port = 9420;
for (const [appKey, app] of Object.entries(APPS)) {
  if (only.length && !only.includes(appKey)) continue;
  console.log(`== ${app.name}`);
  const page = await openBrowser(port++);
  try {
    await page.device(DEVICES.iphone);
    if (appKey === "club") await signInStaff(page, "demo+keyofficer@horus.farm");
    if (appKey === "member") await signInMember(page, "demo+member@horus.farm");
    let plantPath = null;
    if (appKey === "home") {
      await prepareHome(page);
      plantPath = "/home/plants/p-1";
    }
    for (const [devKey, dev] of Object.entries(DEVICES)) {
      const rawDir = path.join(OUT, appKey, devKey, "raw");
      mkdirSync(rawDir, { recursive: true });
      await page.device(dev);
      for (const [i, s] of app.screens.entries()) {
        const p = s.path === "PLANT" ? plantPath : s.path;
        await page.go(p);
        await sleep(800);
        const at = await page.ev("location.pathname");
        if (at !== p) console.log(`  ! ${devKey} ${p} landed on ${at}`);
        await page.shot(path.join(rawDir, `${String(i + 1).padStart(2, "0")}-${s.slug}.png`));
      }
      console.log(`  ${devKey}: ${app.screens.length} raw`);
    }
    // Frames, from the raw shots, at each device's full pixel size.
    for (const [devKey, dev] of Object.entries(DEVICES)) {
      const W = dev.width * dev.dpr;
      const H = dev.height * dev.dpr;
      for (const [i, s] of app.screens.entries()) {
        const name = `${String(i + 1).padStart(2, "0")}-${s.slug}.png`;
        const raw = path.join(OUT, appKey, devKey, "raw", name);
        const shotUrl = `data:image/png;base64,${readFileSync(raw).toString("base64")}`;
        await renderHtml(page, frameHtml({ caption: s.caption, shotUrl, W, H, shotW: W, shotH: H }), W, H, path.join(OUT, appKey, devKey, name));
      }
      console.log(`  ${devKey}: ${app.screens.length} framed (${W} x ${H})`);
    }
    // Play graphics.
    const play = path.join(OUT, appKey, "play");
    mkdirSync(play, { recursive: true });
    await renderHtml(page, featureHtml(app), 1024, 500, path.join(play, "feature-graphic-1024x500.png"));
    const icon = await sharp(Buffer.from(iconSvg.replace('rx="14"', 'rx="0"')), { density: 600 }).resize(512, 512).flatten({ background: "#4E2A74" }).png().toBuffer();
    writeFileSync(path.join(play, "icon-512.png"), icon);
    console.log("  play: feature graphic and icon");
  } finally {
    await page.close();
  }
}
console.log("done →", OUT);
