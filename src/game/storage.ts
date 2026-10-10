import {
  ENERGY_MAX,
  ENERGY_REFILL_MS,
  LEADERBOARD_SIZE,
  SKINS,
  type LeaderboardEntry,
  type PersistState,
  type RunStats,
} from './types.ts'

const KEY = 'pulse-orbit-v1'

const defaultState = (): PersistState => ({
  bestScore: 0,
  totalCaptures: 0,
  unlockedSkins: ['tide'],
  activeSkin: 'tide',
  streak: 0,
  lastPlayDay: null,
  energy: ENERGY_MAX,
  energyUpdatedAt: Date.now(),
  leaderboard: [],
  gamesPlayed: 0,
})

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = { ...defaultState(), ...(JSON.parse(raw) as Partial<PersistState>) }
    return refillEnergy(parsed)
  } catch {
    return defaultState()
  }
}

export function saveState(state: PersistState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function refillEnergy(state: PersistState): PersistState {
  const now = Date.now()
  if (state.energy >= ENERGY_MAX) {
    return { ...state, energy: ENERGY_MAX, energyUpdatedAt: now }
  }
  const elapsed = Math.max(0, now - state.energyUpdatedAt)
  const gained = Math.floor(elapsed / ENERGY_REFILL_MS)
  if (gained <= 0) return state
  const energy = Math.min(ENERGY_MAX, state.energy + gained)
  const energyUpdatedAt = energy >= ENERGY_MAX ? now : state.energyUpdatedAt + gained * ENERGY_REFILL_MS
  return { ...state, energy, energyUpdatedAt }
}

export function msToNextEnergy(state: PersistState): number {
  if (state.energy >= ENERGY_MAX) return 0
  const elapsed = Date.now() - state.energyUpdatedAt
  return Math.max(0, ENERGY_REFILL_MS - (elapsed % ENERGY_REFILL_MS))
}

export function streakPreview(state: PersistState): { streak: number; isNewDay: boolean; dailyBonus: boolean } {
  const today = todayKey()
  if (state.lastPlayDay === today) {
    return { streak: state.streak, isNewDay: false, dailyBonus: false }
  }
  if (state.lastPlayDay === yesterdayKey()) {
    return { streak: state.streak + 1, isNewDay: true, dailyBonus: true }
  }
  return { streak: 1, isNewDay: true, dailyBonus: state.lastPlayDay !== null }
}

export function canStartRun(state: PersistState): boolean {
  return refillEnergy(state).energy > 0
}

export function beginRun(state: PersistState): PersistState {
  let next = refillEnergy(state)
  if (next.energy <= 0) return next

  const preview = streakPreview(next)
  next = {
    ...next,
    energy: next.energy - 1,
    energyUpdatedAt: next.energy >= ENERGY_MAX ? Date.now() : next.energyUpdatedAt,
    streak: preview.streak,
    lastPlayDay: todayKey(),
    gamesPlayed: next.gamesPlayed + 1,
  }
  saveState(next)
  return next
}

export function applyRunResults(state: PersistState, stats: RunStats): {
  state: PersistState
  newUnlocks: string[]
  beatBest: boolean
} {
  let next = refillEnergy(state)
  const newUnlocks: string[] = []
  const totalCaptures = next.totalCaptures + stats.captures
  const unlocked = new Set(next.unlockedSkins)

  for (const skin of SKINS) {
    if (totalCaptures >= skin.unlockAt && !unlocked.has(skin.id)) {
      unlocked.add(skin.id)
      newUnlocks.push(skin.id)
    }
  }

  const entry: LeaderboardEntry = {
    score: stats.score,
    level: stats.level,
    maxCombo: stats.maxCombo,
    at: new Date().toISOString(),
  }
  const leaderboard = [...next.leaderboard, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE)

  const beatBest = stats.score > next.bestScore
  next = {
    ...next,
    bestScore: Math.max(next.bestScore, stats.score),
    totalCaptures,
    unlockedSkins: [...unlocked],
    leaderboard,
  }
  saveState(next)
  return { state: next, newUnlocks, beatBest }
}

export function setActiveSkin(state: PersistState, skinId: string): PersistState {
  if (!state.unlockedSkins.includes(skinId)) return state
  const next = { ...state, activeSkin: skinId }
  saveState(next)
  return next
}

export function getSkin(state: PersistState) {
  return SKINS.find((s) => s.id === state.activeSkin) ?? SKINS[0]
}

export function dailyMultiplier(state: PersistState): number {
  const preview = streakPreview(state)
  if (!preview.dailyBonus && state.lastPlayDay === todayKey()) {
    return 1 + Math.min(0.5, (state.streak - 1) * 0.05)
  }
  return 1 + Math.min(0.5, Math.max(0, preview.streak - 1) * 0.05)
}
