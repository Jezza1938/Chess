// Talks to the Stockfish engine using the UCI text protocol.
// The same class runs in the browser (Web Worker) and in Node (tests).

export class UciEngine {
  constructor(transport) {
    this.t = transport;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.generation = 0; // bumped by cancelAll() so queued searches are skipped
    this.searching = false;
    transport.onLine((line) => {
      for (const fn of [...this.listeners]) fn(line);
    });
  }

  send(cmd) {
    this.t.send(cmd);
  }

  waitFor(pred, timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const fn = (line) => {
        if (!pred(line)) return;
        this.listeners.delete(fn);
        if (timer) clearTimeout(timer);
        resolve(line);
      };
      this.listeners.add(fn);
      if (timeoutMs) {
        timer = setTimeout(() => {
          this.listeners.delete(fn);
          reject(new Error('engine did not answer'));
        }, timeoutMs);
      }
    });
  }

  async init() {
    const ok = this.waitFor((l) => l === 'uciok', 30000);
    this.send('uci');
    await ok;
    this.send('setoption name Hash value 16');
    await this.isReady();
  }

  async isReady() {
    const ok = this.waitFor((l) => l === 'readyok', 30000);
    this.send('isready');
    await ok;
  }

  enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  newGame() {
    return this.enqueue(async () => {
      this.send('ucinewgame');
      await this.isReady();
    });
  }

  // Resolves to { bestmove, score } or null if it was cancelled.
  search({ fen, skill = 20, depth, movetime }) {
    const gen = this.generation;
    return this.enqueue(async () => {
      if (gen !== this.generation) return null;
      this.send(`setoption name Skill Level value ${skill}`);
      this.send(`position fen ${fen}`);
      let go = 'go';
      if (depth) go += ` depth ${depth}`;
      if (movetime) go += ` movetime ${Math.round(movetime)}`;
      if (!depth && !movetime) go += ' movetime 1000';
      let score = null;
      const onInfo = (l) => {
        if (!l.startsWith('info') || !/ score /.test(l)) return;
        if (/ multipv (\d+)/.test(l) && !/ multipv 1 /.test(l + ' ')) return;
        const m = l.match(/ score (cp|mate) (-?\d+)/);
        if (m) score = { type: m[1], value: Number(m[2]) };
      };
      this.listeners.add(onInfo);
      const done = this.waitFor((l) => l.startsWith('bestmove'), (movetime || 10000) * 3 + 30000);
      this.searching = true;
      this.send(go);
      try {
        const line = await done;
        const best = line.split(/\s+/)[1];
        if (gen !== this.generation) return null;
        return { bestmove: best && best !== '(none)' ? best : null, score };
      } finally {
        this.searching = false;
        this.listeners.delete(onInfo);
      }
    });
  }

  // Cancel the current search and anything waiting in the queue.
  cancelAll() {
    this.generation++;
    if (this.searching) this.send('stop');
  }
}

const ENGINE_BASE = 'vendor/stockfish/stockfish-19-lite-single';

function workerEngine(url) {
  const worker = new Worker(url);
  let cb = () => {};
  worker.onmessage = (e) => {
    if (typeof e.data === 'string') for (const l of e.data.split('\n')) if (l) cb(l.trim());
  };
  const eng = new UciEngine({ send: (l) => worker.postMessage(l), onLine: (f) => (cb = f) });
  eng.worker = worker;
  return eng;
}

// Starts Stockfish in a background thread so the board never freezes.
// The .wasm file is fetched here (from the offline cache) and handed to the
// worker as a blob URL, so it loads even with no internet.
export async function startBrowserEngine() {
  let wasmUrl = '';
  try {
    const r = await fetch(`${ENGINE_BASE}.wasm`);
    if (r.ok) {
      const buf = await r.arrayBuffer();
      wasmUrl = URL.createObjectURL(new Blob([buf], { type: 'application/wasm' }));
    }
  } catch (e) {
    console.warn('wasm prefetch failed', e);
  }
  const attempts = [];
  if (wasmUrl) attempts.push(`${ENGINE_BASE}.js#${encodeURIComponent(wasmUrl)}`);
  attempts.push(`${ENGINE_BASE}.js`);
  let lastErr;
  for (const url of attempts) {
    const eng = workerEngine(url);
    try {
      await Promise.race([
        eng.init(),
        new Promise((_, rej) => {
          eng.worker.onerror = (e) => rej(new Error(e.message || 'worker error'));
          setTimeout(() => rej(new Error('engine start timed out')), 20000);
        }),
      ]);
      return eng;
    } catch (e) {
      lastErr = e;
      eng.worker.terminate();
    }
  }
  throw lastErr;
}
