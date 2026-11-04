// Plays bot levels against each other to check each level is stronger
// than the one below. Usage: node tests/level-match.mjs <lowLevel> <games>
import { Chess } from '../vendor/chessjs/chess.js';
import { levelInfo, pickBotMove } from '../js/levels.js';
import { gameResult } from '../js/rules.js';
import { startNodeEngine } from './node-engine.mjs';

const low = Number(process.argv[2] || 1);
const games = Number(process.argv[3] || 10);
const high = low + 1;
const engines = { [low]: await startNodeEngine(), [high]: await startNodeEngine() };
let highScore = 0;
const t0 = Date.now();
const log = [];
for (let g = 0; g < games; g++) {
  const whiteLv = g % 2 === 0 ? high : low;
  const blackLv = whiteLv === high ? low : high;
  const chess = new Chess();
  await engines[low].newGame();
  await engines[high].newGame();
  let res = null;
  while (!res && chess.history().length < 300) {
    const lv = chess.turn() === 'w' ? whiteLv : blackLv;
    const mv = await pickBotMove(chess, levelInfo(lv), engines[lv]);
    chess.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    res = gameResult(chess);
  }
  res = res || { winner: null, reason: 'move-cap' };
  const highColor = whiteLv === high ? 'white' : 'black';
  const pts = res.winner === null ? 0.5 : res.winner === highColor ? 1 : 0;
  highScore += pts;
  log.push(`${pts}`);
}
console.log(`L${high} vs L${low}: ${highScore}/${games} for L${high} [${log.join(' ')}] in ${Math.round((Date.now() - t0) / 1000)}s`);
engines[low].quit(); engines[high].quit();
process.exit(0);
