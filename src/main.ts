import './style.css'
import { buzz, sfx } from './game/audio.ts'
import { GameEngine } from './game/engine.ts'
import { drawFrame, pointOnRing } from './game/render.ts'
import {
  applyRunResults,
  beginRun,
  canStartRun,
  dailyMultiplier,
  getSkin,
  loadState,
  missionLabel,
  msToNextEnergy,
  rankInfo,
  setActiveSkin,
  streakPreview,
  type RunResult,
} from './game/storage.ts'
import {
  ARC_INFO,
  ENERGY_MAX,
  PERKS,
  RANK_PERKS,
  SKINS,
  type ArcKind,
  type PersistState,
  type RunStats,
  type Screen,
} from './game/types.ts'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app')
const app: HTMLDivElement = root

let state: PersistState = loadState()
let screen: Screen = 'home'
let engine: GameEngine | null = null
let lastStats: RunStats | null = null
let lastResult: RunResult | null = null
let raf = 0
let lastTs = 0
let showHow = false
let runAbort: AbortController | null = null

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function rankBar(xp: number): string {
  const r = rankInfo(xp)
  const pct = Math.min(100, (r.into / r.span) * 100)
  return `
    <div class="rank-row">
      <div class="rank-badge">${r.rank}</div>
      <div class="rank-meta">
        <div class="rank-title">${r.title}</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="rank-sub">${fmt(r.into)} / ${fmt(r.span)} XP to rank ${r.rank + 1}</div>
      </div>
    </div>`
}

function missionsPanel(): string {
  const board = state.missions
  if (!board) return ''
  const doneCount = board.list.filter((m) => m.done).length
  return `
    <section class="panel">
      <h2>Daily missions <span class="h2-side">${doneCount}/3${board.chestClaimed ? ' · chest opened' : ' · chest at 3/3'}</span></h2>
      <ul class="missions">
        ${board.list
          .map((m) => {
            const pct = Math.min(100, (m.progress / m.target) * 100)
            return `<li class="${m.done ? 'done' : ''}">
              <div class="mission-top"><span>${missionLabel(m)}</span><em>+${m.reward} XP</em></div>
              <div class="bar small"><div class="bar-fill" style="width:${pct}%"></div></div>
            </li>`
          })
          .join('')}
      </ul>
    </section>`
}

function leaderboardHtml(): string {
  return state.leaderboard.length
    ? `<ol class="leaderboard">${state.leaderboard
        .map(
          (e, i) =>
            `<li><span>#${i + 1}</span><span>Lv ${e.level} · combo ${e.maxCombo}</span><strong>${fmt(e.score)}</strong></li>`,
        )
        .join('')}</ol>`
    : `<p class="empty">No runs yet — your first score lands here.</p>`
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
          <button class="pill pill-btn" id="mute-btn" aria-label="Toggle sound">${sfx.isMuted() ? '🔇' : '🔊'}</button>
        </div>
      </header>
      ${body}
    </div>
  `
  app.querySelector('#mute-btn')?.addEventListener('click', (e) => {
    sfx.toggleMute()
    ;(e.currentTarget as HTMLElement).textContent = sfx.isMuted() ? '🔇' : '🔊'
  })
}

function homeScreen(): void {
  cancelAnimationFrame(raf)
  runAbort?.abort()
  engine = null
  screen = 'home'
  const mult = dailyMultiplier(state)
  const canPlay = canStartRun(state)
  const rank = rankInfo(state.xp).rank

  renderShell(`
    <main class="screen">
      <section class="hero">
        <div class="hero-visual" aria-hidden="true"></div>
        <h1 class="brand-hero">Pulse<br /><span>Orbit</span></h1>
        <p class="lede">Catch arcs, dodge hazards, build fever, and draft perks. How deep can you orbit?</p>
        <div class="cta-row">
          <button class="btn btn-primary" id="play-btn" ${canPlay ? '' : 'disabled'}>
            ${canPlay ? 'Play run' : `Energy in ${formatMs(msToNextEnergy(state))}`}
          </button>
          <button class="btn btn-ghost" id="how-btn">${showHow ? 'Hide guide' : 'How to play'}</button>
        </div>
      </section>

      ${
        showHow
          ? `<section class="panel guide">
        <h2>How to play</h2>
        <p>Tap, click, or press <b>Space</b> while the needle is over an arc. The bright center is the <b>perfect</b> zone.</p>
        <p><b>Tapping on empty ring breaks your combo.</b> Missing an arc costs a life. Fill the inner gold ring to trigger <b>Fever</b> (2× score, every hit perfect).</p>
        <p>Every level you <b>draft a perk</b>. New arc types appear as you go deeper:</p>
        <ul class="kinds">
          ${(Object.entries(ARC_INFO) as [ArcKind, (typeof ARC_INFO)[ArcKind]][])
            .filter(([k]) => k !== 'normal')
            .map(
              ([, info]) =>
                `<li><i style="--c:${info.color}"></i><span><b>${info.name}</b> · Lv ${info.unlockLevel}<br/>${info.tip}</span></li>`,
            )
            .join('')}
        </ul>
      </section>`
          : ''
      }

      <section class="panel">
        <h2>Rank</h2>
        ${rankBar(state.xp)}
        <ul class="rank-perks">
          ${RANK_PERKS.map(
            (p) => `<li class="${rank >= p.rank ? 'on' : ''}"><span>R${p.rank}</span>${p.text}</li>`,
          ).join('')}
        </ul>
      </section>

      ${missionsPanel()}

      <section class="panel">
        <h2>Your orbit</h2>
        <div class="stat-grid">
          <div class="stat"><em>Best</em><strong>${fmt(state.bestScore)}</strong></div>
          <div class="stat"><em>Captures</em><strong>${fmt(state.totalCaptures)}</strong></div>
          <div class="stat"><em>Daily mult</em><strong>×${mult.toFixed(2)}</strong></div>
        </div>
      </section>

      <section class="panel">
        <h2>Orbit skins</h2>
        <div class="skin-row" id="skins"></div>
      </section>

      <section class="panel">
        <h2>Local bests</h2>
        ${leaderboardHtml()}
      </section>
    </main>
  `)

  const skins = app.querySelector('#skins')
  if (skins) {
    for (const s of SKINS) {
      const unlocked = state.unlockedSkins.includes(s.id)
      const btn = document.createElement('button')
      btn.className = `skin-chip${unlocked && state.activeSkin === s.id ? ' active' : ''}${unlocked ? '' : ' locked'}`
      btn.textContent = unlocked ? s.name : `${s.name} · ${s.unlockAt} captures`
      btn.disabled = !unlocked
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
    showHow = !showHow
    homeScreen()
  })
}

function startRun(): void {
  sfx.unlock()
  state = loadState()
  if (!canStartRun(state)) {
    homeScreen()
    return
  }
  const mult = dailyMultiplier(state)
  const rank = rankInfo(state.xp).rank
  state = beginRun(state)
  engine = new GameEngine({
    dailyMultiplier: mult,
    startShield: rank >= 3,
    startPerkPick: rank >= 5,
    startLives: rank >= 8 ? 4 : 3,
  })
  screen = 'play'
  lastTs = 0
  playScreen()
}

function playScreen(): void {
  if (!engine) return
  const skin = getSkin(state)
  const best = state.bestScore

  renderShell(`
    <main class="screen">
      <div class="play-hud">
        <div class="hud-cell"><em>Score</em><strong id="hud-score">0</strong></div>
        <div class="hud-cell" id="hud-best-cell"><em>Best</em><strong id="hud-best">${fmt(best)}</strong></div>
        <div class="hud-cell"><em>Level</em><strong id="hud-level">1</strong></div>
        <div class="hud-cell"><em>Lives</em><strong id="hud-lives"></strong></div>
      </div>
      <div class="canvas-wrap" id="stage">
        <canvas id="game"></canvas>
        <div class="banner" id="banner"></div>
        <div class="perk-overlay" id="perks" hidden></div>
        <div class="hint" id="hint">Tap when the needle is over an arc · don't tap empty ring</div>
      </div>
      <div class="perk-tray" id="perk-tray"></div>
    </main>
  `)

  const canvas = app.querySelector<HTMLCanvasElement>('#game')
  const stage = app.querySelector<HTMLDivElement>('#stage')
  const perksEl = app.querySelector<HTMLDivElement>('#perks')
  const banner = app.querySelector<HTMLDivElement>('#banner')
  if (!canvas || !stage || !perksEl || !banner) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  runAbort?.abort()
  runAbort = new AbortController()
  const signal = runAbort.signal

  const resize = () => {
    const rect = stage.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true, signal })

  let perksShown = false
  let bannerTimer = 0
  let passedBest = best === 0

  const showBanner = (title: string, sub: string, color: string) => {
    banner.innerHTML = `<strong style="color:${color}">${title}</strong><span>${sub}</span>`
    banner.classList.remove('show')
    void banner.offsetWidth
    banner.classList.add('show')
    window.clearTimeout(bannerTimer)
    bannerTimer = window.setTimeout(() => banner.classList.remove('show'), 2600)
  }

  const renderPerks = () => {
    if (!engine?.perkChoices) {
      perksEl.hidden = true
      perksShown = false
      return
    }
    perksShown = true
    perksEl.hidden = false
    perksEl.innerHTML = `
      <div class="perk-title">${engine.level === 1 ? 'Opening draft' : `Level ${engine.level}`} · choose a perk</div>
      <div class="perk-cards">
        ${engine.perkChoices
          .map(
            (p, i) => `<button class="perk-card" data-i="${i}" style="--c:${p.color}">
              <span class="perk-key">${i + 1}</span>
              <strong>${p.name}</strong>
              <span>${p.desc}</span>
              ${engine!.stack(p.id) ? `<em>owned ×${engine!.stack(p.id)}</em>` : ''}
            </button>`,
          )
          .join('')}
      </div>`
    perksEl.querySelectorAll<HTMLButtonElement>('.perk-card').forEach((btn) => {
      btn.addEventListener('click', () => pickPerk(Number(btn.dataset.i)))
    })
  }

  const renderTray = () => {
    const tray = app.querySelector('#perk-tray')
    if (!tray || !engine) return
    tray.innerHTML = PERKS.filter((p) => engine!.stack(p.id))
      .map((p) => `<span class="tray-chip" style="--c:${p.color}">${p.name}${engine!.stack(p.id) > 1 ? ` ×${engine!.stack(p.id)}` : ''}</span>`)
      .join('')
  }

  const pickPerk = (i: number) => {
    if (!engine?.perkChoices?.[i]) return
    engine.choosePerk(i)
    sfx.shield()
    renderPerks()
    renderTray()
    syncHud()
  }

  const syncHud = () => {
    if (!engine) return
    const score = app.querySelector('#hud-score')
    const level = app.querySelector('#hud-level')
    const lives = app.querySelector('#hud-lives')
    if (score) score.textContent = fmt(engine.score)
    if (level) level.textContent = String(engine.level)
    if (lives) lives.textContent = '♥'.repeat(engine.lives) + '◆'.repeat(engine.shields)
    if (!passedBest && engine.score > best) {
      passedBest = true
      app.querySelector('#hud-best-cell')?.classList.add('beaten')
      showBanner('NEW BEST', 'Keep going!', '#F0B429')
    }
  }

  const handleEvents = () => {
    if (!engine) return
    for (const ev of engine.drainEvents()) {
      switch (ev.type) {
        case 'hit':
          if (ev.kind === 'gold') sfx.gold()
          else sfx.hit(ev.combo, ev.quality === 'perfect')
          if (ev.combo > 0 && ev.combo % 10 === 0) buzz(15)
          break
        case 'miss':
          sfx.miss()
          buzz([40, 30, 40])
          break
        case 'whiff':
          sfx.whiff()
          buzz(10)
          break
        case 'dodge':
          sfx.dodge()
          break
        case 'shield':
          sfx.shield()
          buzz(20)
          break
        case 'reverse':
          sfx.reverse()
          break
        case 'fever':
          sfx.fever()
          buzz([20, 20, 20])
          showBanner('FEVER', '2× score · every hit is perfect', '#F0B429')
          break
        case 'levelup':
          sfx.levelup()
          break
        case 'unlock': {
          const info = ARC_INFO[ev.kind]
          showBanner(`NEW · ${info.name}`, info.tip, info.color)
          break
        }
        case 'gameover':
          sfx.gameover()
          buzz(120)
          break
      }
    }
    if (engine.perkChoices && !perksShown) renderPerks()
  }

  const hit = () => {
    if (!engine || !engine.alive || engine.paused) return
    app.querySelector('#hint')?.remove()
    const rect = stage.getBoundingClientRect()
    const { cx, cy, radius } = pointOnRing(rect.width, rect.height)
    engine.attemptHit(cx, cy, radius)
    handleEvents()
    syncHud()
  }

  stage.addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as HTMLElement).closest('.perk-overlay')) return
      e.preventDefault()
      hit()
    },
    { signal },
  )
  window.addEventListener(
    'keydown',
    (e) => {
      if (engine?.paused && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
        pickPerk(Number(e.code.slice(-1)) - 1)
        return
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (!e.repeat) hit()
      }
    },
    { signal },
  )

  renderPerks()
  renderTray()
  syncHud()

  const loop = (ts: number) => {
    if (!engine || screen !== 'play') return
    if (!lastTs) lastTs = ts
    const dt = Math.min(0.033, (ts - lastTs) / 1000)
    lastTs = ts
    engine.update(dt)
    handleEvents()
    syncHud()

    const rect = stage.getBoundingClientRect()
    drawFrame(ctx, engine, skin, rect.width, rect.height)

    if (!engine.alive) {
      // Brief beat so the final miss registers before the results screen.
      window.setTimeout(endRun, 650)
      return
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
}

function endRun(): void {
  if (!engine) return
  cancelAnimationFrame(raf)
  runAbort?.abort()
  lastStats = engine.stats()
  lastResult = applyRunResults(state, lastStats)
  state = lastResult.state
  screen = 'result'
  resultScreen()
}

function resultScreen(): void {
  if (!lastStats || !lastResult) return
  const r = lastResult
  const s = lastStats
  const gap = r.prevBest - s.score
  const rankUp = r.rankAfter > r.rankBefore
  const unlockedRankPerks = RANK_PERKS.filter((p) => p.rank > r.rankBefore && p.rank <= r.rankAfter)
  const canAgain = canStartRun(state)

  const bestLine = r.beatBest
    ? `<div class="badge">New personal best${r.prevBest ? ` · +${fmt(s.score - r.prevBest)}` : ''}</div>`
    : gap > 0 && gap <= Math.max(500, r.prevBest * 0.25)
      ? `<div class="badge near">Only ${fmt(gap)} short of your best</div>`
      : `<div class="badge muted">Best ${fmt(r.prevBest)}</div>`

  renderShell(`
    <main class="screen">
      <section class="result-hero">
        <h1>${fmt(s.score)}</h1>
        <p>Level ${s.level} · max combo ${s.maxCombo} · ${s.perfects} perfects</p>
        ${bestLine}
      </section>

      <section class="panel">
        <h2>Rank <span class="h2-side">+${fmt(r.xpGained)} XP</span></h2>
        ${rankBar(state.xp)}
        ${rankUp ? `<div class="unlocks"><div class="unlock-chip gold">Rank up → ${r.rankAfter}</div>${unlockedRankPerks.map((p) => `<div class="unlock-chip">${p.text}</div>`).join('')}</div>` : ''}
      </section>

      ${
        r.completedMissions.length || r.chest
          ? `<section class="panel">
        <h2>Rewards</h2>
        <div class="unlocks">
          ${r.completedMissions.map((m) => `<div class="unlock-chip">✓ ${missionLabel(m)} · +${m.reward} XP</div>`).join('')}
          ${r.chest ? `<div class="unlock-chip gold">Daily chest: +${r.chest.xp} XP · +${r.chest.energy} energy</div>` : ''}
          ${r.newUnlocks
            .map((id) => `<div class="unlock-chip">Unlocked skin ${SKINS.find((k) => k.id === id)?.name ?? id}</div>`)
            .join('')}
        </div>
      </section>`
          : r.newUnlocks.length
            ? `<section class="panel"><h2>Unlocked</h2><div class="unlocks">${r.newUnlocks
                .map((id) => `<div class="unlock-chip">Skin ${SKINS.find((k) => k.id === id)?.name ?? id}</div>`)
                .join('')}</div></section>`
            : ''
      }

      ${missionsPanel()}

      <section class="panel">
        <h2>Run breakdown</h2>
        <div class="stat-grid">
          <div class="stat"><em>Captures</em><strong>${s.captures}</strong></div>
          <div class="stat"><em>Golden</em><strong>${s.golds}</strong></div>
          <div class="stat"><em>Fevers</em><strong>${s.fevers}</strong></div>
          <div class="stat"><em>Dodges</em><strong>${s.dodges}</strong></div>
          <div class="stat"><em>Misses</em><strong>${s.misses}</strong></div>
          <div class="stat"><em>Time</em><strong>${formatMs(s.durationMs)}</strong></div>
        </div>
      </section>

      <div class="cta-row sticky">
        <button class="btn btn-primary" id="again-btn" ${canAgain ? '' : 'disabled'}>
          ${canAgain ? 'One more run' : `Energy in ${formatMs(msToNextEnergy(state))}`}
        </button>
        <button class="btn btn-ghost" id="home-btn">Home</button>
      </div>
    </main>
  `)

  app.querySelector('#again-btn')?.addEventListener('click', startRun)
  app.querySelector('#home-btn')?.addEventListener('click', homeScreen)

  // Ignore the tap that ended the run so it doesn't instantly restart.
  const armedAt = performance.now() + 700
  const onKey = (e: KeyboardEvent) => {
    if (screen !== 'result') return window.removeEventListener('keydown', onKey)
    if ((e.code === 'Space' || e.code === 'Enter') && performance.now() > armedAt && canStartRun(state)) {
      e.preventDefault()
      window.removeEventListener('keydown', onKey)
      startRun()
    }
  }
  window.addEventListener('keydown', onKey)
}

setInterval(() => {
  if (screen !== 'home') return
  const before = state.energy
  state = loadState()
  if (state.energy !== before) homeScreen()
}, 5000)

declare global {
  interface Window {
    __pulse?: {
      resetProgress: () => void
      refillEnergy: () => void
      start: () => void
      engine: () => GameEngine | null
    }
  }
}

window.__pulse = {
  resetProgress: () => {
    localStorage.removeItem('pulse-orbit-v1')
    state = loadState()
    homeScreen()
  },
  refillEnergy: () => {
    state = { ...loadState(), energy: ENERGY_MAX }
    localStorage.setItem('pulse-orbit-v1', JSON.stringify(state))
    homeScreen()
  },
  start: () => startRun(),
  engine: () => engine,
}

homeScreen()
