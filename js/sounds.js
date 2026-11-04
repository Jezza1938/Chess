// Sound effects with the Web Audio API. iPad only allows audio after the
// first touch, so unlock() is called from the first tap.

const FILES = {
  move: 'Move',
  capture: 'Capture',
  end: 'GenericNotify',
  low: 'LowTime',
  start: 'Confirmation',
};

export class Sounds {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.buffers = {};
    this.loading = null;
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'running' && this.loading) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // Playing a silent sound inside the tap finishes unlocking on iOS.
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
      if (!this.loading) this.loading = this.load();
    } catch (e) {
      console.warn('audio unlock failed', e);
    }
  }

  async load() {
    await Promise.all(
      Object.entries(FILES).map(async ([key, name]) => {
        try {
          const r = await fetch(`assets/sounds/${name}.mp3`);
          const data = await r.arrayBuffer();
          this.buffers[key] = await new Promise((res, rej) => this.ctx.decodeAudioData(data, res, rej));
        } catch (e) {
          console.warn('sound load failed', name, e);
        }
      }),
    );
  }

  play(key, volume = 1) {
    if (!this.enabled || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (key === 'click') return this.click();
      const buf = this.buffers[key];
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.ctx.destination);
      src.start(0);
    } catch (e) {
      /* never let a sound problem break the game */
    }
  }

  // Short mechanical "clack" for pressing the clock.
  click() {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(0);
  }
}
