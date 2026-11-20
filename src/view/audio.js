// All sound is synthesized with Web Audio (no audio files): a soft night pad with
// pentatonic plucks for music, and short effects for every event Ticket-02 lists.
export function makeAudio() {
  let ctx = null, master = null, musicGain = null, plucker = null;
  let volume = 0.7;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      startMusic();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function tone(freq, dur, { type = 'sine', gain = 0.18, slide = null, delay = 0, attack = 0.01 } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, { gain = 0.2, freq = 1200, q = 0.8, delay = 0, sweep = null } = {}) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // audio only, not game logic
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  function startMusic() {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.07;
    musicGain.connect(master);
    for (const [f, det] of [[110, -4], [164.8, 3], [220, 6]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = det;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.07 + f / 4000;
      lg.gain.value = 0.35;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(musicGain);
      o.start();
      lfo.start();
    }
    const scale = [440, 493.9, 554.4, 659.3, 740, 880];
    plucker = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const f = scale[Math.floor(Math.random() * scale.length)];
      tone(f, 1.6, { type: 'triangle', gain: 0.035, attack: 0.02 });
    }, 1700);
  }

  const sfx = {
    pick: () => { tone(1320, 0.12, { gain: 0.08 }); tone(1980, 0.1, { gain: 0.05, delay: 0.04 }); },
    deposit: () => tone(660, 0.15, { type: 'triangle', gain: 0.1 }),
    lit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.12, delay: i * 0.08 })),
    pulse: () => { noise(0.45, { gain: 0.25, freq: 600, sweep: 3000 }); tone(220, 0.4, { gain: 0.12, slide: 660 }); },
    hit: () => { tone(160, 0.35, { type: 'sawtooth', gain: 0.14, slide: 60 }); noise(0.2, { gain: 0.15, freq: 300 }); },
    jump: () => tone(380, 0.16, { type: 'square', gain: 0.05, slide: 620 }),
    dash: () => noise(0.22, { gain: 0.2, freq: 2400, sweep: 900, q: 0.6 }),
    fall: () => tone(500, 0.9, { type: 'sine', gain: 0.12, slide: 80 }),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.9, { type: 'triangle', gain: 0.12, delay: i * 0.12 })),
    lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.7, { type: 'sine', gain: 0.12, delay: i * 0.18 })),
    shade: () => { tone(90, 0.7, { type: 'sawtooth', gain: 0.07, slide: 70 }); noise(0.6, { gain: 0.05, freq: 200 }); },
    countdown: () => tone(880, 0.09, { type: 'square', gain: 0.06 }),
    charm: () => [988, 1319, 1760].forEach((f, i) => tone(f, 0.3, { gain: 0.07, delay: i * 0.05 })),
    steal: () => tone(700, 0.4, { type: 'triangle', gain: 0.1, slide: 300 }),
    wind: () => noise(1.8, { gain: 0.12, freq: 500, sweep: 1500, q: 0.4 }),
    ui: () => tone(740, 0.06, { type: 'triangle', gain: 0.05 }),
    arrow: () => { tone(220, 0.12, { type: 'triangle', gain: 0.12, slide: 140 }); noise(0.25, { gain: 0.12, freq: 3000, sweep: 6000, q: 1.5, delay: 0.02 }); },
  };

  return {
    sfx,
    unlock: ensure,
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
  };
}
