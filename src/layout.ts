/**
 * SPEC.md §3 — layout: blockers, triggers, anchors, ids.
 *
 * Pure data plus one wall expander. `proceduralHouse.ts` turns all of this into meshes
 * and Box3 blockers, so collision volumes and visible geometry can never drift apart:
 * every solid is described once, here, as an axis-aligned world-space box.
 *
 * Units are metres.
 *
 * Plan — a five-room house around a central hallway, entered through a front door on
 * the south side. Interior spans x ∈ [-6, 6], z ∈ [-5, 5].
 *
 *            z = -5  (back)
 *   +---------------------+---+---------------------+
 *   |      bedroom        | h |      kitchen        |
 *   |   x[-6,-1.2]        | a |    x[1.2,6]         |
 *   |   z[-5,0.8]         | l |    z[-5,-0.4]       |
 *   +---------------------+ l +---------------------+  z = -0.4
 *   |     bathroom        | w |     livingRoom      |
 *   |   x[-6,-1.2]        | a |    x[1.2,6]         |
 *   |   z[0.8,5]          | y |    z[-0.4,5]        |
 *   +---------------------+-^-+---------------------+
 *            z = +5 (front)  front door
 */

export const CEILING_HEIGHT = 2.7

/**
 * Half-width of the player's collision box, and the figure every doorway is sized
 * against. The player is an axis-aligned box rather than a capsule, so its corners catch
 * on jambs; 0.24 m keeps a 1.0 m doorway comfortably passable while still reading as a
 * person's width.
 */
export const PLAYER_RADIUS = 0.24
export const PLAYER_BODY_MIN_Y = 0.15
export const PLAYER_BODY_MAX_Y = 1.75
export const EXT_WALL_T = 0.24
export const INT_WALL_T = 0.12
export const DOOR_HEIGHT = 2.05
export const ARCH_HEIGHT = 2.2

/** Interior extents. */
export const X0 = -6
export const X1 = 6
export const Z0 = -5
export const Z1 = 5

/** Wall centrelines. */
const EXT_N = Z0 - EXT_WALL_T / 2
const EXT_S = Z1 + EXT_WALL_T / 2
const EXT_W = X0 - EXT_WALL_T / 2
const EXT_E = X1 + EXT_WALL_T / 2
export const HALL_E = 1.2
export const HALL_W = -1.2
const EAST_DIV = -0.4
const WEST_DIV = 0.8

export type Surface =
  | 'wall'
  | 'woodFloor'
  | 'tileFloor'
  | 'counter'
  | 'wood'
  | 'darkWood'
  | 'metal'
  | 'fabric'
  | 'fabricWarm'
  | 'white'
  | 'dark'
  | 'accent'
  | 'mirror'
  | 'glass'
  | 'grass'
  | 'concrete'
  | 'foliage'

export interface SolidSpec {
  id: string
  min: [number, number, number]
  max: [number, number, number]
  surface: Surface
  /** Solids are blockers unless opted out — lintels, rugs, wall art, window glass. */
  blocking?: boolean
  castShadow?: boolean
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export interface Opening {
  from: number
  to: number
  height: number
}

export interface WallRun {
  id: string
  /** The wall's long axis. */
  axis: 'x' | 'z'
  /** Centreline on the perpendicular axis. */
  at: number
  from: number
  to: number
  thickness: number
  surface: Surface
  openings?: Opening[]
}

/**
 * Every opening in the house, declared once. `WALL_RUNS` and `DOORS` are both derived
 * from this, so a doorway and the slab that fills it cannot drift apart.
 *
 * Widths are 1.0 m inside and 1.1 m at the front door. That is wider than a real
 * doorway on purpose: the player is an axis-aligned box, not a capsule, and an open
 * door's own bounding box eats into the opening at the hinge. At 0.9 m the remaining
 * gap was narrower than the player.
 */
export interface OpeningSpec {
  id: string
  label: string
  axis: 'x' | 'z'
  at: number
  from: number
  to: number
  height: number
  thickness: number
  hinge: 'from' | 'to'
  swing: 1 | -1
  /** Archways get trim but no slab. */
  arch?: boolean
}

export const OPENINGS: OpeningSpec[] = [
  { id: 'frontDoor', label: 'front door', axis: 'x', at: EXT_S, from: -0.55, to: 0.55,
    height: 2.1, thickness: EXT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenDoor', label: 'kitchen door', axis: 'z', at: HALL_E, from: -3.4, to: -2.4,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'bedroomDoor', label: 'bedroom door', axis: 'z', at: HALL_W, from: -3.4, to: -2.4,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'bathroomDoor', label: 'bathroom door', axis: 'z', at: HALL_W, from: 2.4, to: 3.4,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'to', swing: 1 },
  { id: 'livingArch', label: 'living room arch', axis: 'z', at: HALL_E, from: 1.2, to: 3.2,
    height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1, arch: true },
  { id: 'kitchenArch', label: 'kitchen arch', axis: 'x', at: EAST_DIV, from: 4.3, to: 5.7,
    height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1, arch: true }
]

const openingsOn = (axis: 'x' | 'z', at: number): Opening[] =>
  OPENINGS.filter((o) => o.axis === axis && o.at === at)
    .map((o) => ({ from: o.from, to: o.to, height: o.height }))

export const WALL_RUNS: WallRun[] = [
  // Exterior shell. The only opening is the front door.
  { id: 'ext-north', axis: 'x', at: EXT_N, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
  { id: 'ext-south', axis: 'x', at: EXT_S, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall',
    openings: openingsOn('x', EXT_S) },
  { id: 'ext-west', axis: 'z', at: EXT_W, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
  { id: 'ext-east', axis: 'z', at: EXT_E, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },

  // Hallway walls. Doors to kitchen, bedroom and bathroom; an open arch to the living room.
  { id: 'hall-east', axis: 'z', at: HALL_E, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('z', HALL_E) },
  { id: 'hall-west', axis: 'z', at: HALL_W, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('z', HALL_W) },

  // Kitchen / living room divider, with a wide arch so the two §1 rooms connect directly
  // as well as through the hallway.
  { id: 'east-div', axis: 'x', at: EAST_DIV, from: HALL_E, to: X1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('x', EAST_DIV) },

  // Bedroom / bathroom divider — no opening, both are reached from the hallway.
  { id: 'west-div', axis: 'x', at: WEST_DIV, from: X0, to: HALL_W, thickness: INT_WALL_T, surface: 'wall' }
]

/**
 * Expands a run into full-height segments between its openings, plus a non-blocking
 * lintel over each opening. Writing the segments by hand is how doorways end up
 * one wall-thickness out of place.
 */
export function expandWall(run: WallRun): SolidSpec[] {
  const out: SolidSpec[] = []
  const half = run.thickness / 2
  const box = (from: number, to: number, y0: number, y1: number, suffix: string, blocking = true): void => {
    if (to - from < 1e-4) return
    const min: [number, number, number] =
      run.axis === 'x' ? [from, y0, run.at - half] : [run.at - half, y0, from]
    const max: [number, number, number] =
      run.axis === 'x' ? [to, y1, run.at + half] : [run.at + half, y1, to]
    out.push({ id: `${run.id}-${suffix}`, min, max, surface: run.surface, blocking })
  }

  const openings = [...(run.openings ?? [])].sort((a, b) => a.from - b.from)
  let cursor = run.from
  openings.forEach((op, i) => {
    box(cursor, op.from, 0, CEILING_HEIGHT, `seg${i}`)
    // Above head height, so it can block nothing and occlude nothing.
    box(op.from, op.to, op.height, CEILING_HEIGHT, `lintel${i}`, false)
    cursor = op.to
  })
  box(cursor, run.to, 0, CEILING_HEIGHT, 'segN')
  return out
}

export const WALLS: SolidSpec[] = WALL_RUNS.flatMap(expandWall)

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

export type DoorSpec = OpeningSpec

export const DOORS: DoorSpec[] = OPENINGS.filter((o) => !o.arch)
export const ARCHES: DoorSpec[] = OPENINGS.filter((o) => o.arch)

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export interface RoomSpec {
  id: string
  min: [number, number, number]
  max: [number, number, number]
  floor: Surface
}

/**
 * Trigger volumes, overlapping slightly at the openings (§1: "overlapping, fire on
 * entry"). `roomOf` resolves the overlap by declaration order, so the four named rooms
 * are declared before the hallway that joins them.
 */
export const ROOMS: RoomSpec[] = [
  { id: 'kitchen', min: [HALL_E, 0, Z0], max: [X1, CEILING_HEIGHT, EAST_DIV], floor: 'tileFloor' },
  { id: 'livingRoom', min: [HALL_E, 0, EAST_DIV], max: [X1, CEILING_HEIGHT, Z1], floor: 'woodFloor' },
  { id: 'bedroom', min: [X0, 0, Z0], max: [HALL_W, CEILING_HEIGHT, WEST_DIV], floor: 'woodFloor' },
  { id: 'bathroom', min: [X0, 0, WEST_DIV], max: [HALL_W, CEILING_HEIGHT, Z1], floor: 'tileFloor' },
  { id: 'hallway', min: [HALL_W - 0.1, 0, Z0], max: [HALL_E + 0.1, CEILING_HEIGHT, Z1], floor: 'woodFloor' }
]

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/** Anything below 0.15 m never meets the player body, so rugs need no opt-out. */
export const FURNITURE: SolidSpec[] = [
  // ---- Living room ----
  { id: 'lr-rug', min: [2.4, 0, 0.7], max: [5.2, 0.012, 3.7], surface: 'accent' },
  { id: 'sofa-base', min: [4.95, 0, 0.9], max: [5.95, 0.42, 3.5], surface: 'fabric', castShadow: true },
  { id: 'sofa-back', min: [5.7, 0.42, 0.9], max: [5.95, 1.0, 3.5], surface: 'fabric', castShadow: true },
  { id: 'sofa-arm-n', min: [4.95, 0.42, 0.9], max: [5.95, 0.7, 1.12], surface: 'fabric', castShadow: true },
  { id: 'sofa-arm-s', min: [4.95, 0.42, 3.28], max: [5.95, 0.7, 3.5], surface: 'fabric', castShadow: true },
  { id: 'sofa-cushion-1', min: [4.98, 0.42, 1.2], max: [5.7, 0.54, 2.15], surface: 'fabric' },
  { id: 'sofa-cushion-2', min: [4.98, 0.42, 2.25], max: [5.7, 0.54, 3.2], surface: 'fabric' },
  { id: 'armchair-base', min: [2.0, 0, 0.6], max: [2.85, 0.42, 1.45], surface: 'fabricWarm', castShadow: true },
  { id: 'armchair-back', min: [2.0, 0.42, 0.6], max: [2.22, 1.0, 1.45], surface: 'fabricWarm', castShadow: true },
  { id: 'lr-side-table', min: [2.95, 0, 0.5], max: [3.4, 0.52, 0.95], surface: 'wood', castShadow: true },
  { id: 'tv-unit', min: [2.6, 0, 4.5], max: [4.9, 0.5, 4.95], surface: 'darkWood', castShadow: true },
  { id: 'tv-screen', min: [3.0, 0.55, 4.72], max: [4.5, 1.4, 4.8], surface: 'dark', castShadow: true },
  { id: 'bookshelf', min: [1.32, 0, 3.4], max: [1.74, 1.95, 4.6], surface: 'wood', castShadow: true },
  { id: 'books-1', min: [1.36, 0.42, 3.5], max: [1.7, 0.72, 3.9], surface: 'accent' },
  { id: 'books-2', min: [1.36, 0.85, 3.6], max: [1.7, 1.12, 4.1], surface: 'fabric' },
  { id: 'books-3', min: [1.36, 1.28, 3.5], max: [1.7, 1.55, 4.0], surface: 'fabricWarm' },

  // ---- Kitchen ----
  { id: 'counter-north', min: [1.32, 0, -4.95], max: [5.9, 0.9, -4.3], surface: 'counter', castShadow: true },
  { id: 'counter-east', min: [5.25, 0, -4.3], max: [6.0, 0.9, -2.1], surface: 'counter', castShadow: true },
  { id: 'upper-cab', min: [1.32, 1.5, -4.95], max: [4.1, 2.2, -4.62], surface: 'wood', castShadow: true },
  { id: 'sink-basin', min: [2.35, 0.82, -4.82], max: [3.25, 0.91, -4.42], surface: 'metal' },
  { id: 'stove-top', min: [4.35, 0.9, -4.88], max: [5.3, 0.95, -4.38], surface: 'dark' },
  { id: 'extractor', min: [4.35, 1.68, -4.95], max: [5.3, 2.1, -4.5], surface: 'metal', castShadow: true },
  { id: 'fridge', min: [1.32, 0, -1.75], max: [2.08, 1.85, -0.95], surface: 'white', castShadow: true },
  { id: 'fridge-handle', min: [2.08, 0.9, -1.6], max: [2.13, 1.6, -1.53], surface: 'metal' },

  // ---- Bedroom ----
  { id: 'bd-rug', min: [-5.0, 0, -2.5], max: [-2.6, 0.012, -0.5], surface: 'accent' },
  { id: 'bed-frame', min: [-5.92, 0, -4.7], max: [-3.7, 0.34, -2.9], surface: 'darkWood', castShadow: true },
  { id: 'mattress', min: [-5.9, 0.34, -4.66], max: [-3.76, 0.64, -2.94], surface: 'white', castShadow: true },
  { id: 'duvet', min: [-5.05, 0.64, -4.66], max: [-3.76, 0.75, -2.94], surface: 'fabricWarm' },
  { id: 'pillow-1', min: [-5.84, 0.64, -4.52], max: [-5.42, 0.78, -3.94], surface: 'white' },
  { id: 'pillow-2', min: [-5.84, 0.64, -3.64], max: [-5.42, 0.78, -3.06], surface: 'white' },
  { id: 'headboard', min: [-6.0, 0, -4.78], max: [-5.86, 1.15, -2.82], surface: 'darkWood', castShadow: true },
  { id: 'bedside-table', min: [-6.0, 0, -2.62], max: [-5.5, 0.55, -2.12], surface: 'wood', castShadow: true },
  { id: 'wardrobe', min: [-3.3, 0, -4.95], max: [-1.45, 2.15, -4.25], surface: 'wood', castShadow: true },
  { id: 'wardrobe-handle-l', min: [-2.45, 1.0, -4.29], max: [-2.4, 1.35, -4.2], surface: 'metal' },
  { id: 'wardrobe-handle-r', min: [-2.35, 1.0, -4.29], max: [-2.3, 1.35, -4.2], surface: 'metal' },
  { id: 'dresser', min: [-2.15, 0, -1.9], max: [-1.32, 0.9, -0.5], surface: 'wood', castShadow: true },

  // ---- Bathroom ----
  { id: 'tub-rim-w', min: [-6.0, 0, 3.0], max: [-5.86, 0.58, 4.95], surface: 'white', castShadow: true },
  { id: 'tub-rim-e', min: [-4.39, 0, 3.0], max: [-4.25, 0.58, 4.95], surface: 'white', castShadow: true },
  { id: 'tub-rim-n', min: [-6.0, 0, 3.0], max: [-4.25, 0.58, 3.14], surface: 'white', castShadow: true },
  { id: 'tub-rim-s', min: [-6.0, 0, 4.81], max: [-4.25, 0.58, 4.95], surface: 'white', castShadow: true },
  { id: 'tub-base', min: [-5.86, 0, 3.14], max: [-4.39, 0.12, 4.81], surface: 'white' },
  { id: 'tub-water', min: [-5.86, 0.12, 3.14], max: [-4.39, 0.36, 4.81], surface: 'glass', blocking: false },
  { id: 'vanity', min: [-4.05, 0, 0.92], max: [-2.5, 0.86, 1.55], surface: 'wood', castShadow: true },
  { id: 'vanity-top', min: [-4.1, 0.86, 0.9], max: [-2.45, 0.93, 1.6], surface: 'counter' },
  { id: 'mirror', min: [-3.95, 1.15, 0.86], max: [-2.6, 1.85, 0.89], surface: 'mirror' },
  { id: 'towel-rail', min: [-2.25, 1.2, 0.86], max: [-1.5, 1.26, 0.92], surface: 'metal', blocking: false },
  { id: 'towel', min: [-2.15, 0.62, 0.87], max: [-1.6, 1.22, 0.99], surface: 'fabric', blocking: false },
  { id: 'bath-mat', min: [-4.2, 0, 3.2], max: [-3.2, 0.014, 4.2], surface: 'fabric' },

  // ---- Hallway ----
  { id: 'hall-runner', min: [-0.85, 0, -4.4], max: [0.85, 0.01, 4.4], surface: 'accent' },
  { id: 'shoe-rack', min: [0.78, 0, 3.3], max: [1.14, 0.5, 4.3], surface: 'wood', castShadow: true },
  { id: 'coat-board', min: [0.98, 1.45, -1.3], max: [1.14, 1.75, -0.2], surface: 'darkWood' },
  { id: 'hall-console', min: [-1.14, 0, -0.9], max: [-0.74, 0.8, 0.7], surface: 'wood', castShadow: true },

  // ---- Exterior ----
  { id: 'porch-slab', min: [-2.5, 0, 5.24], max: [2.5, 0.06, 7.4], surface: 'concrete' },
  { id: 'porch-post-w', min: [-2.4, 0, 7.1], max: [-2.16, 2.55, 7.34], surface: 'wall', castShadow: true },
  { id: 'porch-post-e', min: [2.16, 0, 7.1], max: [2.4, 2.55, 7.34], surface: 'wall', castShadow: true },
  { id: 'porch-roof', min: [-2.62, 2.55, 5.24], max: [2.62, 2.7, 7.5], surface: 'wall', blocking: false, castShadow: true },
  { id: 'path', min: [-0.85, 0, 7.4], max: [0.85, 0.04, 13.0], surface: 'concrete' },
  { id: 'roof', min: [-6.6, CEILING_HEIGHT, -5.6], max: [6.6, CEILING_HEIGHT + 0.26, 5.6], surface: 'wall', blocking: false, castShadow: true },

  // Garden fence — a boundary, so the yard reads as a property rather than a void.
  { id: 'fence-n', min: [-12, 0, -11.2], max: [12, 1.1, -11.0], surface: 'wood' },
  { id: 'fence-w', min: [-12.2, 0, -11.2], max: [-12.0, 1.1, 14.0], surface: 'wood' },
  { id: 'fence-e', min: [12.0, 0, -11.2], max: [12.2, 1.1, 14.0], surface: 'wood' },
  { id: 'fence-s-w', min: [-12.2, 0, 13.8], max: [-1.0, 1.1, 14.0], surface: 'wood' },
  { id: 'fence-s-e', min: [1.0, 0, 13.8], max: [12.2, 1.1, 14.0], surface: 'wood' }
]

// ---------------------------------------------------------------------------
// Tables — top plus four legs, generated so the legs always line up with the top.
// ---------------------------------------------------------------------------

export interface TableSpec {
  id: string
  min: [number, number]
  max: [number, number]
  topY: number
  topT: number
  surface: Surface
  legSurface: Surface
  legT: number
}

export const TABLES: TableSpec[] = [
  { id: 'lr-coffee-table', min: [3.3, 1.5], max: [4.55, 2.9], topY: 0.42, topT: 0.07, surface: 'darkWood', legSurface: 'darkWood', legT: 0.07 },
  { id: 'kitchen-table', min: [2.5, -3.35], max: [4.35, -1.85], topY: 0.75, topT: 0.06, surface: 'wood', legSurface: 'wood', legT: 0.08 },
  { id: 'bd-desk', min: [-5.6, -0.5], max: [-4.0, 0.35], topY: 0.75, topT: 0.05, surface: 'wood', legSurface: 'metal', legT: 0.05 }
]

// ---------------------------------------------------------------------------
// Chairs, windows, props
// ---------------------------------------------------------------------------

export interface ChairSpec {
  id: string
  /** Seat centre. */
  at: [number, number]
  /** Facing, radians about Y. 0 faces -Z. */
  yaw: number
  surface: Surface
}

export const CHAIRS: ChairSpec[] = [
  { id: 'kt-chair-n1', at: [2.95, -3.9], yaw: Math.PI, surface: 'wood' },
  { id: 'kt-chair-n2', at: [3.9, -3.9], yaw: Math.PI, surface: 'wood' },
  { id: 'kt-chair-s1', at: [2.95, -1.35], yaw: 0, surface: 'wood' },
  { id: 'kt-chair-s2', at: [3.9, -1.35], yaw: 0, surface: 'wood' },
  { id: 'bd-desk-chair', at: [-4.8, 0.85], yaw: Math.PI, surface: 'darkWood' }
]

export interface WindowSpec {
  id: string
  /** Centre of the glass, on the wall's interior face. */
  at: [number, number, number]
  facing: '+x' | '-x' | '+z' | '-z'
  width: number
  height: number
}

export const WINDOWS: WindowSpec[] = [
  { id: 'win-lr-east', at: [6.0, 1.55, 3.6], facing: '-x', width: 1.5, height: 1.3 },
  { id: 'win-front-bath', at: [-2.6, 1.55, 5.0], facing: '-z', width: 1.1, height: 1.0 },
  { id: 'win-front-lr', at: [5.3, 1.55, 5.0], facing: '-z', width: 1.2, height: 1.2 },
  { id: 'win-kitchen-north', at: [2.8, 1.55, -5.0], facing: '+z', width: 1.3, height: 1.0 },
  { id: 'win-bedroom-west', at: [-6.0, 1.55, -3.8], facing: '+x', width: 1.4, height: 1.2 },
  { id: 'win-bedroom-north', at: [-4.3, 1.55, -5.0], facing: '+z', width: 1.2, height: 1.2 },
  { id: 'win-bathroom-west', at: [-6.0, 1.75, 3.6], facing: '+x', width: 0.9, height: 0.8 }
]

export interface PlantSpec {
  id: string
  at: [number, number]
  scale: number
}

export const PLANTS: PlantSpec[] = [
  { id: 'plant-lr', at: [1.8, 0.3], scale: 1.0 },
  { id: 'plant-hall', at: [0.88, -0.7], scale: 0.8 },
  { id: 'plant-bath', at: [-1.7, 4.6], scale: 0.7 }
]

export interface TreeSpec {
  id: string
  at: [number, number]
  scale: number
}

export const TREES: TreeSpec[] = [
  { id: 'tree-1', at: [-8.5, 9.0], scale: 1.0 },
  { id: 'tree-2', at: [8.0, 10.5], scale: 1.25 },
  { id: 'tree-3', at: [-9.5, -3.0], scale: 0.9 },
  { id: 'tree-4', at: [9.2, -6.0], scale: 1.1 }
]

/** Floor lamps: pole plus shade, built in code. */
export const LAMPS: { id: string; at: [number, number] }[] = [
  { id: 'lamp-lr', at: [5.6, 0.35] },
  { id: 'lamp-bd', at: [-1.75, 0.15] }
]

// ---------------------------------------------------------------------------
// Placements referenced by id in §1's required-id table
// ---------------------------------------------------------------------------

/** Spawn is on the path outside the front door, looking at it (§2 scope note). */
export const SPAWN_POSITION: [number, number, number] = [0, 1.6, 9.5]
export const SPAWN_LOOK_AT: [number, number] = [0, 5]

export const JUG_POSITION: [number, number, number] = [3.6, 0.9, -4.62]
export const LIVING_ROOM_WALL_ANCHOR: [number, number, number] = [5.94, 1.78, 1.5]
export const LIVING_ROOM_WALL_YAW = -Math.PI / 2
export const BEDSIDE_FRAME_ANCHOR: [number, number, number] = [-5.75, 0.55, -2.37]
export const BEDSIDE_FRAME_YAW = 0.35
export const AUDIO_SOURCE_ANCHOR: [number, number, number] = [2.75, 0.5, 4.7]

/** Small dressing props: id, position, kind. Built in code. */
export const PROPS: { id: string; at: [number, number, number]; kind: string }[] = [
  { id: 'fruit-bowl', at: [1.95, 0.9, -4.62], kind: 'bowl' },
  { id: 'kettle', at: [4.8, 0.95, -4.6], kind: 'kettle' },
  { id: 'mug-1', at: [3.1, 0.75, -2.6], kind: 'mug' },
  { id: 'mug-2', at: [3.7, 0.75, -2.6], kind: 'mug' },
  { id: 'basin', at: [-3.27, 0.93, 1.25], kind: 'basin' },
  { id: 'toilet', at: [-5.5, 0, 1.7], kind: 'toilet' },
  { id: 'laundry-basket', at: [-2.4, 0, 4.5], kind: 'basket' },
  { id: 'tub-tap', at: [-5.9, 0.58, 3.6], kind: 'tap' },
  { id: 'lr-vase', at: [3.9, 0.42, 2.2], kind: 'vase' },
  { id: 'hall-bowl', at: [-0.94, 0.8, -0.1], kind: 'bowl' }
]
