#!/usr/bin/env node
/**
 * Renders the source art that @capacitor/assets turns into every icon and
 * splash size for both apps, from the same favicon source the website uses
 * (web/src/app/icon.svg): the symbol on the aubergine tile.
 *
 *   npm run assets          # this script, then @capacitor/assets for both apps
 *
 * Per app, in <app>/resources/:
 *   icon.png                 1024 x 1024, full-bleed tile (iOS rounds it)
 *   icon-foreground.png      1024 x 1024, the symbol alone on transparent (Android adaptive)
 *   icon-background.png      1024 x 1024, the plain tile colour (Android adaptive)
 *   splash.png               2732 x 2732, frost ground with the symbol centred
 *   splash-dark.png          2732 x 2732, night ground with the symbol in frost
 * Also copies shared/www into each app's www/.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ICON_SVG = path.resolve(ROOT, "../../web/src/app/icon.svg");

const icon = readFileSync(ICON_SVG, "utf8");
const viewBox = icon.match(/<svg x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" viewBox="([^"]+)"/)?.[1];
const pathD = icon.match(/<path fill="[^"]*" d="([^"]+)"/)?.[1];
if (!viewBox || !pathD) throw new Error("web/src/app/icon.svg changed shape; update this script");

const AUBERGINE = "#4E2A74";
const FROST = "#F1F6F3";
const NIGHT = "#09110F";
const SYMBOL_FROST = "#F1F6F3";
const SYMBOL_INK = "#0B231C";

const symbolSvg = (fill, size, scale, bg) => {
  const s = size * scale;
  const off = (size - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}
  <svg x="${off}" y="${off}" width="${s}" height="${s}" viewBox="${viewBox}"><path fill="${fill}" d="${pathD}"/></svg>
</svg>`;
};

const render = (svg, size, out) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);

for (const app of ["club", "member", "home"]) {
  const res = path.join(ROOT, app, "resources");
  mkdirSync(res, { recursive: true });
  // The website tile keeps the symbol at 44/64 of the box; adaptive icons need it inside the safe centre (66%).
  await render(symbolSvg(SYMBOL_FROST, 1024, 0.69, AUBERGINE), 1024, path.join(res, "icon.png"));
  await render(symbolSvg(SYMBOL_FROST, 1024, 0.5, null), 1024, path.join(res, "icon-foreground.png"));
  await render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${AUBERGINE}"/></svg>`, 1024, path.join(res, "icon-background.png"));
  await render(symbolSvg(SYMBOL_INK, 2732, 0.14, FROST), 2732, path.join(res, "splash.png"));
  await render(symbolSvg(SYMBOL_FROST, 2732, 0.14, NIGHT), 2732, path.join(res, "splash-dark.png"));
  cpSync(path.join(ROOT, "shared/www"), path.join(ROOT, app, "www"), { recursive: true });
  console.log(`${app}: resources rendered, www copied`);
}
writeFileSync(path.join(ROOT, ".assets-stamp"), new Date().toISOString());
