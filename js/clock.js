// Chess clock. Times are in milliseconds. A side with `null` time has no clock.

export const other = (c) => (c === 'white' ? 'black' : 'white');

export class Clock {
  constructor({ white, black, incWhite = 0, incBlack = 0, onFlag = () => {}, onTick = () => {}, now } = {}) {
    this.initial = { white: white ?? null, black: black ?? null };
    this.inc = { white: incWhite, black: incBlack };
    this.left = { white: white ?? null, black: black ?? null };
    this.running = null; // colour whose time is ticking
    this.since = 0; // when the current run began
    this.started = false; // becomes true after White's first move
    this.paused = null; // colour that was running when paused
    this.flagged = null;
    this.onFlag = onFlag;
    this.onTick = onTick;
    this.now = now || (() => performance.now());
    this.timer = null;
  }

  hasTime(color) {
    return this.initial[color] != null;
  }

  get enabled() {
    return this.hasTime('white') || this.hasTime('black');
  }

  timeLeft(color) {
    if (!this.hasTime(color)) return Infinity;
    let t = this.left[color];
    if (this.running === color) t -= this.now() - this.since;
    return Math.max(0, t);
  }

  commit() {
    const c = this.running;
    if (c && this.hasTime(c)) this.left[c] = this.timeLeft(c);
    this.since = this.now();
  }

  run(color) {
    this.commit();
    this.running = color;
    this.paused = null;
    this.since = this.now();
    this.started = true;
    this.startTimer();
    this.onTick();
  }

  stop() {
    this.commit();
    this.running = null;
    this.stopTimer();
    this.onTick();
  }

  // `color` has finished their turn: they get their increment and the
  // opponent's time starts. The very first press just starts the clock.
  press(color) {
    if (this.flagged) return;
    if (this.started) {
      this.commit();
      if (this.hasTime(color)) this.left[color] += this.inc[color];
    }
    this.run(other(color));
  }

  pause() {
    if (!this.running) return;
    const c = this.running;
    this.stop();
    this.paused = c;
  }

  resume() {
    if (this.paused && !this.flagged) this.run(this.paused);
  }

  // Put the clock back to "not started yet" (used when every move is undone).
  unstart() {
    this.stop();
    this.started = false;
    this.paused = null;
  }

  check() {
    const c = this.running;
    if (c && this.hasTime(c) && this.timeLeft(c) <= 0) {
      this.commit();
      this.left[c] = 0;
      this.running = null;
      this.flagged = c;
      this.stopTimer();
      this.onTick();
      this.onFlag(c);
      return true;
    }
    return false;
  }

  startTimer() {
    if (this.timer || typeof setInterval === 'undefined') return;
    this.timer = setInterval(() => {
      if (!this.check()) this.onTick();
    }, 100);
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy() {
    this.stopTimer();
    this.onTick = () => {};
    this.onFlag = () => {};
  }

  toJSON() {
    this.commit();
    return {
      initial: this.initial,
      inc: this.inc,
      left: { ...this.left },
      started: this.started,
      // A saved game always comes back paused.
      paused: this.running || this.paused,
      flagged: this.flagged,
    };
  }

  static fromJSON(j, handlers = {}) {
    const c = new Clock({
      white: j.initial.white,
      black: j.initial.black,
      incWhite: j.inc.white,
      incBlack: j.inc.black,
      ...handlers,
    });
    c.left = { ...j.left };
    c.started = !!j.started;
    c.paused = j.paused || null;
    c.flagged = j.flagged || null;
    return c;
  }
}

export function formatTime(ms) {
  if (ms === Infinity || ms == null) return '∞';
  if (ms < 10000) {
    // Under 10 seconds: show tenths, rounding down so 0.0 means flag.
    const tenths = Math.floor(ms / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
