import type { GameEngine } from './engine.ts'
import { ARC_INFO, type Skin } from './types.ts'

const TAU = Math.PI * 2

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  skin: Skin,
  w: number,
  h: number,
): void {
  const now = engine.time
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const { cx, cy, radius } = pointOnRing(w, h)
  const shakeX = (Math.random() - 0.5) * engine.shake * 10
  const shakeY = (Math.random() - 0.5) * engine.shake * 10
  const fever = engine.inFever

  ctx.save()
  ctx.translate(shakeX, shakeY)

  const bg = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2)
  bg.addColorStop(0, fever ? 'rgba(240, 180, 41, 0.16)' : 'rgba(62, 224, 197, 0.08)')
  bg.addColorStop(0.45, 'rgba(15, 28, 40, 0.2)')
  bg.addColorStop(1, 'rgba(7, 16, 24, 0)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius * (0.55 + i * 0.22), 0, TAU)
    ctx.stroke()
  }

  // Track ring
  ctx.save()
  if (fever) {
    ctx.shadowColor = '#F0B429'
    ctx.shadowBlur = 24 + Math.sin(now / 90) * 8
  }
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.strokeStyle = fever ? '#5A4416' : skin.ring
  ctx.lineWidth = 14
  ctx.stroke()
  ctx.restore()

  // Fever meter (inner ring)
  const meter = fever ? engine.feverLeft : engine.fever
  if (meter > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius - 22, -Math.PI / 2, -Math.PI / 2 + TAU * meter)
    ctx.strokeStyle = fever ? '#F0B429' : 'rgba(240, 180, 41, 0.55)'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Arcs
  for (const arc of engine.arcs) {
    const pulse = 0.85 + Math.sin((now - arc.born) / 120) * 0.15
    const color = arc.kind === 'normal' ? skin.accent : ARC_INFO[arc.kind].color
    const end = arc.start + arc.width
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 18 * pulse
    ctx.lineCap = 'round'

    if (arc.kind === 'hazard') {
      ctx.setLineDash([6, 7])
      ctx.beginPath()
      ctx.arc(cx, cy, radius, arc.start, end)
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.6 + 0.3 * pulse
      ctx.lineWidth = 16
      ctx.stroke()
      ctx.restore()
      continue
    }

    ctx.beginPath()
    ctx.arc(cx, cy, radius, arc.start, end)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.95
    ctx.lineWidth = 16
    ctx.stroke()

    if (arc.kind === 'double') {
      ctx.beginPath()
      ctx.arc(cx, cy, radius + 13, arc.start, end)
      ctx.lineWidth = 4
      ctx.globalAlpha = arc.hp > 1 ? 0.9 : 0.25
      ctx.stroke()
    }

    if (arc.kind === 'reverse') {
      const mid = arc.start + arc.width / 2
      const ax = cx + Math.cos(mid) * (radius + 18)
      const ay = cy + Math.sin(mid) * (radius + 18)
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.font = '700 14px Syne, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⇄', ax, ay)
    }

    const mid = arc.start + arc.width / 2
    const pz = arc.width * (fever ? 0.5 : engine.perfectFactor)
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
  ctx.shadowColor = fever ? '#F0B429' : skin.glow
  ctx.shadowBlur = 16 + engine.hitPulse * 20
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(nx, ny)
  ctx.strokeStyle = '#F7F3E8'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(nx, ny, 7 + engine.hitPulse * 4, 0, TAU)
  ctx.fillStyle = '#F0B429'
  ctx.fill()
  ctx.restore()

  // Center: combo readout
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (engine.combo > 0) {
    ctx.fillStyle = fever ? '#F0B429' : '#F7F3E8'
    ctx.globalAlpha = 0.9
    ctx.font = `800 ${Math.min(56, 28 + engine.combo)}px Syne, sans-serif`
    ctx.fillText(String(engine.combo), cx, cy - 6)
    ctx.globalAlpha = 0.55
    ctx.font = '700 11px Manrope, sans-serif'
    ctx.fillText(`COMBO ×${engine.comboMult.toFixed(1)}`, cx, cy + 22)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, TAU)
    ctx.fillStyle = '#F7F3E8'
    ctx.fill()
  }
  ctx.restore()

  for (const p of engine.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  for (const f of engine.floats) {
    const t = (now - f.born) / f.life
    ctx.globalAlpha = Math.max(0, 1 - t)
    ctx.fillStyle = f.color
    ctx.font = `800 ${f.size}px Syne, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(f.text, cx + f.x, cy + f.y - t * 36)
  }
  ctx.globalAlpha = 1

  if (engine.flash > 0) {
    ctx.fillStyle = `rgba(240, 180, 41, ${engine.flash * 0.12})`
    ctx.fillRect(0, 0, w, h)
  }

  ctx.restore()
}

export function pointOnRing(w: number, h: number): { cx: number; cy: number; radius: number } {
  return {
    cx: w / 2,
    cy: h / 2 + 8,
    radius: Math.min(w, h) * 0.36,
  }
}
