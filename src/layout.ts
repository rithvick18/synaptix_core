/**
 * SPEC.md §3 — layout: blockers, triggers, anchors, ids.
 *
 * Pure data plus one wall expander. `proceduralHouse.ts` turns all of this into meshes
 * and Box3 blockers, so collision volumes and visible geometry can never drift apart:
 * every solid is described once, here, as an axis-aligned world-space box.
 *
 * Units are metres.
 *
 * **Everything is expressed relative to the wall constants below.** Furniture is written
 * as offsets from the wall face it stands against, not as absolute coordinates, so the
 * house can be resized by editing `X0`/`X1`/`Z0`/`Z1` and the dividers without the
 * contents drifting away from their walls.
 *
 *            z = Z0  (back)
 *   +---------------------+---+---------------------+
 *   |      bedroom        | h |      kitchen        |
 *   +---------------------+ a +---------------------+  z = EAST_DIV / WEST_DIV
 *   |     bathroom        | l |     livingRoom      |
 *   +---------------------+-^-+---------------------+
 *            z = Z1 (front)  front door
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

/** Interior extents. Change these to resize the house. */
export const X0 = -7.5
export const X1 = 7.5
export const Z0 = -6
export const Z1 = 6

/** Interior wall centrelines. */
export const HALL_E = 1.3
export const HALL_W = -1.3
export const EAST_DIV = -0.5
export const WEST_DIV = 0.8

/** Exterior wall centrelines. */
const EXT_N = Z0 - EXT_WALL_T / 2
const EXT_S = Z1 + EXT_WALL_T / 2
const EXT_W = X0 - EXT_WALL_T / 2
const EXT_E = X1 + EXT_WALL_T / 2

/** Interior wall faces — what furniture actually stands against. */
const H = INT_WALL_T / 2
const HALL_E_ROOM = HALL_E + H   // kitchen / living room side of the hallway's east wall
const HALL_E_HALL = HALL_E - H   // hallway side
const HALL_W_ROOM = HALL_W - H   // bedroom / bathroom side of the hallway's west wall
const HALL_W_HALL = HALL_W + H   // hallway side
const WEST_DIV_S = WEST_DIV + H  // bathroom side

export type Surface =
  | 'wall' | 'woodFloor' | 'tileFloor' | 'counter' | 'wood' | 'darkWood' | 'metal'
  | 'fabric' | 'fabricWarm' | 'white' | 'dark' | 'accent' | 'mirror' | 'glass'
  | 'grass' | 'concrete' | 'foliage'

export interface SolidSpec {
  id: string
  min: [number, number, number]
  max: [number, number, number]
  surface: Surface
  /** Solids are blockers unless opted out — lintels, rugs, wall art, towels. */
  blocking?: boolean
  /** Blocker only, no mesh. For props whose visible form is built in code. */
  invisible?: boolean
  castShadow?: boolean
}

// ---------------------------------------------------------------------------
// Openings — declared once, used for both wall gaps and door slabs
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

/** Centre of each room along the axis its door sits on. */
const KITCHEN_MID_Z = (Z0 + EAST_DIV) / 2
const BEDROOM_MID_Z = (Z0 + WEST_DIV) / 2
const BATHROOM_MID_Z = (WEST_DIV + Z1) / 2
const LIVING_MID_Z = (EAST_DIV + Z1) / 2

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
  { id: 'kitchenDoor', label: 'kitchen door', axis: 'z', at: HALL_E,
    from: KITCHEN_MID_Z - 0.5, to: KITCHEN_MID_Z + 0.5,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'bedroomDoor', label: 'bedroom door', axis: 'z', at: HALL_W,
    from: BEDROOM_MID_Z - 0.5, to: BEDROOM_MID_Z + 0.5,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'bathroomDoor', label: 'bathroom door', axis: 'z', at: HALL_W,
    from: BATHROOM_MID_Z - 0.5, to: BATHROOM_MID_Z + 0.5,
    height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'to', swing: 1 },
  { id: 'livingArch', label: 'living room arch', axis: 'z', at: HALL_E,
    from: LIVING_MID_Z - 1.1, to: LIVING_MID_Z + 1.1,
    height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1, arch: true },
  { id: 'kitchenArch', label: 'kitchen arch', axis: 'x', at: EAST_DIV,
    from: X1 - 2.9, to: X1 - 1.3,
    height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1, arch: true }
]

const openingsOn = (axis: 'x' | 'z', at: number): Opening[] =>
  OPENINGS.filter((o) => o.axis === axis && o.at === at)
    .map((o) => ({ from: o.from, to: o.to, height: o.height }))

export const WALL_RUNS: WallRun[] = [
  { id: 'ext-north', axis: 'x', at: EXT_N, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
  { id: 'ext-south', axis: 'x', at: EXT_S, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall',
    openings: openingsOn('x', EXT_S) },
  { id: 'ext-west', axis: 'z', at: EXT_W, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
  { id: 'ext-east', axis: 'z', at: EXT_E, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },

  { id: 'hall-east', axis: 'z', at: HALL_E, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('z', HALL_E) },
  { id: 'hall-west', axis: 'z', at: HALL_W, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('z', HALL_W) },
  { id: 'east-div', axis: 'x', at: EAST_DIV, from: HALL_E, to: X1, thickness: INT_WALL_T, surface: 'wall',
    openings: openingsOn('x', EAST_DIV) },
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
//
// Placed against wall faces and sized to leave the middle of every room open: the
// point of the house is walking around in it, not squeezing past sideboards.
// Anything below 0.15 m never meets the player body, so rugs need no opt-out.
// ---------------------------------------------------------------------------

export const FURNITURE: SolidSpec[] = [
  // ---- Living room: x [HALL_E_ROOM, X1], z [EAST_DIV_S, Z1] ----
  { id: 'lr-rug', min: [X1 - 3.9, 0, 1.4], max: [X1 - 0.9, 0.012, 4.4], surface: 'accent' },
  { id: 'sofa-base', min: [X1 - 1.0, 0, 1.3], max: [X1, 0.42, 3.9], surface: 'fabric', castShadow: true },
  { id: 'sofa-back', min: [X1 - 0.25, 0.42, 1.3], max: [X1, 1.0, 3.9], surface: 'fabric', castShadow: true },
  { id: 'sofa-arm-n', min: [X1 - 1.0, 0.42, 1.3], max: [X1, 0.7, 1.52], surface: 'fabric', castShadow: true },
  { id: 'sofa-arm-s', min: [X1 - 1.0, 0.42, 3.68], max: [X1, 0.7, 3.9], surface: 'fabric', castShadow: true },
  { id: 'sofa-cushion-1', min: [X1 - 0.97, 0.42, 1.62], max: [X1 - 0.25, 0.54, 2.57], surface: 'fabric' },
  { id: 'sofa-cushion-2', min: [X1 - 0.97, 0.42, 2.67], max: [X1 - 0.25, 0.54, 3.62], surface: 'fabric' },
  { id: 'armchair-base', min: [2.3, 0, 0.3], max: [3.15, 0.42, 1.15], surface: 'fabricWarm', castShadow: true },
  { id: 'armchair-back', min: [2.3, 0.42, 0.3], max: [2.52, 1.0, 1.15], surface: 'fabricWarm', castShadow: true },
  { id: 'lr-side-table', min: [3.3, 0, 0.35], max: [3.75, 0.52, 0.8], surface: 'wood', castShadow: true },
  { id: 'tv-unit', min: [3.4, 0, Z1 - 0.45], max: [5.7, 0.5, Z1], surface: 'darkWood', castShadow: true },
  { id: 'tv-screen', min: [3.8, 0.55, Z1 - 0.23], max: [5.3, 1.4, Z1 - 0.15], surface: 'dark', castShadow: true },
  { id: 'bookshelf', min: [HALL_E_ROOM, 0, 4.4], max: [HALL_E_ROOM + 0.42, 1.95, 5.6], surface: 'wood', castShadow: true },
  { id: 'books-1', min: [HALL_E_ROOM + 0.04, 0.42, 4.5], max: [HALL_E_ROOM + 0.38, 0.72, 4.9], surface: 'accent' },
  { id: 'books-2', min: [HALL_E_ROOM + 0.04, 0.85, 4.6], max: [HALL_E_ROOM + 0.38, 1.12, 5.1], surface: 'fabric' },
  { id: 'books-3', min: [HALL_E_ROOM + 0.04, 1.28, 4.5], max: [HALL_E_ROOM + 0.38, 1.55, 5.0], surface: 'fabricWarm' },

  // ---- Kitchen: x [HALL_E_ROOM, X1], z [Z0, EAST_DIV_N] ----
  { id: 'counter-north', min: [HALL_E_ROOM, 0, Z0], max: [5.9, 0.9, Z0 + 0.65], surface: 'counter', castShadow: true },
  { id: 'counter-east', min: [X1 - 0.75, 0, Z0 + 0.65], max: [X1, 0.9, Z0 + 3.0], surface: 'counter', castShadow: true },
  { id: 'upper-cab', min: [HALL_E_ROOM, 1.5, Z0], max: [4.2, 2.2, Z0 + 0.33], surface: 'wood', castShadow: true },
  { id: 'sink-basin', min: [2.4, 0.82, Z0 + 0.13], max: [3.3, 0.91, Z0 + 0.53], surface: 'metal' },
  { id: 'stove-top', min: [4.4, 0.9, Z0 + 0.07], max: [5.35, 0.95, Z0 + 0.57], surface: 'dark' },
  { id: 'extractor', min: [4.4, 1.68, Z0], max: [5.35, 2.1, Z0 + 0.45], surface: 'metal', castShadow: true },
  { id: 'fridge', min: [HALL_E_ROOM, 0, -2.2], max: [HALL_E_ROOM + 0.76, 1.85, -1.4], surface: 'white', castShadow: true },
  { id: 'fridge-handle', min: [HALL_E_ROOM + 0.76, 0.9, -2.05], max: [HALL_E_ROOM + 0.81, 1.6, -1.98], surface: 'metal' },

  // ---- Bedroom: x [X0, HALL_W_ROOM], z [Z0, WEST_DIV] ----
  { id: 'bd-rug', min: [X0 + 1.3, 0, -2.6], max: [X0 + 3.9, 0.012, -0.6], surface: 'accent' },
  { id: 'headboard', min: [X0, 0, -4.6], max: [X0 + 0.14, 1.15, -2.5], surface: 'darkWood', castShadow: true },
  { id: 'bed-frame', min: [X0 + 0.08, 0, -4.5], max: [X0 + 2.3, 0.34, -2.6], surface: 'darkWood', castShadow: true },
  { id: 'mattress', min: [X0 + 0.1, 0.34, -4.46], max: [X0 + 2.24, 0.64, -2.64], surface: 'white', castShadow: true },
  { id: 'duvet', min: [X0 + 0.95, 0.64, -4.46], max: [X0 + 2.24, 0.75, -2.64], surface: 'fabricWarm' },
  { id: 'pillow-1', min: [X0 + 0.16, 0.64, -4.32], max: [X0 + 0.58, 0.78, -3.74], surface: 'white' },
  { id: 'pillow-2', min: [X0 + 0.16, 0.64, -3.44], max: [X0 + 0.58, 0.78, -2.86], surface: 'white' },
  { id: 'bedside-table', min: [X0, 0, -2.4], max: [X0 + 0.5, 0.55, -1.9], surface: 'wood', castShadow: true },
  { id: 'wardrobe', min: [X0 + 2.9, 0, Z0], max: [X0 + 4.75, 2.15, Z0 + 0.7], surface: 'wood', castShadow: true },
  { id: 'wardrobe-handle-l', min: [X0 + 3.78, 1.0, Z0 + 0.66], max: [X0 + 3.83, 1.35, Z0 + 0.75], surface: 'metal' },
  { id: 'wardrobe-handle-r', min: [X0 + 3.88, 1.0, Z0 + 0.66], max: [X0 + 3.93, 1.35, Z0 + 0.75], surface: 'metal' },
  { id: 'dresser', min: [HALL_W_ROOM - 0.83, 0, -1.6], max: [HALL_W_ROOM, 0.9, -0.2], surface: 'wood', castShadow: true },

  // ---- Bathroom: x [X0, HALL_W_ROOM], z [WEST_DIV_S, Z1] ----
  { id: 'tub-rim-w', min: [X0, 0, 3.9], max: [X0 + 0.14, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
  { id: 'tub-rim-e', min: [X0 + 1.76, 0, 3.9], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
  { id: 'tub-rim-n', min: [X0, 0, 3.9], max: [X0 + 1.9, 0.58, 4.04], surface: 'white', castShadow: true },
  { id: 'tub-rim-s', min: [X0, 0, Z1 - 0.19], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
  { id: 'tub-base', min: [X0 + 0.14, 0, 4.04], max: [X0 + 1.76, 0.12, Z1 - 0.19], surface: 'white' },
  { id: 'tub-water', min: [X0 + 0.14, 0.12, 4.04], max: [X0 + 1.76, 0.36, Z1 - 0.19], surface: 'glass' },
  { id: 'vanity', min: [X0 + 2.2, 0, WEST_DIV_S], max: [X0 + 3.75, 0.86, WEST_DIV_S + 0.63], surface: 'wood', castShadow: true },
  { id: 'vanity-top', min: [X0 + 2.15, 0.86, WEST_DIV_S - 0.02], max: [X0 + 3.8, 0.93, WEST_DIV_S + 0.68], surface: 'counter' },
  { id: 'mirror', min: [X0 + 2.3, 1.15, WEST_DIV_S], max: [X0 + 3.65, 1.85, WEST_DIV_S + 0.03], surface: 'mirror', blocking: false },
  { id: 'towel-rail', min: [X0 + 4.3, 1.2, WEST_DIV_S], max: [X0 + 5.05, 1.26, WEST_DIV_S + 0.06], surface: 'metal', blocking: false },
  { id: 'towel', min: [X0 + 4.4, 0.62, WEST_DIV_S + 0.01], max: [X0 + 4.95, 1.22, WEST_DIV_S + 0.13], surface: 'fabric', blocking: false },
  { id: 'bath-mat', min: [X0 + 2.0, 0, 4.2], max: [X0 + 3.0, 0.014, 5.2], surface: 'fabric' },
  // Blocker only; the visible toilet is built from primitives in proceduralHouse.ts.
  { id: 'toilet-blocker', min: [X0 + 0.15, 0, 1.34], max: [X0 + 0.8, 0.75, 1.86], surface: 'white', invisible: true },

  // ---- Hallway: x [HALL_W_HALL, HALL_E_HALL], z [Z0, Z1] ----
  { id: 'hall-runner', min: [-0.95, 0, Z0 + 0.6], max: [0.95, 0.01, Z1 - 0.6], surface: 'accent' },
  { id: 'shoe-rack', min: [HALL_E_HALL - 0.38, 0, 4.2], max: [HALL_E_HALL, 0.5, 5.2], surface: 'wood', castShadow: true },
  { id: 'coat-board', min: [HALL_E_HALL - 0.16, 1.45, -1.5], max: [HALL_E_HALL, 1.75, -0.3], surface: 'darkWood' },
  { id: 'hall-console', min: [HALL_W_HALL, 0, -1.0], max: [HALL_W_HALL + 0.4, 0.8, 0.6], surface: 'wood', castShadow: true },

  // ---- Exterior ----
  { id: 'porch-slab', min: [-2.8, 0, Z1 + EXT_WALL_T], max: [2.8, 0.06, Z1 + 2.5], surface: 'concrete' },
  { id: 'porch-post-w', min: [-2.7, 0, Z1 + 2.2], max: [-2.46, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
  { id: 'porch-post-e', min: [2.46, 0, Z1 + 2.2], max: [2.7, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
  { id: 'porch-roof', min: [-2.92, 2.55, Z1 + EXT_WALL_T], max: [2.92, 2.7, Z1 + 2.6], surface: 'wall', blocking: false, castShadow: true },
  { id: 'path', min: [-0.9, 0, Z1 + 2.5], max: [0.9, 0.04, Z1 + 8.0], surface: 'concrete' },
  { id: 'roof', min: [X0 - 0.6, CEILING_HEIGHT, Z0 - 0.6], max: [X1 + 0.6, CEILING_HEIGHT + 0.26, Z1 + 0.6], surface: 'wall', blocking: false, castShadow: true },

  // Garden fence — a boundary, so the yard reads as a property rather than a void.
  { id: 'fence-n', min: [-14, 0, Z0 - 7], max: [14, 1.1, Z0 - 6.8], surface: 'wood' },
  { id: 'fence-w', min: [-14.2, 0, Z0 - 7], max: [-14, 1.1, Z1 + 10], surface: 'wood' },
  { id: 'fence-e', min: [14, 0, Z0 - 7], max: [14.2, 1.1, Z1 + 10], surface: 'wood' },
  { id: 'fence-s-w', min: [-14.2, 0, Z1 + 9.8], max: [-1.1, 1.1, Z1 + 10], surface: 'wood' },
  { id: 'fence-s-e', min: [1.1, 0, Z1 + 9.8], max: [14.2, 1.1, Z1 + 10], surface: 'wood' }
]

// ---------------------------------------------------------------------------
// Tables — top plus four legs, generated so the legs always line up with the top
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
  { id: 'lr-coffee-table', min: [4.3, 2.0], max: [5.55, 3.4], topY: 0.42, topT: 0.07, surface: 'darkWood', legSurface: 'darkWood', legT: 0.07 },
  { id: 'kitchen-table', min: [3.2, -3.6], max: [5.2, -2.0], topY: 0.75, topT: 0.06, surface: 'wood', legSurface: 'wood', legT: 0.08 },
  { id: 'bd-desk', min: [X0 + 0.3, -0.5], max: [X0 + 1.9, 0.35], topY: 0.75, topT: 0.05, surface: 'wood', legSurface: 'metal', legT: 0.05 }
]

// ---------------------------------------------------------------------------
// Chairs, windows, plants, props
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
  { id: 'kt-chair-n1', at: [3.7, -4.15], yaw: Math.PI, surface: 'wood' },
  { id: 'kt-chair-n2', at: [4.7, -4.15], yaw: Math.PI, surface: 'wood' },
  { id: 'kt-chair-s1', at: [3.7, -1.45], yaw: 0, surface: 'wood' },
  { id: 'kt-chair-s2', at: [4.7, -1.45], yaw: 0, surface: 'wood' },
  { id: 'bd-desk-chair', at: [X0 + 1.1, -0.95], yaw: Math.PI, surface: 'darkWood' }
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
  { id: 'win-lr-east', at: [X1, 1.55, 4.8], facing: '-x', width: 1.5, height: 1.3 },
  { id: 'win-front-lr', at: [6.6, 1.55, Z1], facing: '-z', width: 1.2, height: 1.2 },
  { id: 'win-kitchen-north', at: [3.0, 1.55, Z0], facing: '+z', width: 1.3, height: 1.0 },
  { id: 'win-bedroom-west', at: [X0, 1.55, -1.5], facing: '+x', width: 1.4, height: 1.2 },
  { id: 'win-bedroom-north', at: [X0 + 1.3, 1.55, Z0], facing: '+z', width: 1.2, height: 1.2 },
  { id: 'win-bathroom-west', at: [X0, 1.75, 2.4], facing: '+x', width: 0.9, height: 0.8 },
  { id: 'win-front-bath', at: [-3.5, 1.55, Z1], facing: '-z', width: 1.1, height: 1.0 }
]

export interface PlantSpec {
  id: string
  at: [number, number]
  scale: number
}

export const PLANTS: PlantSpec[] = [
  { id: 'plant-lr', at: [2.0, 0.2], scale: 1.0 },
  { id: 'plant-hall', at: [HALL_E_HALL - 0.25, -2.0], scale: 0.8 },
  { id: 'plant-bath', at: [HALL_W_ROOM - 0.55, 5.5], scale: 0.7 }
]

export interface TreeSpec {
  id: string
  at: [number, number]
  scale: number
}

export const TREES: TreeSpec[] = [
  { id: 'tree-1', at: [-10.5, 11.0], scale: 1.0 },
  { id: 'tree-2', at: [10.0, 12.5], scale: 1.25 },
  { id: 'tree-3', at: [-11.5, -4.0], scale: 0.9 },
  { id: 'tree-4', at: [11.2, -7.0], scale: 1.1 }
]

/** Floor lamps: pole plus shade, built in code. */
export const LAMPS: { id: string; at: [number, number] }[] = [
  { id: 'lamp-lr', at: [X1 - 0.5, 0.5] },
  { id: 'lamp-bd', at: [HALL_W_ROOM - 0.5, 0.15] }
]

// ---------------------------------------------------------------------------
// Placements referenced by id in §1's required-id table
// ---------------------------------------------------------------------------

/** Spawn is on the path outside the front door, looking at it (§2 scope note). */
export const SPAWN_POSITION: [number, number, number] = [0, 1.6, Z1 + 4.5]
export const SPAWN_LOOK_AT: [number, number] = [0, Z1]

export const JUG_POSITION: [number, number, number] = [3.7, 0.9, Z0 + 0.33]
export const LIVING_ROOM_WALL_ANCHOR: [number, number, number] = [X1 - 0.06, 1.78, 2.6]
export const LIVING_ROOM_WALL_YAW = -Math.PI / 2
export const BEDSIDE_FRAME_ANCHOR: [number, number, number] = [X0 + 0.25, 0.55, -2.15]
export const BEDSIDE_FRAME_YAW = 0.35
export const AUDIO_SOURCE_ANCHOR: [number, number, number] = [3.7, 0.5, Z1 - 0.25]

/** Small dressing props: id, position, kind. Built in code. */
export const PROPS: { id: string; at: [number, number, number]; kind: string }[] = [
  { id: 'fruit-bowl', at: [1.95, 0.9, Z0 + 0.33], kind: 'bowl' },
  { id: 'kettle', at: [4.85, 0.95, Z0 + 0.32], kind: 'kettle' },
  { id: 'mug-1', at: [3.9, 0.75, -2.9], kind: 'mug' },
  { id: 'mug-2', at: [4.5, 0.75, -2.9], kind: 'mug' },
  { id: 'basin', at: [X0 + 2.97, 0.93, WEST_DIV_S + 0.33], kind: 'basin' },
  { id: 'toilet', at: [X0 + 0.5, 0, 1.6], kind: 'toilet' },
  { id: 'laundry-basket', at: [HALL_W_ROOM - 1.4, 0, 5.6], kind: 'basket' },
  { id: 'lr-vase', at: [4.9, 0.42, 2.7], kind: 'vase' },
  { id: 'hall-bowl', at: [HALL_W_HALL + 0.2, 0.8, -0.1], kind: 'bowl' },
  { id: 'tub-tap', at: [X0 + 0.1, 0.58, 4.6], kind: 'tap' }
]
