import * as THREE from 'three'
import type { EnvironmentStyle } from './agent/environment'
import type { Surface } from './layout'

function colourFor(surface: Surface, style: EnvironmentStyle): string | undefined {
  return surface === 'wall' ? style.wall
    : surface === 'woodFloor' || surface === 'tileFloor' ? style.floor
    : surface === 'wood' || surface === 'darkWood' ? style.wood
    : surface === 'fabric' || surface === 'fabricWarm' ? style.fabric
    : surface === 'accent' ? style.accent : undefined
}

/**
 * Whether a personalised environment takes this surface over. A styled surface drops
 * its Poly Haven maps for the caregiver's own colour, so the background texture upgrade
 * must leave it alone — re-attaching a photographed plaster map would quietly undo the
 * environment they generated from their own rooms.
 */
export function stylesSurface(surface: Surface, style: EnvironmentStyle | undefined): boolean {
  return style !== undefined && colourFor(surface, style) !== undefined
}

/**
 * The procedural floor pattern is drawn rather than downloaded, so its resolution is
 * free apart from one canvas and its mipmaps. 1024 rather than 256: at a 2 m tile a
 * 256-pixel plank edge is four texels wide on a floor the player walks along, and the
 * seams read as a blur. Every coordinate below is expressed in the original 256-unit
 * grid and scaled by `s`, so the pattern is identical and only its sampling improves.
 */
const PATTERN_SIZE = 1024

export function styleMaterial(material: THREE.MeshStandardMaterial, surface: Surface, style: EnvironmentStyle): void {
  const color = colourFor(surface, style)
  if (!color) return
  material.color.set(color)
  // Reference colours must not be multiplied by the default brown/grey albedo.
  material.map = null; material.normalMap = null; material.roughnessMap = null
  if (surface !== 'woodFloor' && surface !== 'tileFloor') return
  material.roughness = style.floorType === 'tile' ? 0.4 : style.floorType === 'carpet' ? 1 : 0.75
  const size = PATTERN_SIZE
  const s = size / 256
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#bcbcbc'; ctx.lineWidth = (style.floorType === 'tile' ? 3 : 1) * s
  if (style.floorType === 'tile') { ctx.strokeRect(0, 0, size, size) }
  if (style.floorType === 'wood') {
    for (let y = 0; y < size; y += 64 * s) {
      ctx.strokeRect(0, y, size, 64 * s)
      ctx.beginPath(); const x = (y / s) % 128 ? 80 * s : 180 * s; ctx.moveTo(x, y); ctx.lineTo(x, y + 64 * s); ctx.stroke()
      ctx.fillStyle = '#ededed'; for (let i = 5 * s; i < 60 * s; i += 7 * s) ctx.fillRect(0, y + i, size, s)
    }
  }
  if (style.floorType === 'carpet') { ctx.fillStyle = '#e5e5e5'; for (let y = 0; y < size; y += 4 * s) for (let x = 0; x < size; x += 4 * s) ctx.fillRect(x + ((y / s) % 8 ? s : 0), y, s, 2 * s) }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace
  // Drawn at 1024 and minified hard on a floor: without these the pattern aliases into
  // moiré as soon as the player walks away from it.
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  material.map = texture
}

/** Applied after `styleMaterial`, once the renderer's real limit is known. */
export function styleAnisotropy(material: THREE.MeshStandardMaterial, anisotropy: number): void {
  if (material.map) material.map.anisotropy = anisotropy
}
