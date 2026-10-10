import {
  ARC_INFO,
  LIVES_MAX,
  LIVES_START,
  PERKS,
  type Arc,
  type ArcKind,
  type EngineEvent,
  type FloatText,
  type HitQuality,
  type Particle,
  type Perk,
  type PerkId,
  type RunStats,
} from './types.ts'

const TAU = Math.PI * 2
const CAPTURES_PER_LEVEL = 6
const FEVER_MS = 6000
const SHRINK_MS = 2600
const WHIFF_SLOP = 0.1

let nextId = 1
const id = () => nextId++

export function norm(angle: number): number {
  const t = angle % TAU
  return t < 0 ? t + TAU : t
}

export function angleInArc(angle: number, arc: Arc): boolean {
  return norm(angle - arc.start) <= arc.width
}

function arcMid(arc: Arc): number {
  return norm(arc.start + arc.width / 2)
}

function angleDist(a: number, b: number): number {
  return Math.abs(norm(a - b + Math.PI) - Math.PI)
}

export interface EngineConfig {
  dailyMultiplier: number
  startShield: boolean
  startPerkPick: boolean
  startLives: number
}

export class GameEngine {
  time = 0
  needle = -Math.PI / 2
  dir = 1
  baseSpeed = 1.25
  lives = LIVES_START
  shields = 0
  combo = 0
  maxCombo = 0
  score = 0
  level = 1
  captures = 0
  perfects = 0
  goods = 0
  misses = 0
  golds = 0
  dodges = 0
  fevers = 0
  fever = 0
  feverUntil = 0
  arcs: Arc[] = []
  floats: FloatText[] = []
  particles: Particle[] = []
  events: EngineEvent[] = []
  perks: Partial<Record<PerkId, number>> = {}
  perkChoices: Perk[] | null = null
  shake = 0
  flash = 0
  hitPulse = 0
  alive = true
  lastSpawn = 0
  private dailyMultiplier: number
  private seenKinds = new Set<ArcKind>(['normal'])

  constructor(config: EngineConfig) {
    this.dailyMultiplier = config.dailyMultiplier
    this.lives = config.startLives
    if (config.startShield) this.shields = 1
    this.spawnArc(true)
    if (config.startPerkPick) this.offerPerks()
  }

  get paused(): boolean {
    return this.perkChoices !== null
  }

  get inFever(): boolean {
    return this.time < this.feverUntil
  }

  get feverLeft(): number {
    return Math.max(0, (this.feverUntil - this.time) / FEVER_MS)
  }

  get speed(): number {
    const slow = 1 - 0.08 * this.stack('slow')
    return Math.min(3.2, this.baseSpeed + (this.level - 1) * 0.1) * slow
  }

  get comboMult(): number {
    return 1 + Math.min(4, Math.floor(this.combo / 5) * 0.5)
  }

  get perfectFactor(): number {
    return 0.22 * (1 + 0.25 * this.stack('focus'))
  }

  stack(perk: PerkId): number {
    return this.perks[perk] ?? 0
  }

  stats(): RunStats {
    const perks: PerkId[] = []
    for (const [k, v] of Object.entries(this.perks)) for (let i = 0; i < (v ?? 0); i++) perks.push(k as PerkId)
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfects: this.perfects,
      goods: this.goods,
      misses: this.misses,
      captures: this.captures,
      golds: this.golds,
      dodges: this.dodges,
      fevers: this.fevers,
      level: this.level,
      perks,
      durationMs: this.time,
    }
  }

  drainEvents(): EngineEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  update(dt: number): void {
    if (!this.alive) return

    // Visual effects keep decaying even while a perk choice is open.
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

    if (this.paused) return

    this.time += dt * 1000
    this.needle = norm(this.needle + this.speed * this.dir * dt)
    this.floats = this.floats.filter((f) => this.time - f.born < f.life)

    const remaining: Arc[] = []
    for (const arc of this.arcs) {
      if (arc.kind === 'drift') arc.start = norm(arc.start + arc.drift * dt)
      if (arc.kind === 'shrink') {
        const t = Math.min(1, (this.time - arc.born) / SHRINK_MS)
        const newWidth = arc.baseWidth * (1 - 0.65 * t)
        arc.start = norm(arc.start + (arc.width - newWidth) / 2)
        arc.width = newWidth
      }

      const inside = angleInArc(this.needle, arc)
      if (inside) {
        arc.entered = true
        remaining.push(arc)
      } else if (arc.entered) {
        if (arc.kind === 'hazard') this.registerDodge()
        else this.registerMiss('MISS')
      } else {
        remaining.push(arc)
      }
    }
    this.arcs = remaining
    if (!this.alive) return

    const maxArcs = Math.min(4, 2 + Math.floor(this.level / 3))
    const cooldown = Math.max(450, 950 - (this.level - 1) * 40)
    if (this.time - this.lastSpawn > cooldown && this.realArcs() < maxArcs) this.spawnArc(false)
  }

  private realArcs(): number {
    return this.arcs.filter((a) => a.kind !== 'hazard').length
  }

  private pickKind(): ArcKind {
    const fresh = (Object.keys(ARC_INFO) as ArcKind[]).find(
      (k) => ARC_INFO[k].unlockLevel <= this.level && !this.seenKinds.has(k),
    )
    if (fresh) return fresh

    const pool: [ArcKind, number][] = []
    const goldChance = 0.1 + this.stack('midas') * 0.06 + Math.min(0.05, this.level * 0.005)
    for (const [kind, info] of Object.entries(ARC_INFO) as [ArcKind, (typeof ARC_INFO)[ArcKind]][]) {
      if (info.unlockLevel > this.level) continue
      const weight =
        kind === 'normal'
          ? Math.max(0.45, 1 - (this.level - 1) * 0.07)
          : kind === 'gold'
            ? goldChance
            : kind === 'hazard'
              ? 0.22
              : 0.18 + Math.min(0.12, (this.level - info.unlockLevel) * 0.02)
      pool.push([kind, weight])
    }
    const total = pool.reduce((s, [, w]) => s + w, 0)
    let r = Math.random() * total
    for (const [kind, w] of pool) {
      r -= w
      if (r <= 0) return kind
    }
    return 'normal'
  }

  private spawnArc(first: boolean): void {
    const kind: ArcKind = first ? 'normal' : this.pickKind()
    const wide = 1 + 0.12 * this.stack('wide')
    let width = Math.max(0.38, 0.8 - this.level * 0.025 + (Math.random() * 0.14 - 0.05)) * wide
    if (kind === 'double') width *= 1.5
    if (kind === 'shrink') width *= 1.35
    if (kind === 'hazard') width = 0.35 + Math.random() * 0.25

    for (let attempt = 0; attempt < 10; attempt++) {
      const ahead = first ? 1.3 : 0.9 + Math.random() * 1.7
      // Place the arc ahead of the needle in its current travel direction.
      const lead = norm(this.needle + this.dir * ahead)
      const start = this.dir > 0 ? lead : norm(lead - width)
      const candidate: Arc = {
        id: id(),
        start,
        width,
        baseWidth: width,
        kind,
        born: this.time,
        hp: kind === 'double' ? 2 : 1,
        drift: kind === 'drift' ? (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3) : 0,
        entered: false,
      }
      if (angleInArc(this.needle, candidate)) continue
      const overlaps = this.arcs.some(
        (a) => angleDist(arcMid(a), arcMid(candidate)) < a.width / 2 + candidate.width / 2 + 0.18,
      )
      if (overlaps) continue

      this.arcs.push(candidate)
      this.lastSpawn = this.time
      if (!this.seenKinds.has(kind)) {
        this.seenKinds.add(kind)
        this.events.push({ type: 'unlock', kind })
      }
      return
    }
    this.lastSpawn = this.time
  }

  private arcUnderNeedle(): Arc | null {
    let best: Arc | null = null
    let bestDist = Infinity
    for (const arc of this.arcs) {
      if (arc.kind === 'hazard') continue
      const dist = angleDist(this.needle, arcMid(arc))
      if (dist <= arc.width / 2 + WHIFF_SLOP && dist < bestDist) {
        best = arc
        bestDist = dist
      }
    }
    return best
  }

  attemptHit(cx: number, cy: number, radius: number): HitQuality {
    if (!this.alive || this.paused) return 'miss'

    const target = this.arcUnderNeedle()
    if (!target) {
      const hazard = this.arcs.find((a) => a.kind === 'hazard' && angleInArc(this.needle, a))
      if (hazard) {
        this.arcs = this.arcs.filter((a) => a.id !== hazard.id)
        this.registerMiss('HAZARD')
      } else {
        this.registerWhiff()
      }
      return 'miss'
    }

    const dist = angleDist(this.needle, arcMid(target))
    const quality: HitQuality =
      this.inFever || dist <= target.width * this.perfectFactor ? 'perfect' : 'good'

    target.hp -= 1
    if (target.hp <= 0) this.arcs = this.arcs.filter((a) => a.id !== target.id)
    this.resolveHit(target, quality, cx, cy, radius)
    return quality
  }

  private resolveHit(arc: Arc, quality: HitQuality, cx: number, cy: number, radius: number): void {
    this.captures += 1
    this.combo += 1
    if (quality === 'perfect') this.perfects += 1
    else this.goods += 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)

    const kindMult =
      arc.kind === 'gold' ? 3 : arc.kind === 'shrink' ? 1.5 : arc.kind === 'normal' ? 1 : 1.25
    const feverMult = this.inFever ? 2 : 1
    const greed = 1 + 0.2 * this.stack('greed')
    const base = quality === 'perfect' ? 100 : 50
    const points = Math.round(
      (base + this.combo * 5) * this.comboMult * kindMult * feverMult * greed * this.dailyMultiplier,
    )
    this.score += points

    if (!this.inFever) {
      const surge = 1 + 0.3 * this.stack('surge')
      const gain = (arc.kind === 'gold' ? 0.3 : quality === 'perfect' ? 0.11 : 0.04) * surge
      this.fever = Math.min(1, this.fever + gain)
      if (this.fever >= 1) {
        this.fever = 0
        this.feverUntil = this.time + FEVER_MS
        this.fevers += 1
        this.pushFloat('FEVER ×2', 0, 0, '#F0B429', 1400, 26)
        this.events.push({ type: 'fever' })
      }
    }

    if (arc.kind === 'gold') {
      this.golds += 1
      if (this.lives < LIVES_MAX) {
        this.lives += 1
        this.pushFloat('+1 LIFE', 0, -56, '#FF6B6B')
      }
    }
    if (arc.kind === 'reverse') {
      this.dir *= -1
      this.pushFloat('REVERSE', 0, 34, ARC_INFO.reverse.color)
      this.events.push({ type: 'reverse' })
    }

    const ang = arcMid(arc)
    const x = cx + Math.cos(ang) * radius
    const y = cy + Math.sin(ang) * radius
    const color = quality === 'perfect' ? '#F0B429' : '#3EE0C5'
    const label = arc.hp > 0 ? 'AGAIN!' : `${quality === 'perfect' ? 'PERFECT' : 'GOOD'} +${points}`
    this.pushFloat(label, x - cx, y - cy - 18, color)
    this.burst(x, y, arc.kind === 'normal' ? color : ARC_INFO[arc.kind].color, quality === 'perfect' ? 22 : 12)
    this.hitPulse = 1
    this.flash = quality === 'perfect' ? 0.55 : 0.25
    this.events.push({ type: 'hit', quality, combo: this.combo, kind: arc.kind })

    if (this.captures % CAPTURES_PER_LEVEL === 0) this.levelUp()
  }

  private levelUp(): void {
    this.level += 1
    this.pushFloat(`LEVEL ${this.level}`, 0, -30, '#F0B429', 1200, 22)
    this.events.push({ type: 'levelup', level: this.level })
    this.offerPerks()
  }

  private offerPerks(): void {
    const available = PERKS.filter((p) => this.stack(p.id) < p.max && !(p.id === 'heart' && this.lives >= LIVES_MAX))
    const choices: Perk[] = []
    while (choices.length < 3 && available.length) {
      const i = Math.floor(Math.random() * available.length)
      choices.push(available.splice(i, 1)[0])
    }
    this.perkChoices = choices.length ? choices : null
  }

  choosePerk(index: number): void {
    const perk = this.perkChoices?.[index]
    if (!perk) return
    this.perks[perk.id] = this.stack(perk.id) + 1
    if (perk.id === 'shield') this.shields += 1
    if (perk.id === 'heart') this.lives = Math.min(LIVES_MAX, this.lives + 1)
    this.perkChoices = null
  }

  private breakCombo(): void {
    this.combo = this.stack('anchor') ? Math.floor(this.combo / 2) : 0
    if (!this.inFever) this.fever = Math.max(0, this.fever - 0.35)
  }

  private registerWhiff(): void {
    if (this.combo > 0) this.pushFloat('WHIFF', 0, 0, '#8AA0A8')
    this.breakCombo()
    this.shake = 0.3
    this.events.push({ type: 'whiff' })
  }

  private registerDodge(): void {
    this.dodges += 1
    const points = Math.round(40 * this.comboMult * this.dailyMultiplier)
    this.score += points
    this.pushFloat(`DODGE +${points}`, 0, 30, '#8AA0A8')
    this.events.push({ type: 'dodge' })
  }

  private registerMiss(label: string): void {
    if (this.shields > 0) {
      this.shields -= 1
      this.pushFloat('SHIELD', 0, -20, '#6AD4FF')
      this.flash = 0.2
      this.events.push({ type: 'shield' })
      return
    }
    this.misses += 1
    this.breakCombo()
    this.lives -= 1
    this.shake = 0.8
    this.flash = 0.35
    this.pushFloat(label, 0, -20, '#FF6B6B')
    this.events.push({ type: 'miss' })
    if (this.lives <= 0) {
      this.lives = 0
      this.alive = false
      this.events.push({ type: 'gameover' })
    }
  }

  private pushFloat(text: string, x: number, y: number, color: string, life = 900, size = 16): void {
    this.floats.push({ id: id(), text, x, y, color, born: this.time, life, size })
  }

  private burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU
      const s = 40 + Math.random() * 140
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

export { arcMid }
