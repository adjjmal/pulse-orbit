let ctx: AudioContext | null = null
let muted = localStorage.getItem('pulse-orbit-muted') === '1'

function ac(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number, delay = 0): void {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Pentatonic steps so rising combos always sound musical.
const SCALE = [0, 2, 4, 7, 9]
function comboFreq(combo: number): number {
  const step = Math.min(combo, 24)
  const octave = Math.floor(step / SCALE.length)
  const semi = SCALE[step % SCALE.length] + octave * 12
  return 392 * Math.pow(2, semi / 12)
}

export const sfx = {
  unlock(): void {
    ac()
  },
  hit(combo: number, perfect: boolean): void {
    const f = comboFreq(combo)
    tone(f, perfect ? 0.16 : 0.1, 'triangle', perfect ? 0.14 : 0.09)
    if (perfect) tone(f * 2, 0.12, 'sine', 0.05, undefined, 0.02)
  },
  gold(): void {
    tone(880, 0.12, 'triangle', 0.12)
    tone(1320, 0.18, 'triangle', 0.1, undefined, 0.07)
  },
  miss(): void {
    tone(220, 0.28, 'sawtooth', 0.08, 90)
  },
  whiff(): void {
    tone(160, 0.08, 'square', 0.04)
  },
  dodge(): void {
    tone(600, 0.08, 'sine', 0.05, 900)
  },
  shield(): void {
    tone(500, 0.2, 'sine', 0.09, 1000)
  },
  reverse(): void {
    tone(700, 0.18, 'triangle', 0.08, 350)
  },
  levelup(): void {
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, undefined, i * 0.08))
  },
  fever(): void {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.05, undefined, i * 0.06))
  },
  gameover(): void {
    ;[392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, undefined, i * 0.14))
  },
  isMuted(): boolean {
    return muted
  },
  toggleMute(): boolean {
    muted = !muted
    localStorage.setItem('pulse-orbit-muted', muted ? '1' : '0')
    return muted
  },
}

export function buzz(pattern: number | number[]): void {
  if (muted) return
  navigator.vibrate?.(pattern)
}
