#!/usr/bin/env node
/**
 * The desktop app's icon from the same favicon source as the website
 * (web/src/app/icon.svg, the symbol on the aubergine tile, rounded):
 * build/icon.png (1024, for Linux and as the source), build/icon.ico (Windows,
 * 16 to 256) and build/icon.icns (macOS, 16 to 1024). No extra tools: the
 * .ico and .icns containers are written here from the PNG sizes.
 *
 *   npm run icons
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "build");
const SRC = path.resolve(ROOT, "../../web/src/app/icon.svg");
mkdirSync(OUT, { recursive: true });

const svg = readFileSync(SRC, "utf8");
const png = async (size) => sharp(Buffer.from(svg), { density: 400 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Linux + source
const master = await png(1024);
writeFileSync(path.join(OUT, "icon.png"), master);

// Windows .ico: a directory of PNG-compressed images (Vista+ format).
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = await Promise.all(icoSizes.map((s) => png(s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
const entries = [];
let offset = 6 + 16 * icoSizes.length;
icoSizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0);
  e.writeUInt8(s === 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(icoImages[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += icoImages[i].length;
  entries.push(e);
});
writeFileSync(path.join(OUT, "icon.ico"), Buffer.concat([header, ...entries, ...icoImages]));

// macOS .icns: PNG payloads in the modern size types.
const icnsTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];
const chunks = [];
for (const [type, size] of icnsTypes) {
  const data = await png(size);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(8 + data.length, 0);
  chunks.push(Buffer.from(type, "ascii"), len, data);
}
const body = Buffer.concat(chunks);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0, "ascii");
icnsHeader.writeUInt32BE(8 + body.length, 4);
writeFileSync(path.join(OUT, "icon.icns"), Buffer.concat([icnsHeader, body]));

console.log("build/icon.png, icon.ico, icon.icns written");
