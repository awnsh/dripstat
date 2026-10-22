// Builds the DripStat logo files: SVG mark, SVG lockups (wordmark outlined from
// Unbounded SemiBold so it renders identically everywhere), and PNG icons.
//   npm install && npm run logo
//
// The mark: a usage bar, filled with water, forms the pipe of a tap; a drop
// falls from the spout. Same construction and type as TubeStat's T.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const brand = resolve(root, 'brand');
mkdirSync(brand, { recursive: true });

const C = { ink: '#111113', paper: '#f2f0eb', water: '#1e90ff', track: '#4a4946', trackLight: '#d6d3cc' };

/** The glyph in a 100×100 box. `spout` and `track` colours change for light backgrounds. */
const glyph = (spout = C.paper, track = C.track) =>
  `<rect x="16" y="25" width="68" height="10" rx="5" fill="${track}"/>` +
  `<rect x="16" y="25" width="40" height="10" rx="5" fill="${C.water}"/>` +
  `<rect x="44" y="25" width="12" height="29" rx="6" fill="${spout}"/>` +
  `<path d="M50 58C50 58 41.5 67.2 41.5 73.5a8.5 8.5 0 0 0 17 0C58.5 67.2 50 58 50 58Z" fill="${C.water}"/>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;

// App icon: glyph on the ink tile, nudged down so the shape sits optically centred.
const icon = svg(100, 100, `<rect width="100" height="100" rx="22" fill="${C.ink}"/><g transform="translate(0 -3)">${glyph()}</g>`);
// Bare glyphs for placing on a page background, cropped tight to the shape.
const [vx, vy, vw0, vh] = [14, 23, 72, 61];
const tight = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw0} ${vh}" width="${vw0}" height="${vh}">${body}</svg>\n`;
const markDark = tight(glyph());
const markLight = tight(glyph(C.ink, C.trackLight));

// Wordmark lockups.
const fontFile = readFileSync(resolve(root, 'node_modules/@fontsource/unbounded/files/unbounded-latin-600-normal.woff'));
const font = opentype.parse(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));
// Caps a little shorter than the mark (cap 40 of the glyph's 57) to balance Unbounded's weight.
const capHeight = font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7;
const size = Math.round((40 * font.unitsPerEm) / capHeight); // whole sizes avoid NaN points in opentype.js
const tracking = -0.02 * size;
function textPath(str, x, y) {
  const scale = size / font.unitsPerEm;
  const path = new opentype.Path();
  const glyphs = [...str].map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    path.extend(g.getPath(x, y, size));
    x += g.advanceWidth * scale + (glyphs[i + 1] ? font.getKerningValue(g, glyphs[i + 1]) * scale + tracking : 0);
  });
  return path;
}
const word = 'DripStat';
const bb = textPath(word, 0, 0).getBoundingBox();
const textW = bb.x2 - bb.x1;
const gap = 16;
// Baseline sits on the bottom of the drop; descender of the p hangs below.
const baseline = 82;
const lockup = (spout, track, ink) => {
  const x0 = 84 + gap;
  const p = textPath(word, x0 - bb.x1, baseline).toPathData(2);
  const vw = Math.ceil(x0 + textW + 2 - vx);
  const h = Math.ceil(baseline + bb.y2 + 2 - vy);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${h}" width="${vw}" height="${h}">${glyph(spout, track)}<path d="${p}" fill="${ink}"/></svg>\n`;
};
const lockupDark = lockup(C.paper, C.track, C.paper);
const lockupLight = lockup(C.ink, C.trackLight, C.ink);

const files = {
  'dripstat-icon.svg': icon,
  'dripstat-mark-on-dark.svg': markDark,
  'dripstat-mark-on-light.svg': markLight,
  'dripstat-logo-on-dark.svg': lockupDark,
  'dripstat-logo-on-light.svg': lockupLight,
};
for (const [name, body] of Object.entries(files)) writeFileSync(resolve(brand, name), body);

// PNGs, rendered by Chromium for accurate anti-aliasing.
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svgText, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg style="display:block;width:${w}px;height:${h}px" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
await png(icon, 512, 512, resolve(brand, 'dripstat-icon-512.png'));
await png(icon, 180, 180, resolve(root, 'apple-touch-icon.png'));
await png(icon, 32, 32, resolve(root, 'favicon-32.png'));
for (const [name, body] of [['dripstat-logo-on-dark.png', lockupDark], ['dripstat-logo-on-light.png', lockupLight]]) {
  const [lw, lh] = body.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
  await png(body, lw * 4, lh * 4, resolve(brand, name));
}
// Social preview card for link unfurls.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;background:${C.ink};display:grid;place-items:center">
  <div style="display:grid;gap:36px;justify-items:center">
    ${lockupDark.replace('<svg ', '<svg style="width:820px;height:auto" ')}
    <div style="font:500 34px system-ui,sans-serif;color:#a8a69f">How much water did your AI chats use?</div>
  </div></body></html>`);
await page.screenshot({ path: resolve(brand, 'dripstat-social.png') });
await browser.close();

writeFileSync(resolve(root, 'favicon.svg'), icon);
console.log('logo files written to brand/ and the site root');
