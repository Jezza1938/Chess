// Saves settings and the game in progress on the device.
// Wrapped in try/catch so a storage problem never breaks the app.

const SETTINGS_KEY = 'chess.settings.v1';
const GAME_KEY = 'chess.game.v1';

export const DEFAULT_SETTINGS = {
  board: 'brown',
  pieces: 'cburnett',
  sound: true,
  showDests: true,
  coords: true,
  bot: {
    level: 3,
    color: 'white',
    time: { preset: '10+0', minutes: 10, inc: 0 },
    botClock: true,
  },
  pvp: {
    time: { preset: '10+0', minutes: 10, inc: 0 },
    split: false,
    white: { minutes: 10, inc: 0 },
    black: { minutes: 10, inc: 0 },
    faceToFace: false,
  },
};

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return JSON.parse(JSON.stringify(base));
  const out = Array.isArray(base) ? [] : {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const e = extra[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, e);
    else out[k] = e === undefined || typeof e !== typeof b ? b : e;
  }
  return out;
}

export function loadSettings() {
  try {
    return merge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadGame() {
  try {
    return JSON.parse(localStorage.getItem(GAME_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveGame(g) {
  try {
    if (g) localStorage.setItem(GAME_KEY, JSON.stringify(g));
    else localStorage.removeItem(GAME_KEY);
  } catch {
    /* ignore */
  }
}
