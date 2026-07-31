// All-synth WebAudio sfx — no audio files to load.

let ctx = null;
let muted = localStorage.getItem('pp-muted') === '1';

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('pp-muted', muted ? '1' : '0');
  return muted;
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function now() { return ctx.currentTime; }
function ok() { return ctx && !muted && ctx.state === 'running'; }

function tone({ type = 'sine', f0 = 440, f1 = f0, t = 0.15, vol = 0.2, delay = 0, curve = 'exp' }) {
  if (!ok()) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const s = now() + delay;
  o.type = type;
  o.frequency.setValueAtTime(f0, s);
  if (f1 !== f0) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), s + t);
    else o.frequency.linearRampToValueAtTime(f1, s + t);
  }
  g.gain.setValueAtTime(vol, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + t);
  o.connect(g).connect(ctx.destination);
  o.start(s);
  o.stop(s + t + 0.02);
}

function noise({ t = 0.2, vol = 0.2, delay = 0, freq = 1000, q = 1, type = 'lowpass', sweepTo = 0 }) {
  if (!ok()) return;
  const s = now() + delay;
  const len = Math.ceil(ctx.sampleRate * t);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(freq, s);
  if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, s + t);
  flt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + t);
  src.connect(flt).connect(g).connect(ctx.destination);
  src.start(s);
}

export const sfx = {
  click() { tone({ type: 'square', f0: 660, f1: 660, t: 0.05, vol: 0.06 }); },

  // a pothole erupts — wet bloop
  pop() {
    tone({ type: 'sine', f0: 160, f1: 70, t: 0.14, vol: 0.22 });
    noise({ t: 0.1, vol: 0.1, freq: 500, sweepTo: 150 });
  },
  // fresh hole cracks open into a crater
  crack() {
    noise({ t: 0.18, vol: 0.26, freq: 300, type: 'bandpass', q: 0.7, sweepTo: 90 });
    tone({ type: 'sawtooth', f0: 90, f1: 42, t: 0.2, vol: 0.14 });
  },
  // slap of hot asphalt + steam hiss
  splat(mult = 1) {
    const lift = Math.min(Math.max(mult, 1), 5);
    noise({ t: 0.09, vol: 0.32, freq: 900, sweepTo: 200 });
    tone({ type: 'sine', f0: 105 + lift * 15, f1: 48 + lift * 7, t: 0.12, vol: 0.26 });
    noise({ t: 0.4, vol: 0.1, delay: 0.06, freq: 5200, type: 'highpass' });
    if (mult > 1) { // combo sparkle rises with the multiplier
      const notes = [523, 659, 784, 1046, 1318];
      tone({ type: 'triangle', f0: notes[Math.min(mult - 2, 4)], t: 0.16, vol: 0.12, delay: 0.05 });
    }
  },
  // partial tap on a crater
  tamp() {
    noise({ t: 0.07, vol: 0.22, freq: 700, sweepTo: 180 });
    tone({ type: 'sine', f0: 100, f1: 60, t: 0.09, vol: 0.18 });
  },
  whiff() {
    tone({ type: 'sine', f0: 72, f1: 48, t: 0.09, vol: 0.09 });
    noise({ t: 0.06, vol: 0.045, freq: 240, type: 'lowpass' });
  },

  // a short horn and road rumble when an open hole enters the car's path
  carWarning() {
    tone({ type: 'triangle', f0: 330, f1: 300, t: 0.13, vol: 0.11 });
    tone({ type: 'triangle', f0: 392, f1: 350, t: 0.12, vol: 0.09, delay: 0.14 });
    noise({ t: 0.32, vol: 0.055, freq: 110, type: 'lowpass' });
  },

  // the Outback slams a hole
  thunk() {
    tone({ type: 'sine', f0: 70, f1: 34, t: 0.25, vol: 0.5 });
    noise({ t: 0.12, vol: 0.3, freq: 350, sweepTo: 90 });
  },
  // hubcap wobbling away on the pavement
  hubcap() {
    for (let i = 0; i < 7; i++) {
      tone({ type: 'triangle', f0: 1250 - i * 60, f1: 1100 - i * 60, t: 0.06, vol: 0.12 * (1 - i / 8), delay: 0.12 + i * (0.09 + i * 0.012) });
    }
  },
  syrup() {
    tone({ type: 'sine', f0: 290, f1: 420, t: 0.09, vol: 0.16 });
    tone({ type: 'sine', f0: 420, f1: 640, t: 0.12, vol: 0.16, delay: 0.08 });
    tone({ type: 'triangle', f0: 880, t: 0.2, vol: 0.1, delay: 0.17 });
  },
  plow() {
    noise({ t: 1.5, vol: 0.22, freq: 160, sweepTo: 500, q: 0.5 });
    noise({ t: 1.5, vol: 0.1, freq: 2400, type: 'highpass' });
    tone({ type: 'sawtooth', f0: 46, f1: 66, t: 1.5, vol: 0.1, curve: 'lin' });
  },
  wave() {
    tone({ type: 'triangle', f0: 392, t: 0.12, vol: 0.14 });
    tone({ type: 'triangle', f0: 523, t: 0.12, vol: 0.14, delay: 0.11 });
    tone({ type: 'triangle', f0: 659, t: 0.22, vol: 0.14, delay: 0.22 });
  },
  gameover() {
    tone({ type: 'sawtooth', f0: 220, f1: 110, t: 0.55, vol: 0.16 });
    tone({ type: 'sawtooth', f0: 165, f1: 82, t: 0.7, vol: 0.14, delay: 0.18 });
    tone({ type: 'sine', f0: 55, f1: 40, t: 0.9, vol: 0.2, delay: 0.3 });
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => {
      tone({ type: 'triangle', f0: f, t: i === 3 ? 0.42 : 0.18, vol: 0.13, delay: i * 0.11 });
    });
    noise({ t: 0.32, vol: 0.055, delay: 0.3, freq: 4200, type: 'highpass' });
  },
};
