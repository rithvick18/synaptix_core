/**
 * SPEC.md §11.7 — the layout picker's top-down plan, drawn from the template data.
 *
 * Not an image file: the thumbnail is computed from the same rooms, wall runs, openings
 * and solids `buildHouse` builds from, so it cannot drift from the world. A mirrored plan
 * is drawn from `mirrorTemplate`'s output — the same data the mirrored house is built
 * from — never by flipping the picture.
 *
 * Pure and deterministic: the same `(template, mirror)` gives the same markup, which is
 * what `npm run check:profile` compares against the card on screen.
 *
 * World x runs right and world z runs down the picture, so the back of the house (low z)
 * is at the top and the front door and path are at the bottom. Nothing here is text:
 * a plan has no labels to mirror.
 */
import { mirrorTemplate } from './mirror'
import type { OpeningSpec, Surface, Template } from './types'

const FLOOR: Partial<Record<Surface, string>> = { woodFloor: '#e8d5b3', tileFloor: '#d3dde0' }
const GARDEN = '#dde7d3'
const PAVING = '#d8d4ca'
const ROOM = '#ebe4d4'
const FURNITURE = '#c4b8a4'
const WALL = '#34453a'
const GAP = '#fffdf7'
const DOOR = '#8a4f22'
const POST = '#6f756b'
const ENTRANCE = '#285a43'
/** Beyond the outer walls, so the porch and the start of the path show. */
const MARGIN = 1.4

const n = (v: number): string => String(Math.round(v * 1000) / 1000)
const rect = (x0: number, z0: number, x1: number, z1: number, fill: string, extra = ''): string =>
  `<rect x="${n(Math.min(x0, x1))}" y="${n(Math.min(z0, z1))}" width="${n(Math.abs(x1 - x0))}" height="${n(Math.abs(z1 - z0))}" fill="${fill}"${extra}/>`

/** The footprint of a wall run or an opening, which are declared the same way. */
function band(s: { axis: 'x' | 'z'; at: number; from: number; to: number; thickness: number }, pad = 0): [number, number, number, number] {
  const h = s.thickness / 2 + pad
  return s.axis === 'x' ? [s.from, s.at - h, s.to, s.at + h] : [s.at - h, s.from, s.at + h, s.to]
}

/** Whether a wall run is cut by this opening: the generator's own rule (§11.1). */
function cutsWall(t: Template, o: OpeningSpec): boolean {
  return t.walls.some(w => w.axis === o.axis && Math.abs(w.at - o.at) < 1e-6 &&
    Math.min(o.from, o.to) >= Math.min(w.from, w.to) - 1e-6 && Math.max(o.from, o.to) <= Math.max(w.from, w.to) + 1e-6)
}

export function planSvg(template: Template, mirror: boolean): string {
  const t = mirror ? mirrorTemplate(template) : template
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const w of t.walls) {
    const [a, b, c, d] = band(w)
    x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d)
  }
  x0 -= MARGIN; z0 -= MARGIN; x1 += MARGIN; z1 += MARGIN
  const parts: string[] = [rect(x0, z0, x1, z1, GARDEN)]

  // Floor-level exterior solids — porch, path, the courtyard's verandah slabs. Roofs are
  // left out (they would cover the plan); tall blocking solids are posts, drawn later.
  const low = [...t.exterior, ...t.furniture].filter(s => s.max[1] <= 0.2 && s.surface === 'concrete')
  for (const s of low) parts.push(rect(s.min[0], s.min[2], s.max[0], s.max[2], PAVING))
  for (const r of t.rooms) parts.push(rect(r.min[0], r.min[2], r.max[0], r.max[2], FLOOR[r.floor] ?? ROOM))

  // Furniture the player walks around. Rugs, wall art and invisible blockers are left out.
  for (const s of t.furniture) {
    if (s.blocking === false || s.invisible || s.max[1] <= 0.2) continue
    parts.push(rect(s.min[0], s.min[2], s.max[0], s.max[2], FURNITURE))
  }
  for (const s of t.tables) parts.push(rect(s.min[0], s.min[1], s.max[0], s.max[1], FURNITURE))

  for (const w of t.walls) parts.push(rect(...band(w), WALL))
  for (const o of t.openings) {
    if (cutsWall(t, o)) {
      parts.push(rect(...band(o, 0.02), GAP))
      // A door is a leaf across its gap; an arch is left open.
      if (o.kind === 'door') parts.push(rect(...band({ ...o, thickness: 0.16 }), DOOR))
    } else {
      // An opening on no wall run — `openPlan`'s threshold strip (§11.2).
      parts.push(rect(...band(o), 'none', ` stroke="${WALL}" stroke-width="0.06" stroke-dasharray="0.15 0.1"`))
    }
  }
  for (const s of t.exterior) {
    if (s.blocking === false || s.max[1] <= 0.2) continue
    parts.push(rect(s.min[0], s.min[2], s.max[0], s.max[2], POST))
  }

  // Where the player comes in: an arrow on the path, pointing at the front door.
  const door = t.openings.find(o => o.id === t.frontDoor)
  if (door && door.axis === 'x') {
    const cx = (door.from + door.to) / 2, tip = door.at + door.thickness / 2 + 0.25, tail = tip + 0.9
    parts.push(`<path d="M${n(cx)} ${n(tip)} L${n(cx - 0.45)} ${n(tail)} L${n(cx + 0.45)} ${n(tail)} Z" fill="${ENTRANCE}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x0)} ${n(z0)} ${n(x1 - x0)} ${n(z1 - z0)}" ` +
    `data-template="${t.id}" data-mirrored="${mirror ? 1 : 0}" role="img" aria-label="Plan of the ${t.name} layout${mirror ? ', flipped left to right' : ''}">` +
    parts.join('') + '</svg>'
}
