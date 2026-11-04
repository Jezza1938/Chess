// Runs the real Stockfish build in Node, using the same UciEngine class as the app.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { UciEngine } from '../js/engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SF = path.join(here, '..', 'vendor', 'stockfish', 'stockfish-19-lite-single.js');

export async function startNodeEngine() {
  const proc = spawn(process.execPath, [SF], { stdio: ['pipe', 'pipe', 'inherit'] });
  let cb = () => {};
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) cb(line);
    }
  });
  const eng = new UciEngine({ send: (l) => proc.stdin.write(l + '\n'), onLine: (f) => (cb = f) });
  eng.quit = () => { try { proc.stdin.write('quit\n'); } catch {} setTimeout(() => proc.kill(), 200); };
  await eng.init();
  return eng;
}
