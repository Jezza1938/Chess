// Renders the home-screen icons. Run from repo root: node tools/make_icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const knight = readFileSync('assets/pieces/cburnett/wN.svg', 'utf8');
const knightUrl = 'data:image/svg+xml;base64,' + Buffer.from(knight).toString('base64');
const html = (size, scale) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;position:relative;overflow:hidden;
  background: conic-gradient(#b58863 25%, #f0d9b5 0 50%, #b58863 0 75%, #f0d9b5 0) 0 0 / ${size / 2}px ${size / 2}px;">
  <div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 30%, rgba(0,0,0,.35) 100%)"></div>
  <img src="${knightUrl}" style="position:absolute;left:${(size * (1 - scale)) / 2}px;top:${(size * (1 - scale)) / 2}px;width:${size * scale}px;height:${size * scale}px;filter:drop-shadow(0 ${size / 40}px ${size / 30}px rgba(0,0,0,.55))">
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, scale] of [['icon-180', 180, 0.78], ['icon-192', 192, 0.78], ['icon-512', 512, 0.78], ['icon-512-maskable', 512, 0.6]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, scale));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `assets/icons/${name}.png`, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
