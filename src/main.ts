import './style.css'
import { GameEngine } from './game/engine.ts'
import { drawFrame, pointOnRing } from './game/render.ts'
import {
  applyRunResults,
  beginRun,
  canStartRun,
  dailyMultiplier,
  getSkin,
  loadState,
  msToNextEnergy,
  setActiveSkin,
  streakPreview,
} from './game/storage.ts'
import { ENERGY_MAX, SKINS, type PersistState, type RunStats, type Screen } from './game/types.ts'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app')
const app: HTMLDivElement = root

let state: PersistState = loadState()
let screen: Screen = 'home'
let engine: GameEngine | null = null
let lastStats: RunStats | null = null
let newUnlocks: string[] = []
let beatBest = false
let raf = 0
let lastTs = 0
let showHint = true

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function renderShell(body: string): void {
  const streak = streakPreview(state)
  const energyWait = msToNextEnergy(state)
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-mark">
          <div class="brand-orb" aria-hidden="true"></div>
          <div class="brand-text">Pulse Orbit</div>
        </div>
        <div class="meta-pills">
          <div class="pill">Streak <strong>${streak.streak}d</strong></div>
          <div class="pill">Energy <strong>${state.energy}/${ENERGY_MAX}</strong>${
            state.energy < ENERGY_MAX ? ` · ${formatMs(energyWait)}` : ''
          }</div>
        </div>
      </header>
      ${body}
    </div>
  `
}

function homeScreen(): void {
  cancelAnimationFrame(raf)
  engine = null
  const skin = getSkin(state)
  const mult = dailyMultiplier(state)
  const canPlay = canStartRun(state)

  renderShell(`
    <main class="screen">
      <section class="hero">
        <div class="hero-visual" aria-hidden="true"></div>
        <h1 class="brand-hero">Pulse<br /><span>Orbit</span></h1>
        <p class="lede">Catch glowing arcs with a sweeping needle. Chain perfects, chase golden pulses, and push one more run.</p>
        <div class="cta-row">
          <button class="btn btn-primary" id="play-btn" ${canPlay ? '' : 'disabled'}>
            ${canPlay ? 'Play run' : 'Energy recharging'}
          </button>
          <button class="btn btn-ghost" id="how-btn">How to play</button>
        </div>
      </section>

      <section class="panel">
        <h2>Your orbit</h2>
        <div class="stat-grid">
          <div class="stat"><em>Best</em><strong>${state.bestScore}</strong></div>
          <div class="stat"><em>Captures</em><strong>${state.totalCaptures}</strong></div>
          <div class="stat"><em>Daily mult</em><strong>×${mult.toFixed(2)}</strong></div>
        </div>
      </section>

      <section class="panel">
        <h2>Orbit skins</h2>
        <div class="skin-row" id="skins"></div>
      </section>

      <section class="panel">
        <h2>Local bests</h2>
        ${
          state.leaderboard.length
            ? `<ol class="leaderboard">${state.leaderboard
                .map(
                  (e, i) =>
                    `<li><span>#${i + 1}</span><span>Lv ${e.level} · combo ${e.maxCombo}</span><strong>${e.score}</strong></li>`,
                )
                .join('')}</ol>`
            : `<p class="empty">No runs yet — your first score lands here.</p>`
        }
      </section>
    </main>
  `)

  const skins = app.querySelector('#skins')
  if (skins) {
    for (const s of SKINS) {
      const unlocked = state.unlockedSkins.includes(s.id)
      const btn = document.createElement('button')
      btn.className = `skin-chip${unlocked && state.activeSkin === s.id ? ' active' : ''}${unlocked ? '' : ' locked'}`
      btn.textContent = unlocked ? s.name : `${s.name} · ${s.unlockAt}`
      btn.disabled = !unlocked
      btn.style.setProperty('--chip', s.accent)
      if (unlocked) {
        btn.addEventListener('click', () => {
          state = setActiveSkin(state, s.id)
          homeScreen()
        })
      }
      skins.appendChild(btn)
    }
  }

  app.querySelector('#play-btn')?.addEventListener('click', startRun)
  app.querySelector('#how-btn')?.addEventListener('click', () => {
    window.alert(
      'Tap, click, or press Space when the needle is over an arc.\n\nPerfect center hits grow your combo.\nGolden arcs are rare — big points and +1 energy.\nMisses break the combo and spend energy.\nUnlock skins by capturing arcs over many runs.',
    )
  })

  // Keep energy countdown fresh on home
  void skin
}

function startRun(): void {
  state = loadState()
  if (!canStartRun(state)) {
    homeScreen()
    return
  }
  const mult = dailyMultiplier(state)
  state = beginRun(state)
  engine = new GameEngine({ dailyMultiplier: mult })
  screen = 'play'
  showHint = true
  lastTs = 0
  playScreen()
}

function playScreen(): void {
  if (!engine) return
  const skin = getSkin(state)

  renderShell(`
    <main class="screen">
      <div class="play-hud">
        <div class="hud-cell"><em>Score</em><strong id="hud-score">0</strong></div>
        <div class="hud-cell"><em>Combo</em><strong id="hud-combo">0</strong></div>
        <div class="hud-cell"><em>Level</em><strong id="hud-level">1</strong></div>
        <div class="hud-cell"><em>Energy</em><strong id="hud-energy">5</strong></div>
      </div>
      <div class="canvas-wrap" id="stage">
        <canvas id="game"></canvas>
        ${showHint ? `<div class="hint" id="hint">Tap when needle hits an arc</div>` : ''}
      </div>
    </main>
  `)

  const canvas = app.querySelector<HTMLCanvasElement>('#game')
  const stage = app.querySelector<HTMLDivElement>('#stage')
  if (!canvas || !stage) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    const rect = stage.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true })

  const hit = () => {
    if (!engine || !engine.alive) return
    if (showHint) {
      showHint = false
      app.querySelector('#hint')?.remove()
    }
    const rect = stage.getBoundingClientRect()
    const { cx, cy, radius } = pointOnRing(rect.width, rect.height)
    engine.attemptHit(performance.now(), cx, cy, radius)
    syncHud()
    if (!engine.alive) endRun()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault()
      hit()
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    hit()
  })
  window.addEventListener('keydown', onKey)

  const syncHud = () => {
    if (!engine) return
    const score = app.querySelector('#hud-score')
    const combo = app.querySelector('#hud-combo')
    const level = app.querySelector('#hud-level')
    const energy = app.querySelector('#hud-energy')
    if (score) score.textContent = String(engine.score)
    if (combo) combo.textContent = String(engine.combo)
    if (level) level.textContent = String(engine.level)
    if (energy) energy.textContent = String(engine.energy)
  }

  const loop = (ts: number) => {
    if (!engine || screen !== 'play') {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', resize)
      return
    }
    if (!lastTs) lastTs = ts
    const dt = Math.min(0.033, (ts - lastTs) / 1000)
    lastTs = ts
    engine.update(dt, ts)
    syncHud()

    const rect = stage.getBoundingClientRect()
    drawFrame(ctx, engine, skin, ts, rect.width, rect.height)

    if (!engine.alive) {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', resize)
      endRun()
      return
    }
    raf = requestAnimationFrame(loop)
  }

  raf = requestAnimationFrame(loop)
}

function endRun(): void {
  if (!engine) return
  cancelAnimationFrame(raf)
  lastStats = engine.stats()
  const result = applyRunResults(state, lastStats)
  state = result.state
  newUnlocks = result.newUnlocks
  beatBest = result.beatBest
  screen = 'result'
  resultScreen()
}

function resultScreen(): void {
  if (!lastStats) return
  renderShell(`
    <main class="screen">
      <section class="result-hero">
        <h1>${lastStats.score}</h1>
        <p>Level ${lastStats.level} · max combo ${lastStats.maxCombo} · ${lastStats.perfects} perfects</p>
        ${beatBest ? `<div class="badge">New personal best</div>` : ''}
      </section>

      <section class="panel">
        <h2>Run breakdown</h2>
        <div class="stat-grid">
          <div class="stat"><em>Captures</em><strong>${lastStats.captures}</strong></div>
          <div class="stat"><em>Good</em><strong>${lastStats.goods}</strong></div>
          <div class="stat"><em>Misses</em><strong>${lastStats.misses}</strong></div>
        </div>
        ${
          newUnlocks.length
            ? `<div class="unlocks">${newUnlocks
                .map((id) => {
                  const skin = SKINS.find((s) => s.id === id)
                  return `<div class="unlock-chip">Unlocked ${skin?.name ?? id}</div>`
                })
                .join('')}</div>`
            : ''
        }
      </section>

      <section class="panel">
        <h2>Local bests</h2>
        <ol class="leaderboard">
          ${state.leaderboard
            .map(
              (e, i) =>
                `<li><span>#${i + 1}</span><span>Lv ${e.level} · combo ${e.maxCombo}</span><strong>${e.score}</strong></li>`,
            )
            .join('')}
        </ol>
      </section>

      <div class="cta-row">
        <button class="btn btn-primary" id="again-btn" ${canStartRun(state) ? '' : 'disabled'}>
          ${canStartRun(state) ? 'One more run' : 'Energy recharging'}
        </button>
        <button class="btn btn-ghost" id="home-btn">Home</button>
      </div>
    </main>
  `)

  app.querySelector('#again-btn')?.addEventListener('click', startRun)
  app.querySelector('#home-btn')?.addEventListener('click', () => {
    screen = 'home'
    homeScreen()
  })
}

// Soft energy refresh while idle on home
setInterval(() => {
  if (screen !== 'home') return
  const before = state.energy
  state = loadState()
  if (state.energy !== before) homeScreen()
}, 5000)

// Demo/test helpers (no network) — used for local verification.
declare global {
  interface Window {
    __pulse?: {
      resetProgress: () => void
      start: () => void
      autoplay: (seconds?: number) => void
    }
  }
}

window.__pulse = {
  resetProgress: () => {
    localStorage.removeItem('pulse-orbit-v1')
    state = loadState()
    screen = 'home'
    homeScreen()
  },
  start: () => startRun(),
  autoplay: (seconds = 12) => {
    if (screen !== 'play' || !engine) startRun()
    const end = performance.now() + seconds * 1000
    const tick = () => {
      if (!engine || !engine.alive || performance.now() > end) return
      const ahead = engine.arcs.some((arc) => {
        const s = ((arc.start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const e = ((arc.end % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const n = ((engine!.needle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        if (s <= e) return n >= s && n <= e
        return n >= s || n <= e
      })
      if (ahead) {
        const stage = document.querySelector<HTMLDivElement>('#stage')
        stage?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  },
}

homeScreen()
