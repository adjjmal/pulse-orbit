export type Screen = 'home' | 'play' | 'result'

export type HitQuality = 'perfect' | 'good' | 'miss'

export type ArcKind = 'normal' | 'gold' | 'shrink' | 'drift' | 'reverse' | 'hazard' | 'double'

export interface Arc {
  id: number
  start: number
  width: number
  baseWidth: number
  kind: ArcKind
  born: number
  hp: number
  drift: number
  entered: boolean
}

export interface FloatText {
  id: number
  text: string
  x: number
  y: number
  color: string
  born: number
  life: number
  size: number
}

export interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export type PerkId = 'wide' | 'focus' | 'shield' | 'heart' | 'midas' | 'anchor' | 'slow' | 'surge' | 'greed'

export interface Perk {
  id: PerkId
  name: string
  desc: string
  max: number
  color: string
}

export const PERKS: Perk[] = [
  { id: 'wide', name: 'Wide Arcs', desc: 'Arcs are 12% wider', max: 3, color: '#3EE0C5' },
  { id: 'focus', name: 'Focus', desc: 'Perfect zone +25%', max: 2, color: '#FFFFFF' },
  { id: 'shield', name: 'Shield', desc: 'Block the next life loss', max: 9, color: '#6AD4FF' },
  { id: 'heart', name: 'Second Wind', desc: '+1 life now', max: 9, color: '#FF6B6B' },
  { id: 'midas', name: 'Midas', desc: 'Golden arcs +6% more often', max: 3, color: '#F0B429' },
  { id: 'anchor', name: 'Anchor', desc: 'Breaking a combo keeps half of it', max: 1, color: '#B48CFF' },
  { id: 'slow', name: 'Time Dilation', desc: 'Needle 8% slower', max: 2, color: '#8AA0A8' },
  { id: 'surge', name: 'Surge', desc: 'Fever charges 30% faster', max: 2, color: '#FF7A3D' },
  { id: 'greed', name: 'Greed', desc: '+20% score on every hit', max: 3, color: '#C8F542' },
]

export type EngineEvent =
  | { type: 'levelup'; level: number }
  | { type: 'unlock'; kind: ArcKind }
  | { type: 'fever' }
  | { type: 'hit'; quality: HitQuality; combo: number; kind: ArcKind }
  | { type: 'miss' }
  | { type: 'whiff' }
  | { type: 'dodge' }
  | { type: 'shield' }
  | { type: 'reverse' }
  | { type: 'gameover' }

export interface RunStats {
  score: number
  combo: number
  maxCombo: number
  perfects: number
  goods: number
  misses: number
  captures: number
  golds: number
  dodges: number
  fevers: number
  level: number
  perks: PerkId[]
  durationMs: number
}

export interface LeaderboardEntry {
  score: number
  level: number
  maxCombo: number
  at: string
}

export type MissionType = 'score' | 'level' | 'perfects' | 'combo' | 'golds' | 'dodges' | 'captures' | 'fevers'

export interface Mission {
  id: string
  type: MissionType
  target: number
  progress: number
  done: boolean
  reward: number
}

export interface MissionBoard {
  day: string
  list: Mission[]
  chestClaimed: boolean
}

export interface PersistState {
  bestScore: number
  totalCaptures: number
  unlockedSkins: string[]
  activeSkin: string
  streak: number
  lastPlayDay: string | null
  energy: number
  energyUpdatedAt: number
  leaderboard: LeaderboardEntry[]
  gamesPlayed: number
  xp: number
  missions: MissionBoard | null
}

export interface Skin {
  id: string
  name: string
  unlockAt: number
  ring: string
  accent: string
  glow: string
}

export const SKINS: Skin[] = [
  { id: 'tide', name: 'Tide', unlockAt: 0, ring: '#1F3A45', accent: '#3EE0C5', glow: '#3EE0C5' },
  { id: 'ember', name: 'Ember', unlockAt: 40, ring: '#3A2418', accent: '#FF7A3D', glow: '#FFB086' },
  { id: 'volt', name: 'Volt', unlockAt: 120, ring: '#243018', accent: '#C8F542', glow: '#E7FF8A' },
  { id: 'aurora', name: 'Aurora', unlockAt: 250, ring: '#18283A', accent: '#6AD4FF', glow: '#B8ECFF' },
  { id: 'eclipse', name: 'Eclipse', unlockAt: 500, ring: '#2A1838', accent: '#B48CFF', glow: '#E0CCFF' },
]

export const ARC_INFO: Record<ArcKind, { unlockLevel: number; color: string; name: string; tip: string }> = {
  normal: { unlockLevel: 1, color: '', name: 'Arc', tip: 'Tap when the needle is inside' },
  gold: { unlockLevel: 2, color: '#F0B429', name: 'Golden arcs', tip: '3× points, +1 life, big fever boost' },
  shrink: { unlockLevel: 3, color: '#FF7A3D', name: 'Shrinking arcs', tip: 'They shrink fast — hit them early for 1.5×' },
  drift: { unlockLevel: 4, color: '#6AD4FF', name: 'Drifting arcs', tip: 'They slide along the ring' },
  reverse: { unlockLevel: 5, color: '#B48CFF', name: 'Reverse arcs', tip: 'Hitting one flips the needle direction' },
  hazard: { unlockLevel: 6, color: '#FF4D5E', name: 'Hazard arcs', tip: "DON'T tap red — let them pass for a dodge bonus" },
  double: { unlockLevel: 7, color: '#F7F3E8', name: 'Double arcs', tip: 'Tap twice before the needle leaves' },
}

export const RANK_TITLES = ['Drifter', 'Spark', 'Pulse', 'Orbiter', 'Comet', 'Nova', 'Pulsar', 'Quasar', 'Singularity']

export const RANK_PERKS: { rank: number; text: string }[] = [
  { rank: 3, text: 'Start every run with a Shield' },
  { rank: 5, text: 'Pick a perk before the first arc' },
  { rank: 8, text: 'Start with 4 lives' },
]

export const ENERGY_MAX = 5
export const ENERGY_REFILL_MS = 90_000
export const LEADERBOARD_SIZE = 5
export const LIVES_START = 3
export const LIVES_MAX = 5
