import * as THREE from 'three'
import type { EnvironmentStyle } from './agent/environment'
import type { Surface } from './layout'

export function styleMaterial(material: THREE.MeshStandardMaterial, surface: Surface, style: EnvironmentStyle): void {
  const color = surface === 'wall' ? style.wall
    : surface === 'woodFloor' || surface === 'tileFloor' ? style.floor
    : surface === 'wood' || surface === 'darkWood' ? style.wood
    : surface === 'fabric' || surface === 'fabricWarm' ? style.fabric
    : surface === 'accent' ? style.accent : undefined
  if (!color) return
  material.color.set(color)
  // Reference colours must not be multiplied by the default brown/grey albedo.
  material.map = null; material.normalMap = null; material.roughnessMap = null
  if (surface !== 'woodFloor' && surface !== 'tileFloor') return
  material.roughness = style.floorType === 'tile' ? 0.4 : style.floorType === 'carpet' ? 1 : 0.75
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#bcbcbc'; ctx.lineWidth = style.floorType === 'tile' ? 3 : 1
  if (style.floorType === 'tile') { ctx.strokeRect(0, 0, 256, 256) }
  if (style.floorType === 'wood') {
    for (let y = 0; y < 256; y += 64) {
      ctx.strokeRect(0, y, 256, 64)
      ctx.beginPath(); const x = y % 128 ? 80 : 180; ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke()
      ctx.fillStyle = '#ededed'; for (let i = 5; i < 60; i += 7) ctx.fillRect(0, y + i, 256, 1)
    }
  }
  if (style.floorType === 'carpet') { ctx.fillStyle = '#e5e5e5'; for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) ctx.fillRect(x + (y % 8 ? 1 : 0), y, 1, 2) }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace
  material.map = texture
}
