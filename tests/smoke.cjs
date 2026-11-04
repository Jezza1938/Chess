// Quick look: loads the app as an iPad, reports errors, takes screenshots.
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8123/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/home.png` });
  const ready = await page.evaluate(async () => { const e = await window.__chess.getEngine(); return !!e; });
  console.log('engine ready:', ready);
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
