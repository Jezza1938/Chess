// Game-ending rules and material count on top of chess.js.

export const colorName = (c) => (c === 'w' || c === 'white' ? 'white' : 'black');

// Returns null while the game is still going.
export function gameResult(chess) {
  if (chess.isCheckmate()) {
    return { winner: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: 'fifty' };
  return null;
}

function piecesOf(chess, color) {
  const c = color === 'white' ? 'w' : 'b';
  const out = [];
  chess.board().forEach((row, r) =>
    row.forEach((sq, f) => {
      if (sq && sq.color === c) out.push({ type: sq.type, dark: (r + f) % 2 === 1 });
    }),
  );
  return out;
}

// Could `color` ever checkmate, with any sequence of legal moves?
// Used for the rule: if your time runs out but your opponent cannot possibly
// checkmate you, the game is a draw rather than a loss.
export function canEverMate(chess, color) {
  const mine = piecesOf(chess, color).filter((p) => p.type !== 'k');
  if (mine.length === 0) return false;
  const theirs = piecesOf(chess, color === 'white' ? 'black' : 'white').filter((p) => p.type !== 'k');
  // Only bishops left on both sides, all on squares of one colour: no mate possible.
  const all = mine.concat(theirs);
  if (all.every((p) => p.type === 'b') && (all.every((p) => p.dark) || all.every((p) => !p.dark))) return false;
  // A lone knight or bishop against a bare king cannot mate.
  if (theirs.length === 0 && mine.length === 1 && (mine[0].type === 'n' || mine[0].type === 'b')) return false;
  return true;
}

export function timeoutResult(chess, flagged) {
  const winner = flagged === 'white' ? 'black' : 'white';
  if (!canEverMate(chess, winner)) return { winner: null, reason: 'timeout-draw' };
  return { winner, reason: 'timeout' };
}

export const REASONS = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  insufficient: 'Not enough pieces left to checkmate',
  repetition: 'Same position three times',
  fifty: '50 moves without a capture or pawn move',
  timeout: 'Out of time',
  'timeout-draw': 'Out of time, but the other side cannot checkmate',
  resign: 'Resigned',
  agreement: 'Draw agreed',
};

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ['q', 'r', 'b', 'n', 'p'];

// Material imbalance, like lichess: for each side, the extra pieces it has
// compared with the opponent, and the points it is ahead by.
export function materialDiff(chess) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of chess.board()) for (const sq of row) if (sq && sq.type !== 'k') count[sq.color][sq.type]++;
  const res = { white: { pieces: [], score: 0 }, black: { pieces: [], score: 0 } };
  let score = 0;
  for (const t of ORDER) {
    const d = count.w[t] - count.b[t];
    score += d * VALUES[t];
    for (let i = 0; i < Math.abs(d); i++) res[d > 0 ? 'white' : 'black'].pieces.push(t);
  }
  if (score > 0) res.white.score = score;
  if (score < 0) res.black.score = -score;
  return res;
}

export const ROLE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
