import type { Arc, FloatText, HitQuality, Particle, RunStats } from './types.ts'

let nextId = 1
const id = () => nextId++

function norm(angle: number): number {
  const t = angle % (Math.PI * 2)
  return t < 0 ? t + Math.PI * 2 : t
}

function angleInArc(angle: number, arc: Arc): boolean {
  const a = norm(angle)
  const s = norm(arc.start)
  const e = norm(arc.end)
  if (s <= e) return a >= s && a <= e
  return a >= s || a <= e
}

function arcMid(arc: Arc): number {
  const s = norm(arc.start)
  const e = norm(arc.end)
  if (s <= e) return (s + e) / 2
  return norm((s + e + Math.PI * 2) / 2)
}

function arcWidth(arc: Arc): number {
  const s = norm(arc.start)
  const e = norm(arc.end)
  return s <= e ? e - s : Math.PI * 2 - s + e
}

export interface EngineConfig {
  dailyMultiplier: number
}

export class GameEngine {
  needle = -Math.PI / 2
  speed = 1.25
  energy = 5
  combo = 0
  maxCombo = 0
  score = 0
  level = 1
  captures = 0
  perfects = 0
  goods = 0
  misses = 0
  multiplier = 1
  arcs: Arc[] = []
  floats: FloatText[] = []
  particles: Particle[] = []
  shake = 0
  flash = 0
  alive = true
  startedAt = performance.now()
  lastSpawn = 0
  spawnCooldown = 1000
  hitPulse = 0
  private dailyMultiplier: number

  constructor(config: EngineConfig) {
    this.dailyMultiplier = config.dailyMultiplier
    this.spawnArc(performance.now(), true)
    this.spawnArc(performance.now() + 280, false)
  }

  stats(): RunStats {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfects: this.perfects,
      goods: this.goods,
      misses: this.misses,
      captures: this.captures,
      level: this.level,
      durationMs: performance.now() - this.startedAt,
    }
  }

  update(dt: number, now: number): void {
    if (!this.alive) return

    this.needle = norm(this.needle + this.speed * dt)
    this.shake = Math.max(0, this.shake - dt * 8)
    this.flash = Math.max(0, this.flash - dt * 4)
    this.hitPulse = Math.max(0, this.hitPulse - dt * 3)

    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.98
      p.vy *= 0.98
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    this.floats = this.floats.filter((f) => now - f.born < f.life)

    // Expire missed arcs behind the needle
    const remaining: Arc[] = []
    for (const arc of this.arcs) {
      const age = now - arc.born
      const passed = !angleInArc(this.needle, arc) && age > 700 && this.isPastArc(arc)
      if (passed) {
        this.registerMiss(now, 'late')
      } else {
        remaining.push(arc)
      }
    }
    this.arcs = remaining

    if (now - this.lastSpawn > this.spawnCooldown && this.arcs.length < 3) {
      this.spawnArc(now, false)
    }

    const targetLevel = 1 + Math.floor(this.captures / 8)
    if (targetLevel > this.level) {
      this.level = targetLevel
      this.speed = Math.min(3.1, 1.25 + (this.level - 1) * 0.12)
      this.spawnCooldown = Math.max(560, 1000 - (this.level - 1) * 30)
      this.pushFloat('LEVEL UP', 0, -36, '#F0B429', now)
    }
  }

  private isPastArc(arc: Arc): boolean {
    // Needle has moved past the arc's end by a small margin
    const end = norm(arc.end)
    const delta = norm(this.needle - end)
    return delta > 0.12 && delta < Math.PI
  }

  private spawnArc(now: number, first: boolean): void {
    const ahead = first ? 1.25 : 0.95 + Math.random() * 1.5
    const width = Math.max(0.42, 0.82 - this.level * 0.02 + (Math.random() * 0.14 - 0.04))
    const start = norm(this.needle + ahead)
    const kind = Math.random() < 0.14 + Math.min(0.08, this.level * 0.01) ? 'gold' : 'normal'
    this.arcs.push({
      id: id(),
      start,
      end: norm(start + width),
      kind,
      born: now,
    })
    this.lastSpawn = now
  }

  /** Small forgiveness so near-miss taps still count as good hits. */
  private nearestArc(slop = 0.14): Arc | null {
    let best: Arc | null = null
    let bestDist = Infinity
    for (const arc of this.arcs) {
      if (angleInArc(this.needle, arc)) return arc
      const mid = arcMid(arc)
      const dist = Math.abs(norm(this.needle - mid + Math.PI) - Math.PI)
      const half = arcWidth(arc) / 2 + slop
      if (dist <= half && dist < bestDist) {
        best = arc
        bestDist = dist
      }
    }
    return best
  }

  attemptHit(now: number, cx: number, cy: number, radius: number): HitQuality {
    if (!this.alive) return 'miss'

    const best = this.nearestArc()
    if (!best) {
      // Ignore taps when no arc is in range — keeps early play low-friction.
      return 'miss'
    }

    const mid = arcMid(best)
    const width = arcWidth(best)
    const dist = Math.abs(norm(this.needle - mid + Math.PI) - Math.PI)
    const perfectZone = width * 0.34
    const quality: HitQuality = dist <= perfectZone ? 'perfect' : 'good'

    this.arcs = this.arcs.filter((a) => a.id !== best.id)
    this.resolveHit(best, quality, now, cx, cy, radius)
    return quality
  }

  private resolveHit(
    arc: Arc,
    quality: HitQuality,
    now: number,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    this.captures += 1
    if (quality === 'perfect') {
      this.perfects += 1
      this.combo += 1
    } else {
      this.goods += 1
      this.combo += 1
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.multiplier = 1 + Math.min(4, Math.floor(this.combo / 5) * 0.5)

    const base = quality === 'perfect' ? 120 : 70
    const gold = arc.kind === 'gold' ? 3 : 1
    const points = Math.round(base * this.combo * this.multiplier * gold * this.dailyMultiplier)
    this.score += points

    if (arc.kind === 'gold') {
      this.energy = Math.min(5, this.energy + 1)
      this.pushFloat('+ENERGY', 0, -58, '#F0B429', now)
    }

    const ang = arcMid(arc)
    const x = cx + Math.cos(ang) * radius
    const y = cy + Math.sin(ang) * radius
    const label = quality === 'perfect' ? `PERFECT +${points}` : `GOOD +${points}`
    const color = quality === 'perfect' ? '#F0B429' : '#3EE0C5'
    this.pushFloat(label, x - cx, y - cy - 18, color, now)
    this.burst(x, y, arc.kind === 'gold' ? '#F0B429' : color)
    this.hitPulse = 1
    this.flash = quality === 'perfect' ? 0.55 : 0.28
  }

  private registerMiss(now: number, _reason: 'late' | 'whiff'): void {
    this.misses += 1
    this.combo = 0
    this.multiplier = 1
    this.energy -= 1
    this.shake = 0.7
    this.flash = 0.35
    this.pushFloat('MISS', 0, -20, '#FF6B6B', now)
    if (this.energy <= 0) {
      this.energy = 0
      this.alive = false
    }
  }

  private pushFloat(text: string, x: number, y: number, color: string, now: number): void {
    this.floats.push({ id: id(), text, x, y, color, born: now, life: 900 })
  }

  private burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 40 + Math.random() * 120
      this.particles.push({
        id: id(),
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color,
        size: 2 + Math.random() * 3,
      })
    }
  }
}
