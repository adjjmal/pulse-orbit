export type Screen = 'home' | 'play' | 'result'

export type HitQuality = 'perfect' | 'good' | 'miss'

export interface Arc {
  id: number
  start: number
  end: number
  kind: 'normal' | 'gold'
  born: number
}

export interface FloatText {
  id: number
  text: string
  x: number
  y: number
  color: string
  born: number
  life: number
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

export interface RunStats {
  score: number
  combo: number
  maxCombo: number
  perfects: number
  goods: number
  misses: number
  captures: number
  level: number
  durationMs: number
}

export interface LeaderboardEntry {
  score: number
  level: number
  maxCombo: number
  at: string
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
]

export const ENERGY_MAX = 5
export const ENERGY_REFILL_MS = 90_000
export const LEADERBOARD_SIZE = 5
