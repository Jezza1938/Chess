// Rule and clock tests. Run: node tests/unit.mjs
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chessjs/chess.js';
import { gameResult, timeoutResult, canEverMate, materialDiff } from '../js/rules.js';
import { Clock, formatTime } from '../js/clock.js';
import { LEVELS, pickBotMove } from '../js/levels.js';

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log('PASS ', name); }
  catch (e) { console.log('FAIL ', name, '\n  ', e.message); process.exitCode = 1; }
};
const play = (moves, fen) => { const c = new Chess(fen); for (const m of moves) c.move(m); return c; };

// --- setup and special moves
t('start position is standard', () => assert.equal(new Chess().fen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
t('20 legal first moves', () => assert.equal(new Chess().moves().length, 20));
t('castling kingside', () => { const c = play(['e4','e5','Nf3','Nc6','Bc4','Bc5','O-O']); assert.equal(c.get('g1').type, 'k'); assert.equal(c.get('f1').type, 'r'); });
t('cannot castle through check', () => { const c = new Chess('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1'); assert.ok(!c.moves().includes('O-O')); });
t('en passant', () => { const c = play(['e4','a6','e5','d5','exd6']); assert.equal(c.get('d5'), undefined); });
t('en passant only right away', () => { const c = play(['e4','a6','e5','d5','a3','a5']); assert.ok(!c.moves().includes('exd6')); });
t('promotion choices', () => { const c = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1'); assert.deepEqual(c.moves().filter(m => m.startsWith('a8')).sort(), ['a8=B','a8=N','a8=Q+','a8=R+'].sort()); });

// --- endings
t('checkmate (fool\'s mate)', () => assert.deepEqual(gameResult(play(['f3','e5','g4','Qh4#'])), { winner: 'black', reason: 'checkmate' }));
t('stalemate', () => assert.equal(gameResult(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'stalemate'));
t('insufficient material K v K', () => assert.equal(gameResult(new Chess('8/8/4k3/8/8/4K3/8/8 w - - 0 1')).reason, 'insufficient'));
t('threefold repetition', () => assert.equal(gameResult(play(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])).reason, 'repetition'));
t('50-move rule', () => assert.equal(gameResult(new Chess('8/8/4k3/8/8/4K3/8/R7 w - - 100 80')).reason, 'fifty'));
t('game not over at start', () => assert.equal(gameResult(new Chess()), null));

// --- time out rules
t('flag = loss when opponent has mating material', () => assert.deepEqual(timeoutResult(new Chess(), 'white'), { winner: 'black', reason: 'timeout' }));
t('flag vs bare king = draw', () => assert.equal(timeoutResult(new Chess('8/8/4k3/8/8/4K3/4Q3/8 w - - 0 1'), 'white').reason, 'timeout-draw'));
t('flag vs king+knight with your pieces = loss (mate possible)', () => assert.equal(timeoutResult(new Chess('8/8/4k3/4n3/8/4K3/4Q3/8 w - - 0 1'), 'white').reason, 'timeout'));
t('same-colour bishops only: no mate possible', () => assert.equal(canEverMate(new Chess('8/8/4k3/8/2b5/4K3/4B3/8 w - - 0 1'), 'black'), false));

// --- material
t('material diff after a capture', () => { const d = materialDiff(play(['e4','d5','exd5'])); assert.deepEqual(d.white, { pieces: ['p'], score: 1 }); assert.equal(d.black.score, 0); });

// --- clock
t('clock: increments and switching', () => {
  let now = 0; const c = new Clock({ white: 60000, black: 60000, incWhite: 2000, incBlack: 2000, now: () => now });
  c.press('white'); // first press: starts black, no increment
  assert.equal(c.running, 'black');
  now += 5000; c.press('black');
  assert.equal(c.timeLeft('black'), 57000);
  now += 10000; assert.equal(c.timeLeft('white'), 50000);
  c.press('white'); assert.equal(c.timeLeft('white'), 52000);
  c.stopTimer();
});
t('clock: pause and resume', () => {
  let now = 0; const c = new Clock({ white: 60000, black: 60000, now: () => now });
  c.run('white'); now += 1000; c.pause(); now += 50000;
  assert.equal(c.timeLeft('white'), 59000);
  c.resume(); now += 1000; assert.equal(c.timeLeft('white'), 58000); c.stopTimer();
});
t('clock: flags at zero', () => {
  let now = 0, flagged = null; const c = new Clock({ white: 1000, black: 1000, now: () => now, onFlag: (x) => (flagged = x) });
  c.run('white'); now += 1500; c.check(); assert.equal(flagged, 'white'); assert.equal(c.timeLeft('white'), 0);
});
t('clock: side without a clock never flags', () => {
  let now = 0; const c = new Clock({ white: 60000, black: null, now: () => now });
  c.run('black'); now += 1e9; assert.equal(c.check(), false); assert.equal(c.timeLeft('black'), Infinity); c.stopTimer();
});
t('clock: save and restore', () => {
  let now = 0; const c = new Clock({ white: 60000, black: 30000, incWhite: 1000, now: () => now });
  c.run('black'); now += 4000; const j = JSON.parse(JSON.stringify(c.toJSON())); c.stopTimer();
  const r = Clock.fromJSON(j, { now: () => now });
  assert.equal(r.timeLeft('black'), 26000); assert.equal(r.paused, 'black'); assert.equal(r.running, null);
});
t('format time', () => { assert.equal(formatTime(600000), '10:00'); assert.equal(formatTime(65000), '1:05'); assert.equal(formatTime(9450), '9.4'); assert.equal(formatTime(3723000), '1:02:03'); });

// --- bot
t('10 levels, each harder settings than the last', () => {
  assert.equal(LEVELS.length, 10);
  for (let i = 1; i < 10; i++) assert.ok(LEVELS[i].skill >= LEVELS[i - 1].skill && LEVELS[i].random <= LEVELS[i - 1].random);
});
const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
const mv = await pickBotMove(c, LEVELS[0], null, { rng: () => 0.99 });
t('backup bot (no engine) finds mate in one', () => assert.equal(mv, 'd1d8'));

console.log(`\n${passed} passed`);
