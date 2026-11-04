// The 10 bot levels. Stockfish's weakest setting is still ~1300 strength,
// so the lowest levels also play some deliberately random moves.
//   random:   chance of a completely random legal move
//   skill:    Stockfish "Skill Level" (0-20)
//   depth:    how many moves ahead it may look
//   movetime: thinking time limit in ms

export const LEVELS = [
  { level: 1, name: 'Beginner', rating: '~400', random: 0.5, skill: 0, depth: 1, movetime: 50 },
  { level: 2, name: 'Novice', rating: '~600', random: 0.3, skill: 0, depth: 1, movetime: 50 },
  { level: 3, name: 'Casual', rating: '~800', random: 0.15, skill: 0, depth: 2, movetime: 100 },
  { level: 4, name: 'Improver', rating: '~1000', random: 0.06, skill: 0, depth: 3, movetime: 150 },
  { level: 5, name: 'Intermediate', rating: '~1200', random: 0.04, skill: 1, depth: 4, movetime: 150 },
  { level: 6, name: 'Club player', rating: '~1400', random: 0, skill: 4, depth: 6, movetime: 300 },
  { level: 7, name: 'Strong club', rating: '~1700', random: 0, skill: 7, depth: 8, movetime: 400 },
  { level: 8, name: 'Expert', rating: '~2000', random: 0, skill: 11, depth: 11, movetime: 600 },
  { level: 9, name: 'Master', rating: '~2400', random: 0, skill: 16, depth: 15, movetime: 1000 },
  { level: 10, name: 'Grandmaster', rating: 'Max', random: 0, skill: 20, depth: null, movetime: 2000 },
];

export const levelInfo = (n) => LEVELS[Math.min(10, Math.max(1, n)) - 1];

const uci = (m) => m.from + m.to + (m.promotion || '');

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Backup move picker used only if the engine could not start:
// grabs the most valuable capture, otherwise a random move.
function fallbackMove(moves, rng) {
  let best = [];
  let bestV = -1;
  for (const m of moves) {
    const v = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? 8 : 0) + (m.san.includes('#') ? 100 : 0);
    if (v > bestV) {
      bestV = v;
      best = [m];
    } else if (v === bestV) best.push(m);
  }
  return uci(best[Math.floor(rng() * best.length)]);
}

// Returns a move in UCI form like "e2e4" or "e7e8q", or null if cancelled.
export async function pickBotMove(chess, lv, engine, { timeLeft = Infinity, inc = 0, rng = Math.random } = {}) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  if (moves.length === 1) return uci(moves[0]);
  if (lv.random && rng() < lv.random) return uci(moves[Math.floor(rng() * moves.length)]);
  if (!engine) return fallbackMove(moves, rng);
  let movetime = lv.movetime;
  if (Number.isFinite(timeLeft)) {
    // Don't lose on time: use at most ~1/30 of the clock per move.
    movetime = Math.max(30, Math.min(movetime, timeLeft / 30 + inc * 0.7));
  }
  const res = await engine.search({ fen: chess.fen(), skill: lv.skill, depth: lv.depth, movetime });
  if (res === null) return null;
  if (!res.bestmove) return fallbackMove(moves, rng);
  return res.bestmove;
}
