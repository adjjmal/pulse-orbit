import type { GameEngine } from './engine.ts'
import type { Skin } from './types.ts'

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  skin: Skin,
  now: number,
  w: number,
  h: number,
): void {
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2 + 8
  const radius = Math.min(w, h) * 0.34
  const shakeX = (Math.random() - 0.5) * engine.shake * 10
  const shakeY = (Math.random() - 0.5) * engine.shake * 10

  ctx.save()
  ctx.translate(shakeX, shakeY)

  // Atmosphere
  const bg = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2)
  bg.addColorStop(0, 'rgba(62, 224, 197, 0.08)')
  bg.addColorStop(0.45, 'rgba(15, 28, 40, 0.2)')
  bg.addColorStop(1, 'rgba(7, 16, 24, 0)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Soft orbit dust
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius * (0.55 + i * 0.22), 0, Math.PI * 2)
    ctx.stroke()
  }

  // Track ring
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = skin.ring
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Arcs
  for (const arc of engine.arcs) {
    const pulse = 0.85 + Math.sin((now - arc.born) / 120) * 0.15
    const color = arc.kind === 'gold' ? '#F0B429' : skin.accent
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 18 * pulse
    ctx.beginPath()
    ctx.arc(cx, cy, radius, arc.start, arc.end)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.95
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ctx.stroke()

    // Perfect zone hint
    const s = arc.start
    const e = arc.end
    const width = ((e - s + Math.PI * 2) % (Math.PI * 2)) || 0.001
    const mid = s + width / 2
    const pz = width * 0.28
    ctx.beginPath()
    ctx.arc(cx, cy, radius, mid - pz, mid + pz)
    ctx.strokeStyle = arc.kind === 'gold' ? '#FFF1B8' : '#FFFFFF'
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.restore()
  }

  // Needle
  const nx = cx + Math.cos(engine.needle) * radius
  const ny = cy + Math.sin(engine.needle) * radius
  ctx.save()
  ctx.shadowColor = skin.glow
  ctx.shadowBlur = 16 + engine.hitPulse * 20
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(nx, ny)
  ctx.strokeStyle = '#F7F3E8'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(nx, ny, 7 + engine.hitPulse * 4, 0, Math.PI * 2)
  ctx.fillStyle = '#F0B429'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#F7F3E8'
  ctx.fill()
  ctx.restore()

  // Particles
  for (const p of engine.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Float texts
  for (const f of engine.floats) {
    const t = (now - f.born) / f.life
    const rise = t * 36
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = f.color
    ctx.font = '700 16px Syne, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(f.text, cx + f.x, cy + f.y - rise)
  }
  ctx.globalAlpha = 1

  // Hit flash
  if (engine.flash > 0) {
    ctx.fillStyle = `rgba(240, 180, 41, ${engine.flash * 0.12})`
    ctx.fillRect(0, 0, w, h)
  }

  ctx.restore()
}

export function pointOnRing(
  w: number,
  h: number,
): { cx: number; cy: number; radius: number } {
  return {
    cx: w / 2,
    cy: h / 2 + 8,
    radius: Math.min(w, h) * 0.34,
  }
}
