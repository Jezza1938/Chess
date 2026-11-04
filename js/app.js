import { Chessground } from '../vendor/chessground/chessground.js';
import { Chess } from '../vendor/chessjs/chess.js';
import { Clock, formatTime, other } from './clock.js';
import { gameResult, timeoutResult, materialDiff, colorName, REASONS, ROLE } from './rules.js';
import { LEVELS, levelInfo, pickBotMove } from './levels.js';
import { startBrowserEngine } from './engine.js';
import { Sounds } from './sounds.js';
import { loadSettings, saveSettings, loadGame, saveGame } from './storage.js';
import { BOARDS, PIECE_SETS, boardThumb, pieceImg } from './themes.js';

export const APP_VERSION = '1.0.0';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const settings = loadSettings();
const sounds = new Sounds();
sounds.enabled = settings.sound;
const persistSettings = () => saveSettings(settings);

let G = null; // the current game
let cg = null; // the board
let previewCg = null; // small board on the Boards & Pieces screen
let current = 'home';

// ---------------------------------------------------------------- engine

let engine = null;
let enginePromise = null;
function getEngine() {
  if (!enginePromise) {
    enginePromise = startBrowserEngine()
      .then((e) => (engine = e))
      .catch((err) => {
        console.error('engine failed', err);
        toast('The bot engine could not start, so a simple backup bot will play.', 4000);
        return null;
      });
  }
  return enginePromise;
}

// ---------------------------------------------------------------- time controls

const PRESETS = [
  { id: 'none', label: 'No clock' },
  { id: '1+0', min: 1, inc: 0 },
  { id: '3+0', min: 3, inc: 0 },
  { id: '3+2', min: 3, inc: 2 },
  { id: '5+0', min: 5, inc: 0 },
  { id: '5+3', min: 5, inc: 3 },
  { id: '10+0', min: 10, inc: 0 },
  { id: '10+5', min: 10, inc: 5 },
  { id: '15+10', min: 15, inc: 10 },
  { id: '30+0', min: 30, inc: 0 },
  { id: '60+0', min: 60, inc: 0 },
  { id: 'custom', label: 'Custom' },
];
const presetLabel = (p) => p.label || (p.inc ? `${p.min} + ${p.inc}s` : `${p.min} min`);
const matchPreset = (t) => (PRESETS.find((p) => p.min === t.minutes && p.inc === t.inc) || { id: 'custom' }).id;
const describeTime = (min, inc) => `${min} min${inc ? ` + ${inc}s` : ''}`;

function readNumber(input, lo, hi, fallback) {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

// Wires up a row of time chips plus the custom minutes/increment boxes.
function bindTimeControls(prefix, getTime) {
  const chips = $(`#${prefix}-time-chips`);
  const min = $(`#${prefix}-min`);
  const inc = $(`#${prefix}-inc`);
  const box = $(`#${prefix}-custom`);
  chips.innerHTML = PRESETS.map((p) => `<button data-id="${p.id}">${presetLabel(p)}</button>`).join('');
  const renderChips = () => {
    const t = getTime();
    $$('button', chips).forEach((b) => b.classList.toggle('on', b.dataset.id === t.preset));
    box.classList.toggle('dim', t.preset === 'none');
    min.disabled = inc.disabled = t.preset === 'none';
  };
  const render = () => {
    const t = getTime();
    min.value = t.minutes;
    inc.value = t.inc;
    renderChips();
  };
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const t = getTime();
    const p = PRESETS.find((x) => x.id === b.dataset.id);
    t.preset = p.id;
    if (p.min != null) {
      t.minutes = p.min;
      t.inc = p.inc;
    }
    persistSettings();
    render();
  });
  const onInput = () => {
    const t = getTime();
    t.minutes = readNumber(min, 0.25, 180, t.minutes);
    t.inc = Math.round(readNumber(inc, 0, 60, t.inc));
    t.preset = matchPreset(t);
    persistSettings();
    renderChips();
  };
  min.addEventListener('input', onInput);
  inc.addEventListener('input', onInput);
  min.addEventListener('change', render);
  inc.addEventListener('change', render);
  return render;
}

// ---------------------------------------------------------------- screens

function show(name) {
  if (current === 'game' && name !== 'game' && G && !G.over && G.clock.running) pauseGame();
  current = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  if (name === 'home') renderHome();
  if (name === 'bot') renderBotSetup();
  if (name === 'pvp') renderPvpSetup();
  if (name === 'look') renderLook();
  if (name === 'game') {
    layout();
    cg?.redrawAll();
  }
  setWakeLock(name === 'game' && G && !G.over);
}

function renderHome() {
  const btn = $('#btn-continue');
  const g = G && !G.over ? { mode: G.mode, level: G.level, n: G.chess.history().length } : savedSummary();
  btn.hidden = !g;
  if (g) {
    const moves = `${Math.ceil(g.n / 2) || 0} move${Math.ceil(g.n / 2) === 1 ? '' : 's'} played`;
    $('#continue-sub').textContent = (g.mode === 'bot' ? `vs Bot, level ${g.level}` : '2 Players') + ` · ${moves}`;
  }
}

function savedSummary() {
  const s = loadGame();
  if (!s || !s.desc) return null;
  return { mode: s.desc.mode, level: s.desc.level, n: s.moves.length };
}

// ---------------------------------------------------------------- bot setup

let renderBotTime;
function setupBotScreen() {
  const levels = $('#bot-levels');
  levels.innerHTML = LEVELS.map((l) => `<button data-l="${l.level}">${l.level}</button>`).join('');
  levels.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.bot.level = Number(b.dataset.l);
    persistSettings();
    renderBotSetup();
  });
  $('#bot-color').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.bot.color = b.dataset.v;
    persistSettings();
    renderBotSetup();
  });
  renderBotTime = bindTimeControls('bot', () => settings.bot.time);
  $('#bot-clock').addEventListener('change', (e) => {
    settings.bot.botClock = e.target.checked;
    persistSettings();
  });
  $('#bot-start').addEventListener('click', () => startNewGame('bot'));
}

function renderBotSetup() {
  const s = settings.bot;
  $$('#bot-levels button').forEach((b) => b.classList.toggle('on', Number(b.dataset.l) === s.level));
  const lv = levelInfo(s.level);
  $('#bot-level-desc').innerHTML =
    `<b>Level ${lv.level} · ${lv.name}</b> <span>— plays at about ${lv.rating === 'Max' ? 'full engine strength' : `${lv.rating} rating`}</span>`;
  $$('#bot-color button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.color));
  $('#bot-clock').checked = s.botClock;
  renderBotTime();
}

// ---------------------------------------------------------------- 2 player setup

let renderPvpTime;
function setupPvpScreen() {
  renderPvpTime = bindTimeControls('pvp', () => settings.pvp.time);
  $('#pvp-split').addEventListener('change', (e) => {
    const p = settings.pvp;
    p.split = e.target.checked;
    if (p.split) {
      // Start both players from the current shared time.
      const t = p.time.preset === 'none' ? { minutes: 10, inc: 0 } : p.time;
      p.white = { minutes: t.minutes, inc: t.inc };
      p.black = { minutes: t.minutes, inc: t.inc };
    }
    persistSettings();
    renderPvpSetup();
  });
  for (const c of ['w', 'b']) {
    const key = c === 'w' ? 'white' : 'black';
    const min = $(`#pvp-${c}-min`);
    const inc = $(`#pvp-${c}-inc`);
    const onInput = () => {
      const t = settings.pvp[key];
      t.minutes = readNumber(min, 0.25, 180, t.minutes);
      t.inc = Math.round(readNumber(inc, 0, 60, t.inc));
      persistSettings();
    };
    min.addEventListener('input', onInput);
    inc.addEventListener('input', onInput);
    min.addEventListener('change', renderPvpSetup);
    inc.addEventListener('change', renderPvpSetup);
  }
  $('#pvp-face').addEventListener('change', (e) => {
    settings.pvp.faceToFace = e.target.checked;
    persistSettings();
  });
  $('#pvp-start').addEventListener('click', () => startNewGame('pvp'));
}

function renderPvpSetup() {
  const p = settings.pvp;
  renderPvpTime();
  $('#pvp-split').checked = p.split;
  $('#pvp-split-box').classList.toggle('on', p.split);
  $('#pvp-time-chips').hidden = p.split;
  $('#pvp-custom').hidden = p.split;
  $('#pvp-w-min').value = p.white.minutes;
  $('#pvp-w-inc').value = p.white.inc;
  $('#pvp-b-min').value = p.black.minutes;
  $('#pvp-b-inc').value = p.black.inc;
  $('#pvp-face').checked = p.faceToFace;
}

// ---------------------------------------------------------------- boards & pieces

function applyTheme() {
  const b = document.body;
  [...b.classList].filter((c) => c.startsWith('board-') || c.startsWith('pieces-')).forEach((c) => b.classList.remove(c));
  b.classList.add(`board-${settings.board}`, `pieces-${settings.pieces}`);
  const face = G && G.mode === 'pvp' && G.faceToFace && G.orientation === 'white';
  b.classList.toggle('face-to-face', !!face);
}

function setupLookScreen() {
  $('#board-tiles').innerHTML = BOARDS.map(
    (b) => `<button class="tile" data-id="${b.id}"><img class="thumb" src="${boardThumb(b)}" alt=""><span>${b.name}</span></button>`,
  ).join('');
  $('#piece-tiles').innerHTML = PIECE_SETS.map(
    (p) =>
      `<button class="tile" data-id="${p.id}"><div class="pset">${['wK', 'bK', 'wN', 'bN']
        .map((c) => `<img src="${pieceImg(p.id, c)}" alt="">`)
        .join('')}</div><span>${p.name}</span></button>`,
  ).join('');
  $('#board-tiles').addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    settings.board = t.dataset.id;
    persistSettings();
    applyTheme();
    renderLook();
  });
  $('#piece-tiles').addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    settings.pieces = t.dataset.id;
    persistSettings();
    applyTheme();
    renderLook();
  });
  const opt = (id, key, after) =>
    $(id).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      persistSettings();
      after?.();
    });
  opt('#opt-sound', 'sound', () => {
    sounds.enabled = settings.sound;
    if (settings.sound) {
      sounds.unlock();
      sounds.play('move');
    }
  });
  opt('#opt-dests', 'showDests', () => G && cg && syncBoard());
  opt('#opt-coords', 'coords', () => {
    for (const board of [cg, previewCg]) {
      if (!board) continue;
      board.set({ coordinates: settings.coords });
      board.redrawAll();
    }
  });
}

function renderLook() {
  $$('#board-tiles .tile').forEach((t) => t.classList.toggle('on', t.dataset.id === settings.board));
  $$('#piece-tiles .tile').forEach((t) => t.classList.toggle('on', t.dataset.id === settings.pieces));
  $('#opt-sound').checked = settings.sound;
  $('#opt-dests').checked = settings.showDests;
  $('#opt-coords').checked = settings.coords;
  if (!previewCg) {
    previewCg = Chessground($('#look-board'), {
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R',
      lastMove: ['f1', 'c4'],
      viewOnly: true,
      coordinates: settings.coords,
      drawable: { enabled: false, visible: false },
    });
  } else previewCg.redrawAll();
}

// ---------------------------------------------------------------- starting games

function timeMs(minutes) {
  return Math.round(minutes * 60000);
}

function botDesc() {
  const s = settings.bot;
  const humanColor = s.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : s.color;
  const clock = { white: null, black: null, incWhite: 0, incBlack: 0 };
  if (s.time.preset !== 'none') {
    const ms = timeMs(s.time.minutes);
    const inc = s.time.inc * 1000;
    const botColor = other(humanColor);
    clock[humanColor] = ms;
    clock[humanColor === 'white' ? 'incWhite' : 'incBlack'] = inc;
    if (s.botClock) {
      clock[botColor] = ms;
      clock[botColor === 'white' ? 'incWhite' : 'incBlack'] = inc;
    }
  }
  return { mode: 'bot', humanColor, level: s.level, clock };
}

function pvpDesc() {
  const p = settings.pvp;
  let clock;
  if (p.split) {
    clock = {
      white: timeMs(p.white.minutes),
      black: timeMs(p.black.minutes),
      incWhite: p.white.inc * 1000,
      incBlack: p.black.inc * 1000,
    };
  } else if (p.time.preset === 'none') {
    clock = { white: null, black: null, incWhite: 0, incBlack: 0 };
  } else {
    const ms = timeMs(p.time.minutes);
    const inc = p.time.inc * 1000;
    clock = { white: ms, black: ms, incWhite: inc, incBlack: inc };
  }
  return { mode: 'pvp', faceToFace: p.faceToFace, clock };
}

function makeGame(desc, saved) {
  const g = {
    desc,
    mode: desc.mode,
    humanColor: desc.humanColor,
    level: desc.level,
    faceToFace: !!desc.faceToFace,
    chess: new Chess(),
    over: null,
    paused: false,
    awaitingTap: null,
    botThinking: false,
    botToken: 0,
    hintToken: 0,
    hinting: false,
    promoting: false,
    orientation: desc.mode === 'bot' ? desc.humanColor : 'white',
    lowWarned: { white: false, black: false },
  };
  const handlers = {
    onFlag: (c) => G === g && onFlag(c),
    onTick: () => G === g && renderClocks(),
  };
  if (saved) {
    for (const m of saved.moves) g.chess.move(m);
    g.clock = Clock.fromJSON(saved.clock, handlers);
    g.awaitingTap = saved.awaitingTap || null;
    g.orientation = saved.orientation || g.orientation;
    g.paused = !!g.clock.paused;
    for (const c of ['white', 'black']) g.lowWarned[c] = g.clock.timeLeft(c) < 10000;
  } else {
    g.clock = new Clock({ ...desc.clock, ...handlers });
  }
  return g;
}

function serialize(g) {
  return {
    v: 1,
    desc: g.desc,
    moves: g.chess.history({ verbose: true }).map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })),
    clock: g.clock.toJSON(),
    awaitingTap: g.awaitingTap,
    orientation: g.orientation,
    savedAt: Date.now(),
  };
}

function persist() {
  if (G && !G.over) saveGame(serialize(G));
}

function dropGame() {
  if (!G) return;
  G.clock.destroy();
  cancelBot();
  cancelHint();
  G = null;
}

function startNewGame(mode) {
  closeModal();
  dropGame();
  G = makeGame(mode === 'bot' ? botDesc() : pvpDesc());
  openGame();
  sounds.play('start', 0.6);
  persist();
  if (mode === 'bot') {
    getEngine().then((e) => e && e.newGame());
    if (G.humanColor === 'black') botTurn();
  }
}

function restoreSaved() {
  const saved = loadGame();
  if (!saved || !saved.desc) return false;
  try {
    dropGame();
    G = makeGame(saved.desc, saved);
    return true;
  } catch (e) {
    console.error('could not restore game', e);
    saveGame(null);
    return false;
  }
}

function openGame() {
  ensureBoard();
  setHint(null);
  applyTheme();
  syncBoard();
  renderGame(); // before show(), so the board is sized with the right clock sizes
  show('game');
  if (G.mode === 'bot' && !G.paused && !G.over && colorName(G.chess.turn()) !== G.humanColor && !G.botThinking) botTurn();
}

// ---------------------------------------------------------------- board

function ensureBoard() {
  if (cg) return;
  cg = Chessground($('#board'), {
    coordinates: settings.coords,
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, showDests: settings.showDests, events: { after: onUserMove } },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: false, visible: false },
    blockTouchScroll: true,
  });
}

function humanCanMove() {
  if (!G || G.over || G.paused || G.awaitingTap || G.promoting) return false;
  return G.mode === 'pvp' || colorName(G.chess.turn()) === G.humanColor;
}

function legalDests() {
  const map = new Map();
  for (const m of G.chess.moves({ verbose: true })) {
    if (!map.has(m.from)) map.set(m.from, []);
    map.get(m.from).push(m.to);
  }
  return map;
}

function syncBoard() {
  if (!cg || !G) return;
  const turn = colorName(G.chess.turn());
  const hist = G.chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  const can = humanCanMove();
  cg.set({
    fen: G.chess.fen(),
    orientation: G.orientation,
    turnColor: turn,
    check: G.chess.inCheck(),
    lastMove: last ? [last.from, last.to] : undefined,
    movable: { color: can ? turn : undefined, dests: can ? legalDests() : new Map(), showDests: settings.showDests },
  });
}

function onUserMove(orig, dest) {
  if (!humanCanMove()) return syncBoard();
  const legal = G.chess.moves({ verbose: true }).filter((m) => m.from === orig && m.to === dest);
  if (!legal.length) return syncBoard();
  if (legal.some((m) => m.promotion)) {
    askPromotion(colorName(G.chess.turn()), (p) => (p ? applyMove({ from: orig, to: dest, promotion: p }) : syncBoard()));
    return;
  }
  applyMove({ from: orig, to: dest });
}

function askPromotion(color, done) {
  G.promoting = true;
  syncBoard();
  const box = $('#promo');
  const choices = $('.promo-choices', box);
  choices.innerHTML = ['queen', 'rook', 'bishop', 'knight']
    .map((r) => `<button data-r="${r}"><piece class="${color} ${r}"></piece></button>`)
    .join('');
  box.classList.toggle('top-player', G.mode === 'pvp' && color !== G.orientation);
  box.hidden = false;
  const g = G;
  const finish = (p) => {
    box.hidden = true;
    choices.onclick = null;
    $('#promo-cancel').onclick = null;
    if (G !== g) return;
    G.promoting = false;
    done(p);
  };
  choices.onclick = (e) => {
    const b = e.target.closest('button');
    if (b) finish({ queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[b.dataset.r]);
  };
  $('#promo-cancel').onclick = () => finish(null);
}

function applyMove(m) {
  let move;
  try {
    move = G.chess.move(m);
  } catch {
    syncBoard();
    return null;
  }
  cancelHint();
  setHint(null);
  sounds.play(move.captured ? 'capture' : 'move');
  const mover = colorName(move.color);
  const res = gameResult(G.chess);
  if (res) {
    syncBoard();
    endGame(res);
    return move;
  }
  if (G.clock.enabled) {
    if (G.mode === 'bot') G.clock.press(mover);
    else G.awaitingTap = mover; // 2 players: the mover taps their own clock
  }
  syncBoard();
  renderGame();
  persist();
  if (G.mode === 'bot' && mover === G.humanColor) botTurn();
  return move;
}

// ---------------------------------------------------------------- clock taps (2 players)

function onClockTap(color) {
  if (!G || G.mode !== 'pvp' || G.over || G.paused || !G.clock.enabled) return;
  if (G.awaitingTap !== color) {
    if (!G.awaitingTap && colorName(G.chess.turn()) === color) toast(`${cap(color)}: make your move first`);
    return;
  }
  G.awaitingTap = null;
  G.clock.press(color);
  sounds.play('click');
  syncBoard();
  renderGame();
  persist();
}

function onFlag(color) {
  if (!G || G.over) return;
  endGame(timeoutResult(G.chess, color));
}

// ---------------------------------------------------------------- bot

function cancelBot() {
  if (!G) return;
  if (G.botThinking) engine?.cancelAll();
  G.botToken++;
  G.botThinking = false;
}

function cancelHint() {
  if (!G) return;
  if (G.hinting) engine?.cancelAll();
  G.hintToken++;
  G.hinting = false;
}

async function botTurn() {
  if (!G || G.mode !== 'bot' || G.over || G.paused) return;
  if (colorName(G.chess.turn()) === G.humanColor) return;
  const g = G;
  const token = ++g.botToken;
  g.botThinking = true;
  renderStatus();
  renderControls();
  const startedAt = performance.now();
  const eng = await getEngine();
  if (G !== g || token !== g.botToken) return;
  const botColor = other(g.humanColor);
  const lv = levelInfo(g.level);
  const timeLeft = g.clock.timeLeft(botColor);
  const inc = g.clock.inc[botColor];
  let mv = null;
  try {
    mv = await pickBotMove(g.chess, lv, eng, { timeLeft, inc });
  } catch (e) {
    console.error('bot search failed', e);
    mv = await pickBotMove(g.chess, lv, null);
  }
  if (G !== g || token !== g.botToken || g.over || g.paused || !mv) return;
  // Don't reply instantly: it feels more natural.
  const want = Math.min(lv.level <= 3 ? 700 : 350, Number.isFinite(timeLeft) ? timeLeft / 40 : Infinity);
  const wait = want - (performance.now() - startedAt);
  if (wait > 0) await sleep(wait);
  if (G !== g || token !== g.botToken || g.over || g.paused) return;
  g.botThinking = false;
  applyMove({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
}

async function showHint() {
  if (!G || G.mode !== 'bot' || !humanCanMove() || G.hinting) return;
  const g = G;
  const token = ++g.hintToken;
  g.hinting = true;
  renderControls();
  toast('Finding a good move…', 1500);
  const eng = await getEngine();
  const fen = g.chess.fen();
  let res = null;
  try {
    res = eng ? await eng.search({ fen, skill: 20, depth: 18, movetime: 1500 }) : null;
  } catch (e) {
    console.error(e);
  }
  if (G !== g || token !== g.hintToken) return;
  g.hinting = false;
  renderControls();
  if (!res || !res.bestmove || g.chess.fen() !== fen) {
    if (!eng) toast('Hints need the bot engine, which could not start.');
    return;
  }
  const from = res.bestmove.slice(0, 2);
  const to = res.bestmove.slice(2, 4);
  setHint(from, to, !!g.chess.get(to));
}

// Shows a hint as a tinted "from" square and a dot on the "to" square.
function setHint(from, to, capture) {
  if (!cg) return;
  const custom = new Map();
  if (from) {
    custom.set(from, 'hint-from');
    custom.set(to, capture ? 'hint-to hint-cap' : 'hint-to');
  }
  cg.set({ highlight: { custom } });
}

// ---------------------------------------------------------------- game actions

function canUndo() {
  if (!G || G.over || G.promoting) return false;
  const hist = G.chess.history({ verbose: true });
  if (!hist.length) return false;
  if (G.mode === 'bot') return hist.some((m) => colorName(m.color) === G.humanColor);
  return true;
}

function undo() {
  if (!canUndo()) return;
  cancelBot();
  cancelHint();
  setHint(null);
  const c = G.chess;
  if (G.mode === 'bot') {
    if (colorName(c.turn()) !== G.humanColor) c.undo();
    else {
      c.undo();
      if (colorName(c.turn()) !== G.humanColor) c.undo();
    }
  } else {
    c.undo();
    G.awaitingTap = null;
  }
  const turn = colorName(c.turn());
  if (!c.history().length) G.clock.unstart();
  else if (G.clock.started) {
    if (G.paused) G.clock.paused = turn;
    else G.clock.run(turn);
  }
  syncBoard();
  renderGame();
  persist();
  if (G.mode === 'bot' && turn !== G.humanColor) botTurn();
}

function flip() {
  if (!G) return;
  G.orientation = other(G.orientation);
  applyTheme();
  syncBoard();
  renderGame();
  persist();
}

function pauseGame() {
  if (!G || G.over || G.paused) return;
  G.paused = true;
  G.clock.pause();
  cancelBot();
  cancelHint();
  syncBoard();
  renderGame();
  persist();
}

function resumeGame() {
  if (!G || !G.paused) return;
  G.paused = false;
  G.clock.resume();
  syncBoard();
  renderGame();
  persist();
  if (G.mode === 'bot' && colorName(G.chess.turn()) !== G.humanColor) botTurn();
}

function endGame(res) {
  G.over = res;
  G.awaitingTap = null;
  G.paused = false;
  G.clock.stop();
  cancelBot();
  cancelHint();
  syncBoard();
  renderGame();
  saveGame(null);
  sounds.play('end');
  setWakeLock(false);
  const g = G;
  setTimeout(() => G === g && showResult(), 450);
}

function resultTitle(res) {
  if (!res.winner) return 'Draw';
  if (G.mode === 'bot') return res.winner === G.humanColor ? 'You win!' : 'The bot wins';
  return `${cap(res.winner)} wins`;
}

function resultText(res) {
  if (res.reason === 'resign') {
    const loser = other(res.winner);
    return G.mode === 'bot' && loser === G.humanColor ? 'You resigned.' : `${cap(loser)} resigned.`;
  }
  if (res.reason === 'timeout' && res.winner) {
    const loser = other(res.winner);
    return G.mode === 'bot'
      ? loser === G.humanColor
        ? 'You ran out of time.'
        : 'The bot ran out of time.'
      : `${cap(loser)} ran out of time.`;
  }
  return `${REASONS[res.reason] || ''}.`;
}

function showResult() {
  modal({
    title: resultTitle(G.over),
    text: resultText(G.over),
    buttons: [
      { label: 'Play again', cls: 'primary', action: () => startNewGame(G.mode) },
      { label: 'Change settings', action: () => show(G.mode) },
      { label: 'Look at the board', action: () => {} },
    ],
  });
}

function onAction(act) {
  if (!G) return;
  switch (act) {
    case 'home':
      show('home');
      break;
    case 'new':
      if (G.over || !G.chess.history().length) return show(G.mode);
      modal({
        title: 'New game?',
        text: 'The game you are playing now will end.',
        buttons: [
          { label: 'New game, same settings', cls: 'primary', action: () => startNewGame(G.mode) },
          { label: 'Change settings first', action: () => show(G.mode) },
          { label: 'Keep playing' },
        ],
      });
      break;
    case 'undo':
      undo();
      break;
    case 'flip':
      flip();
      break;
    case 'hint':
      showHint();
      break;
    case 'pause':
      if (G.paused) resumeGame();
      else pauseGame();
      break;
    case 'draw':
      if (G.over) return;
      modal({
        title: 'Agree to a draw?',
        text: 'Both players must agree.',
        buttons: [
          { label: 'Yes, call it a draw', cls: 'primary', action: () => endGame({ winner: null, reason: 'agreement' }) },
          { label: 'Keep playing' },
        ],
      });
      break;
    case 'resign':
      if (G.over) return;
      if (G.mode === 'bot') {
        modal({
          title: 'Resign?',
          text: 'The bot will win this game.',
          buttons: [
            { label: 'Resign', cls: 'danger', action: () => endGame({ winner: other(G.humanColor), reason: 'resign' }) },
            { label: 'Keep playing' },
          ],
        });
      } else {
        modal({
          title: 'Who is resigning?',
          buttons: [
            { label: 'White resigns', cls: 'danger', action: () => endGame({ winner: 'black', reason: 'resign' }) },
            { label: 'Black resigns', cls: 'danger', action: () => endGame({ winner: 'white', reason: 'resign' }) },
            { label: 'Keep playing' },
          ],
        });
      }
      break;
  }
}

// ---------------------------------------------------------------- game rendering

const panelFor = (color) => (color === G.orientation ? $('#p-bottom') : $('#p-top'));

function playerName(color) {
  if (G.mode === 'pvp') return cap(color);
  if (color === G.humanColor) return 'You';
  const lv = levelInfo(G.level);
  return `Bot <span class="lvl">Level ${lv.level} · ${lv.name}</span>`;
}

function renderGame() {
  if (!G) return;
  const scr = $('#screen-game');
  scr.classList.toggle('pvp', G.mode === 'pvp');
  scr.classList.toggle('bot', G.mode === 'bot');
  renderPlayers();
  renderClocks();
  renderStatus();
  renderControls();
  renderMoves();
  $('#paused').hidden = !G.paused || G.over;
}

function renderPlayers() {
  const diff = materialDiff(G.chess);
  for (const color of ['white', 'black']) {
    const el = panelFor(color);
    el.dataset.color = color;
    $('.pname', el).innerHTML = `<span class="dot ${color}"></span>${playerName(color)}`;
    const d = diff[color];
    let html = '';
    let prev = null;
    for (const t of d.pieces) {
      html += `<piece class="${other(color)} ${ROLE[t]}${prev && prev !== t ? ' gap' : ''}"></piece>`;
      prev = t;
    }
    if (d.score) html += `<span class="score">+${d.score}</span>`;
    $('.pcap', el).innerHTML = html;
  }
}

function renderClocks() {
  if (!G) return;
  const c = G.clock;
  for (const color of ['white', 'black']) {
    const btn = $('.clock', panelFor(color));
    const has = c.hasTime(color);
    btn.classList.toggle('none', !has);
    if (!has) continue;
    const ms = c.timeLeft(color);
    const text = formatTime(ms);
    const span = $('.ctime', btn);
    if (span.textContent !== text) span.textContent = text;
    btn.classList.toggle('active', c.running === color);
    btn.classList.toggle('low', ms < Math.min(20000, c.initial[color] * 0.2) && !c.flagged);
    btn.classList.toggle('flagged', c.flagged === color);
    btn.classList.toggle('waiting', G.mode === 'pvp' && G.awaitingTap === color && !G.paused && !G.over);
    if (c.running === color && ms < 10000 && !G.lowWarned[color] && c.initial[color] >= 30000) {
      G.lowWarned[color] = true;
      sounds.play('low');
    }
  }
}

function renderStatus() {
  const el = $('#status');
  const turn = colorName(G.chess.turn());
  let txt;
  let alert = false;
  if (G.over) txt = `${resultTitle(G.over)} · ${resultText(G.over).replace(/\.$/, '')}`;
  else if (G.paused) txt = 'Paused';
  else if (G.promoting) txt = 'Choose a piece to promote to';
  else if (G.mode === 'pvp') {
    if (G.awaitingTap) {
      txt = `${cap(G.awaitingTap)}: tap your clock`;
      alert = true;
    } else if (!G.chess.history().length) {
      txt = G.clock.enabled ? 'White moves first, then taps their clock' : 'White moves first';
    } else txt = `${cap(turn)} to move`;
  } else {
    txt = turn === G.humanColor ? 'Your move' : 'Bot is thinking…';
  }
  if (!G.over && G.chess.inCheck()) {
    txt += ' · Check!';
    alert = true;
  }
  el.textContent = txt;
  el.classList.toggle('alert', alert);
}

function renderControls() {
  $$('#controls [data-only]').forEach((b) => (b.hidden = b.dataset.only !== G.mode));
  const btn = (a) => $(`#controls [data-act="${a}"]`);
  btn('undo').disabled = !canUndo();
  btn('hint').disabled = G.over || G.paused || !humanCanMove() || G.hinting;
  btn('pause').disabled = G.over || !G.clock.enabled || (!G.clock.started && !G.paused);
  btn('pause').classList.toggle('on', G.paused);
  $('span', btn('pause')).textContent = G.paused ? 'Resume' : 'Pause';
  btn('draw').disabled = !!G.over;
  btn('resign').disabled = !!G.over;
}

function renderMoves() {
  const el = $('#moves');
  const hist = G.chess.history();
  if (!hist.length) {
    el.innerHTML = '<div class="empty">No moves yet</div>';
    return;
  }
  let html = '';
  const last = hist.length - 1;
  for (let i = 0; i < hist.length; i += 2) {
    html += `<div class="n">${i / 2 + 1}.</div><div class="m${i === last ? ' last' : ''}">${hist[i]}</div>`;
    html += `<div class="m${i + 1 === last ? ' last' : ''}">${hist[i + 1] || ''}</div>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// Board size: as big as possible while leaving room for clocks and buttons.
function layout() {
  const scr = $('#screen-game');
  const st = getComputedStyle(scr);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const availW = W - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
  const availH = H - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
  const gap = 12;
  let size;
  if (W > H) {
    size = Math.min(availH, availW - 2 * (200 + gap));
  } else {
    const panels = ($('#p-top').offsetHeight || 80) + ($('#p-bottom').offsetHeight || 80);
    size = Math.min(availW, availH - panels - 178 - 3 * gap);
  }
  size = Math.max(200, Math.floor(size / 8) * 8);
  document.documentElement.style.setProperty('--board-size', `${size}px`);
}

// ---------------------------------------------------------------- dialogs

function modal({ title, text, buttons }) {
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text || '';
  $('#modal-text').hidden = !text;
  const box = $('#modal-buttons');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.cls) el.className = b.cls;
    el.addEventListener('click', () => {
      closeModal();
      b.action?.();
    });
    box.appendChild(el);
  }
  $('#modal').hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
}

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------------------------------------------------------------- screen wake lock

let wakeLock = null;
async function setWakeLock(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      const w = wakeLock;
      wakeLock = null;
      await w.release();
    }
  } catch {
    /* not supported: fine */
  }
}

// ---------------------------------------------------------------- start up

function setupGameScreen() {
  $('#controls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) onAction(b.dataset.act);
  });
  for (const p of ['#p-top', '#p-bottom']) {
    const btn = $(`${p} .clock`);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onClockTap(btn.closest('.player').dataset.color);
    });
  }
  $('#btn-resume').addEventListener('click', resumeGame);
}

function init() {
  applyTheme();
  setupBotScreen();
  setupPvpScreen();
  setupLookScreen();
  setupGameScreen();

  $('#btn-bot').addEventListener('click', () => show('bot'));
  $('#btn-pvp').addEventListener('click', () => show('pvp'));
  $('#btn-look').addEventListener('click', () => show('look'));
  $('#btn-continue').addEventListener('click', () => {
    if (!G || G.over) {
      if (!restoreSaved()) return renderHome();
    }
    openGame();
  });
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
  $('#version').textContent = `Version ${APP_VERSION}`;

  // iPad only allows sound after a tap.
  const unlock = () => sounds.unlock();
  for (const ev of ['touchend', 'pointerup', 'click']) document.addEventListener(ev, unlock, { capture: true, passive: true });

  window.addEventListener('resize', () => current === 'game' && layout());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (G && !G.over && G.clock.running) pauseGame();
      persist();
    } else if (current === 'game' && G && !G.over) setWakeLock(true);
  });
  window.addEventListener('pagehide', persist);

  renderHome();
  setTimeout(getEngine, 300);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => caches.keys())
      .then((keys) => {
        if (keys.some((k) => k.startsWith('chess-'))) $('#version').textContent = `Version ${APP_VERSION} · Saved for offline play ✓`;
      })
      .catch((e) => console.warn('offline setup failed', e));
  }
}

// Handy for automated tests.
window.__chess = {
  get game() {
    return G;
  },
  get engine() {
    return engine;
  },
  getEngine,
  settings,
};

init();
