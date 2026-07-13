// 効果音（Web Audioで合成・音声ファイル不要）。
// ブラウザは最初のユーザー操作までは音を鳴らせないので、
// initAudio() を「はじめる」や最初のタップで呼んでAudioContextを起こす。

let ctx = null;
let enabled = true;

export function setSoundEnabled(v) { enabled = !!v; }
export function isSoundEnabled() { return enabled; }

export function initAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function blip({ freq = 440, dur = 0.08, type = "triangle", gain = 0.14, when = 0 }) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

// マスに句読点を打つ音（コツッ）
export function playTap() { blip({ freq: 560, dur: 0.05, type: "square", gain: 0.06 }); }

// パーフェクト（ポーンと二段）
export function playPerfect() {
  blip({ freq: 784, dur: 0.12, gain: 0.13 });
  blip({ freq: 1175, dur: 0.18, gain: 0.11, when: 0.1 });
}

// ミスあり（やわらかい低音）
export function playMiss() { blip({ freq: 233, dur: 0.18, type: "sine", gain: 0.1 }); }

// コンボ（連続数だけ上昇する音階）
export function playCombo(streak) {
  const base = 523;
  const n = Math.min(streak, 6);
  for (let i = 0; i < n; i++) {
    blip({ freq: base * Math.pow(1.122, i), dur: 0.07, gain: 0.09, when: 0.05 + i * 0.06 });
  }
}
