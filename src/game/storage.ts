import {
  ENERGY_MAX,
  ENERGY_REFILL_MS,
  LEADERBOARD_SIZE,
  RANK_TITLES,
  SKINS,
  type LeaderboardEntry,
  type Mission,
  type MissionBoard,
  type MissionType,
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
  xp: 0,
  missions: null,
})

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function todayKey(): string {
  return dayKey(new Date())
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKey(d)
}

export function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? { ...defaultState(), ...(JSON.parse(raw) as Partial<PersistState>) } : defaultState()
    return ensureMissions(refillEnergy(parsed))
  } catch {
    return ensureMissions(defaultState())
  }
}

export function saveState(state: PersistState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function refillEnergy(state: PersistState): PersistState {
  const now = Date.now()
  // Chest rewards can push energy above the cap; never clamp it back down.
  if (state.energy >= ENERGY_MAX) {
    return { ...state, energyUpdatedAt: now }
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

// ---------- Rank ----------

export function xpForRank(rank: number): number {
  // Cumulative XP needed to reach `rank` (rank 1 = 0 XP).
  return Math.round(120 * Math.pow(rank - 1, 1.45))
}

export function rankInfo(xp: number): { rank: number; title: string; into: number; span: number } {
  let rank = 1
  while (xp >= xpForRank(rank + 1)) rank++
  const floor = xpForRank(rank)
  const span = xpForRank(rank + 1) - floor
  const title = RANK_TITLES[Math.min(RANK_TITLES.length - 1, Math.floor((rank - 1) / 2))]
  return { rank, title, into: xp - floor, span }
}

export function xpFromRun(stats: RunStats): number {
  return Math.round(stats.score / 150 + stats.captures * 2 + stats.level * 5)
}

// ---------- Missions ----------

const MISSION_TEMPLATES: { type: MissionType; targets: number[]; reward: number }[] = [
  { type: 'score', targets: [3000, 6000, 12000, 20000], reward: 60 },
  { type: 'level', targets: [4, 5, 7, 9], reward: 60 },
  { type: 'perfects', targets: [25, 50, 90], reward: 50 },
  { type: 'combo', targets: [12, 20, 30, 45], reward: 60 },
  { type: 'golds', targets: [3, 6, 10], reward: 45 },
  { type: 'dodges', targets: [4, 8, 15], reward: 55 },
  { type: 'captures', targets: [60, 120, 200], reward: 45 },
  { type: 'fevers', targets: [2, 4, 7], reward: 55 },
]

const BEST_OF_RUN: MissionType[] = ['score', 'level', 'combo']

export function missionLabel(m: Mission): string {
  switch (m.type) {
    case 'score':
      return `Score ${m.target.toLocaleString()} in one run`
    case 'level':
      return `Reach level ${m.target}`
    case 'combo':
      return `Hit a ${m.target} combo`
    case 'perfects':
      return `Land ${m.target} perfects today`
    case 'golds':
      return `Catch ${m.target} golden arcs today`
    case 'dodges':
      return `Dodge ${m.target} hazards today`
    case 'captures':
      return `Capture ${m.target} arcs today`
    case 'fevers':
      return `Trigger fever ${m.target} times today`
  }
}

function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function makeBoard(day: string, rank: number): MissionBoard {
  const rand = seeded(day)
  const pool = [...MISSION_TEMPLATES]
  // Hazard dodges need level 6 — keep them out until the player gets there.
  if (rank < 3) pool.splice(pool.findIndex((t) => t.type === 'dodges'), 1)
  const tier = Math.min(3, Math.floor((rank - 1) / 3))
  const list: Mission[] = []
  while (list.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    const target = t.targets[Math.min(t.targets.length - 1, tier)]
    list.push({ id: `${day}-${t.type}`, type: t.type, target, progress: 0, done: false, reward: t.reward + tier * 20 })
  }
  return { day, list, chestClaimed: false }
}

function ensureMissions(state: PersistState): PersistState {
  const today = todayKey()
  if (state.missions?.day === today) return state
  return { ...state, missions: makeBoard(today, rankInfo(state.xp).rank) }
}

function statFor(type: MissionType, stats: RunStats): number {
  switch (type) {
    case 'score':
      return stats.score
    case 'level':
      return stats.level
    case 'combo':
      return stats.maxCombo
    case 'perfects':
      return stats.perfects
    case 'golds':
      return stats.golds
    case 'dodges':
      return stats.dodges
    case 'captures':
      return stats.captures
    case 'fevers':
      return stats.fevers
  }
}

export interface ChestReward {
  xp: number
  energy: number
}

export interface RunResult {
  state: PersistState
  newUnlocks: string[]
  beatBest: boolean
  prevBest: number
  xpGained: number
  rankBefore: number
  rankAfter: number
  completedMissions: Mission[]
  chest: ChestReward | null
}

export function applyRunResults(state: PersistState, stats: RunStats): RunResult {
  let next = ensureMissions(refillEnergy(state))
  const newUnlocks: string[] = []
  const totalCaptures = next.totalCaptures + stats.captures
  const unlocked = new Set(next.unlockedSkins)

  for (const skin of SKINS) {
    if (totalCaptures >= skin.unlockAt && !unlocked.has(skin.id)) {
      unlocked.add(skin.id)
      newUnlocks.push(skin.id)
    }
  }

  const completedMissions: Mission[] = []
  let missionXp = 0
  const board = next.missions!
  const list = board.list.map((m) => {
    if (m.done) return m
    const value = statFor(m.type, stats)
    const progress = BEST_OF_RUN.includes(m.type) ? Math.max(m.progress, value) : m.progress + value
    const done = progress >= m.target
    const updated = { ...m, progress: Math.min(progress, m.target), done }
    if (done) {
      completedMissions.push(updated)
      missionXp += m.reward
    }
    return updated
  })

  let chest: ChestReward | null = null
  let chestClaimed = board.chestClaimed
  let energy = next.energy
  if (!chestClaimed && list.every((m) => m.done)) {
    chestClaimed = true
    const roll = Math.random()
    chest =
      roll < 0.15
        ? { xp: 250, energy: 3 }
        : roll < 0.5
          ? { xp: 150, energy: 2 }
          : { xp: 80, energy: 1 }
    energy = Math.min(ENERGY_MAX + 3, energy + chest.energy)
  }

  const entry: LeaderboardEntry = {
    score: stats.score,
    level: stats.level,
    maxCombo: stats.maxCombo,
    at: new Date().toISOString(),
  }
  const leaderboard = [...next.leaderboard, entry].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE)

  const xpGained = xpFromRun(stats) + missionXp + (chest?.xp ?? 0)
  const rankBefore = rankInfo(next.xp).rank
  const prevBest = next.bestScore
  next = {
    ...next,
    bestScore: Math.max(next.bestScore, stats.score),
    totalCaptures,
    unlockedSkins: [...unlocked],
    leaderboard,
    xp: next.xp + xpGained,
    energy,
    missions: { ...board, list, chestClaimed },
  }
  saveState(next)
  return {
    state: next,
    newUnlocks,
    beatBest: stats.score > prevBest,
    prevBest,
    xpGained,
    rankBefore,
    rankAfter: rankInfo(next.xp).rank,
    completedMissions,
    chest,
  }
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
