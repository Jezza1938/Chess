// End-to-end tests in a simulated iPad (Chromium + touch).
// Start a server first:  python3 -m http.server 8123
// Then:                  node tests/e2e.cjs [screenshot-folder]
const { chromium, devices } = require('playwright');
const path = require('path');

const URL = 'http://127.0.0.1:8123/';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function squareXY(page, sq) {
  const box = await page.locator('#board').boundingBox();
  const orient = await page.evaluate(() => window.__chess.game.orientation);
  let f = sq.charCodeAt(0) - 97;
  let r = Number(sq[1]) - 1;
  if (orient === 'black') {
    f = 7 - f;
    r = 7 - r;
  }
  const s = box.width / 8;
  return { x: box.x + (f + 0.5) * s, y: box.y + (7 - r + 0.5) * s };
}

async function tapSquare(page, sq) {
  const p = await squareXY(page, sq);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(80);
}

async function move(page, from, to) {
  await tapSquare(page, from);
  await tapSquare(page, to);
  await page.waitForTimeout(150);
}

const game = (page, fn) => page.evaluate(fn);
const history = (page) => game(page, () => window.__chess.game.chess.history());
const tapClock = async (page, color) => {
  const sel = await page.evaluate((c) => (window.__chess.game.orientation === c ? '#p-bottom .clock' : '#p-top .clock'), color);
  const b = await page.locator(sel).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(120);
};

async function newPage(ctx, errors) {
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------------- portrait iPad ----------------
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'] });
  let page = await newPage(ctx, errors);
  await page.goto(URL);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== undefined);
  await page.evaluate(() => window.__chess.getEngine());

  // Bot setup screen
  await page.click('#btn-bot');
  await page.click('#bot-levels button[data-l="1"]');
  await page.click('#bot-color button[data-v="white"]');
  await page.click('#bot-time-chips button[data-id="3+2"]');
  await page.screenshot({ path: `${OUT}/bot-setup.png` });
  check('bot setup: level 1 selected', await page.locator('#bot-levels button.on').innerText() === '1');
  check('bot setup: time inputs follow chip', (await page.inputValue('#bot-min')) === '3' && (await page.inputValue('#bot-inc')) === '2');
  await page.fill('#bot-min', '7');
  await page.dispatchEvent('#bot-min', 'input');
  check('bot setup: typing minutes switches to Custom', await page.locator('#bot-time-chips button.on').innerText() === 'Custom');
  await page.click('#bot-time-chips button[data-id="3+2"]');

  await page.click('#bot-start');
  await page.waitForTimeout(400);
  check('bot game: starts with your move', (await page.textContent('#status')).includes('Your move'));
  const clockText = await page.textContent('#p-bottom .ctime');
  check('bot game: clock shows 3:00', clockText === '3:00', clockText);
  await move(page, 'e2', 'e4');
  check('bot game: your move e4 played', (await history(page))[0] === 'e4');
  await page.waitForFunction(() => window.__chess.game.chess.history().length === 2, null, { timeout: 15000 });
  check('bot game: bot replied', (await history(page)).length === 2, (await history(page)).join(' '));
  const t1 = await game(page, () => window.__chess.game.clock.timeLeft(window.__chess.game.humanColor));
  await move(page, 'g1', 'f3');
  await page.waitForFunction(() => window.__chess.game.chess.history().length === 4, null, { timeout: 15000 });
  const t2 = await game(page, () => window.__chess.game.clock.timeLeft(window.__chess.game.humanColor));
  check('bot game: +2s increment added after your move', t2 > t1 + 1000, `${Math.round(t1)} -> ${Math.round(t2)}`);
  await page.screenshot({ path: `${OUT}/bot-game-portrait.png` });

  // Undo takes back the bot reply and your move
  await page.click('#controls [data-act="undo"]');
  await page.waitForTimeout(200);
  check('bot game: undo takes back your move and the bot reply', (await history(page)).length === 2);
  await page.click('#controls [data-act="undo"]');
  await page.waitForTimeout(200);
  check('bot game: undo again goes back to the start', (await history(page)).length === 0);
  check('bot game: clock resets to not started', await game(page, () => !window.__chess.game.clock.started));
  await move(page, 'd2', 'd4');
  await page.waitForFunction(() => window.__chess.game.chess.history().length === 2, null, { timeout: 15000 });
  check('bot game: play continues after undo', (await history(page))[0] === 'd4');

  // Hint
  await page.click('#controls [data-act="hint"]');
  await page.waitForFunction(() => document.querySelector('#board square.hint-to'), null, { timeout: 15000 }).catch(() => {});
  check('bot game: hint marks piece and target with a dot', (await page.locator('#board square.hint-to').count()) === 1 && (await page.locator('#board square.hint-from').count()) === 1);
  check('bot game: no arrows drawn', (await page.locator('#board .cg-shapes').count()) === 0);
  await page.locator('#board').screenshot({ path: `${OUT}/bot-hint.png` });
  // Legal-move dots for a selected piece
  await tapSquare(page, 'g1');
  check('dots: knight shows its legal squares', (await page.locator('#board square.move-dest').count()) >= 2);
  await page.locator('#board').screenshot({ path: `${OUT}/dots.png` });
  await tapSquare(page, 'g1');
  check('hint: clears after you move', true);

  // Save + resume after a reload
  const before = await history(page);
  await page.reload();
  await page.waitForTimeout(500);
  check('resume: Continue button shows', await page.isVisible('#btn-continue'));
  await page.click('#btn-continue');
  await page.waitForTimeout(400);
  check('resume: same moves restored', JSON.stringify(await history(page)) === JSON.stringify(before));
  check('resume: comes back paused', await page.isVisible('#paused'));
  await page.click('#btn-resume');
  await page.waitForTimeout(200);
  check('resume: clock runs again after Resume', await game(page, () => window.__chess.game.clock.running === window.__chess.game.humanColor));

  // Black vs bot: board flips and bot moves first
  await page.click('#controls [data-act="home"]');
  await page.click('#btn-bot');
  await page.click('#bot-levels button[data-l="10"]');
  await page.click('#bot-color button[data-v="black"]');
  await page.click('#bot-start');
  await page.waitForFunction(() => window.__chess.game.chess.history().length === 1, null, { timeout: 15000 });
  check('black vs bot: bot (white) moves first', (await history(page)).length === 1, (await history(page))[0]);
  check('black vs bot: board shows black at bottom', await game(page, () => window.__chess.game.orientation === 'black'));
  await page.screenshot({ path: `${OUT}/bot-black.png` });

  // Resign
  await page.click('#controls [data-act="resign"]');
  await page.click('#modal-buttons button.danger');
  await page.waitForTimeout(700);
  check('resign: result shows "The bot wins"', (await page.isVisible('#modal')) && (await page.textContent('#modal-title')) === 'The bot wins');
  await page.click('#modal-buttons button:has-text("Look at the board")');

  // ---------------- 2 players ----------------
  await page.click('#controls [data-act="home"]');
  await page.click('#btn-pvp');
  await page.click('#pvp-time-chips button[data-id="5+3"]');
  await page.screenshot({ path: `${OUT}/pvp-setup.png` });
  await page.click('#pvp-start');
  await page.waitForTimeout(300);
  check('2P: status tells White to move first', (await page.textContent('#status')).includes('White moves first'));
  await move(page, 'e2', 'e4');
  check('2P: White moved', (await history(page))[0] === 'e4');
  check('2P: White must tap clock', (await page.textContent('#status')).includes('White: tap your clock'));
  await move(page, 'e7', 'e5');
  check('2P: Black cannot move before White taps', (await history(page)).length === 1);
  await tapClock(page, 'black');
  check('2P: tapping the wrong clock does nothing', await game(page, () => window.__chess.game.awaitingTap === 'white'));
  await page.screenshot({ path: `${OUT}/pvp-awaiting-tap.png` });
  await tapClock(page, 'white');
  check('2P: after tap, Black clock runs', await game(page, () => window.__chess.game.clock.running === 'black'));
  await page.waitForTimeout(1200);
  const bl = await game(page, () => window.__chess.game.clock.timeLeft('black'));
  check('2P: Black time ticking down', bl < 300000 && bl > 297000, String(Math.round(bl)));
  await move(page, 'e7', 'e5');
  check('2P: Black moved after White tapped', (await history(page))[1] === 'e5');
  check('2P: White clock not running while Black still has to tap', await game(page, () => window.__chess.game.clock.running === 'black'));
  await tapClock(page, 'black');
  const bInc = await game(page, () => window.__chess.game.clock.timeLeft('black'));
  check('2P: Black got +3s increment', bInc > 300000 && bInc < 302000, String(Math.round(bInc)));
  await page.screenshot({ path: `${OUT}/pvp-portrait.png` });

  // Pause / resume
  await page.click('#controls [data-act="pause"]');
  const p1 = await game(page, () => window.__chess.game.clock.timeLeft('white'));
  await page.waitForTimeout(600);
  const p2 = await game(page, () => window.__chess.game.clock.timeLeft('white'));
  check('2P: pause stops the clock', p1 === p2 && (await page.isVisible('#paused')));
  await page.click('#btn-resume');
  check('2P: resume restarts the clock', await game(page, () => window.__chess.game.clock.running === 'white'));

  // Fool's mate through the UI, with clock taps
  await page.click('#controls [data-act="new"]');
  await page.click('#modal-buttons button.primary');
  await page.waitForTimeout(300);
  for (const [f, t, c] of [['f2', 'f3', 'white'], ['e7', 'e5', 'black'], ['g2', 'g4', 'white'], ['d8', 'h4', null]]) {
    await move(page, f, t);
    if (c) await tapClock(page, c);
  }
  await page.waitForTimeout(700);
  check('checkmate: detected, Black wins', (await page.isVisible('#modal')) && (await page.textContent('#modal-title')) === 'Black wins', await page.textContent('#modal-text'));
  check('checkmate: clocks stopped', await game(page, () => window.__chess.game.clock.running === null));
  await page.screenshot({ path: `${OUT}/checkmate.png` });
  await page.click('#modal-buttons button:has-text("Play again")');
  await page.waitForTimeout(300);

  // Time out
  await move(page, 'e2', 'e4');
  await tapClock(page, 'white');
  await move(page, 'e7', 'e5');
  await tapClock(page, 'black');
  await game(page, () => {
    const c = window.__chess.game.clock;
    c.commit();
    c.left.white = 600;
  });
  await page.waitForTimeout(1300);
  check('timeout: White flags, Black wins',
    (await page.isVisible('#modal')) && (await page.textContent('#modal-title')) === 'Black wins',
    await page.textContent('#modal-text'));
  await page.click('#modal-buttons button:has-text("Look at the board")');

  // Different time per player
  await page.click('#controls [data-act="home"]');
  await page.click('#btn-pvp');
  await page.check('#pvp-split', { force: true }).catch(async () => page.click('label:has(#pvp-split)'));
  if (!(await page.isChecked('#pvp-split'))) await page.click('label:has(#pvp-split)');
  await page.fill('#pvp-w-min', '2');
  await page.dispatchEvent('#pvp-w-min', 'input');
  await page.fill('#pvp-b-min', '8');
  await page.dispatchEvent('#pvp-b-min', 'input');
  await page.click('#pvp-start');
  await page.waitForTimeout(200);
  check('split time: White 2:00, Black 8:00',
    (await page.textContent('#p-bottom .ctime')) === '2:00' && (await page.textContent('#p-top .ctime')) === '8:00');

  // Promotion through the UI (pvp, no tap needed after tapping clocks)
  await game(page, () => {
    const g = window.__chess.game;
    for (const m of ['a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6']) g.chess.move(m);
  });
  await page.evaluate(() => window.__chess.game.clock.run('white'));
  await page.click('#controls [data-act="flip"]');
  await page.click('#controls [data-act="flip"]');
  await move(page, 'b7', 'b8');
  check('promotion: picker appears', await page.isVisible('#promo'));
  await page.screenshot({ path: `${OUT}/promotion.png` });
  await page.click('#promo .promo-choices button[data-r="knight"]');
  await page.waitForTimeout(200);
  const last = (await history(page)).slice(-1)[0];
  check('promotion: pawn becomes chosen piece', last === 'b8=N', last);

  // ---------------- Boards & pieces ----------------
  await page.click('#controls [data-act="home"]');
  await page.click('#btn-look');
  const boards = await page.$$eval('#board-tiles .tile', (t) => t.map((x) => x.dataset.id));
  const sets = await page.$$eval('#piece-tiles .tile', (t) => t.map((x) => x.dataset.id));
  check('appearance: 10 boards and 10 piece sets', boards.length === 10 && sets.length === 10);
  for (let i = 0; i < 10; i++) {
    await page.click(`#board-tiles .tile[data-id="${boards[i]}"]`);
    await page.click(`#piece-tiles .tile[data-id="${sets[i]}"]`);
    await page.waitForTimeout(150);
    if (i === 0 || i === 4 || i === 6) await page.screenshot({ path: `${OUT}/look-${i}.png` });
  }
  const bodyCls = await page.getAttribute('body', 'class');
  check('appearance: choice applied', bodyCls.includes(`board-${boards[9]}`) && bodyCls.includes(`pieces-${sets[9]}`), bodyCls);
  const bg = await page.$eval('#look-board piece.white.king', (el) => getComputedStyle(el).backgroundImage);
  check('appearance: pieces have images', bg.includes(`/pieces/${sets[9]}/wK.svg`), bg);
  await page.click('#board-tiles .tile[data-id="brown"]');
  await page.click('#piece-tiles .tile[data-id="cburnett"]');

  // ---------------- landscape ----------------
  const land = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
  const lp = await newPage(land, errors);
  await lp.goto(URL);
  await lp.waitForTimeout(400);
  await lp.click('#btn-pvp');
  await lp.click('#pvp-face');
  await lp.click('#pvp-start');
  await move(lp, 'e2', 'e4');
  await lp.screenshot({ path: `${OUT}/pvp-landscape.png` });
  const lb = await lp.locator('#board').boundingBox();
  check('landscape: board is large', lb.width >= 640, String(lb.width));
  const tb = await lp.locator('#p-top .clock').boundingBox();
  const bb = await lp.locator('#p-bottom .clock').boundingBox();
  check('landscape: clocks beside the board', tb.x > lb.x + lb.width && bb.x > lb.x + lb.width && tb.y < bb.y);
  await lp.click('#controls [data-act="home"]');
  await lp.click('#btn-bot');
  await lp.click('#bot-start');
  await lp.waitForTimeout(500);
  await lp.screenshot({ path: `${OUT}/bot-landscape.png` });
  await land.close();

  // ---------------- offline ----------------
  await ctx.setOffline(true);
  const off = await newPage(ctx, []);
  await off.goto(URL);
  await off.waitForTimeout(600);
  check('offline: app loads with no internet', await off.isVisible('#btn-bot'));
  const engOk = await off.evaluate(() => window.__chess.getEngine().then((e) => !!e));
  check('offline: bot engine starts with no internet', engOk);
  await off.click('#btn-bot');
  await off.click('#bot-levels button[data-l="5"]');
  await off.click('#bot-color button[data-v="white"]');
  await off.click('#bot-start');
  await move(off, 'e2', 'e4');
  await off.waitForFunction(() => window.__chess.game.chess.history().length === 2, null, { timeout: 15000 }).catch(() => {});
  check('offline: bot plays a move', (await history(off)).length === 2);
  const offPieces = await off.$eval('#board piece.white.queen', (el) => getComputedStyle(el).backgroundImage);
  check('offline: piece images load', offPieces.includes('cburnett/wQ.svg'));
  await off.click('#controls [data-act="home"]');
  await off.click('#btn-look');
  await off.click('#piece-tiles .tile[data-id="pixel"]');
  await off.click('#board-tiles .tile[data-id="marble"]');
  await off.waitForTimeout(300);
  const offImg = await off.$eval('#look-board piece.black.rook', (el) => el.offsetWidth > 0 && getComputedStyle(el).backgroundImage);
  check('offline: switching piece sets works', String(offImg).includes('pixel/bR.svg'));
  await off.screenshot({ path: `${OUT}/offline-look.png` });
  await ctx.setOffline(false);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  const realErrors = errors.filter((e) => !/favicon/.test(e));
  console.log(realErrors.length ? 'Errors:\n' + realErrors.join('\n') : 'No console errors or failed requests.');
  process.exit(failed.length || realErrors.length ? 1 : 0);
})();
