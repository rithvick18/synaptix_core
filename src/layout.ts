/**
 * SPEC.md §3 — layout: blockers, triggers, anchors, ids.
 *
 * Pure data. `proceduralHouse.ts` turns these into meshes and Box3 blockers so the
 * collision volumes and the visible geometry can never drift apart: every solid is
 * described once, here, as an axis-aligned world-space box.
 *
 * Units are metres. Interior floor spans x ∈ [-5, 5], z ∈ [-4, 4], ceiling at 2.8 m.
 * The divider wall sits at x = 0 with a 1.4 m wide, 2.1 m tall doorway at z ∈ [-0.7, 0.7].
 */

export const CEILING_HEIGHT = 2.8
export const WALL_T = 0.2
export const DOOR_HALF_WIDTH = 0.7
export const DOOR_HEIGHT = 2.1

export type Surface = 'wall' | 'floor' | 'wood' | 'stone' | 'metal' | 'fabric'

export interface SolidSpec {
  id: string
  min: [number, number, number]
  max: [number, number, number]
  surface: Surface
  /** Solids are blockers unless explicitly opted out (e.g. the doorway lintel overhead). */
  blocking?: boolean
  castShadow?: boolean
}

/** Walls, including the two divider segments and the lintel over the doorway. */
export const WALLS: SolidSpec[] = [
  { id: 'wall-west', min: [-5.2, 0, -4.2], max: [-5.0, CEILING_HEIGHT, 4.2], surface: 'wall' },
  { id: 'wall-east', min: [5.0, 0, -4.2], max: [5.2, CEILING_HEIGHT, 4.2], surface: 'wall' },
  { id: 'wall-north', min: [-5.2, 0, -4.2], max: [5.2, CEILING_HEIGHT, -4.0], surface: 'wall' },
  { id: 'wall-south', min: [-5.2, 0, 4.0], max: [5.2, CEILING_HEIGHT, 4.2], surface: 'wall' },
  { id: 'divider-north', min: [-0.1, 0, -4.0], max: [0.1, CEILING_HEIGHT, -DOOR_HALF_WIDTH], surface: 'wall' },
  { id: 'divider-south', min: [-0.1, 0, DOOR_HALF_WIDTH], max: [0.1, CEILING_HEIGHT, 4.0], surface: 'wall' },
  {
    id: 'divider-lintel',
    min: [-0.1, DOOR_HEIGHT, -DOOR_HALF_WIDTH],
    max: [0.1, CEILING_HEIGHT, DOOR_HALF_WIDTH],
    surface: 'wall',
    // Above head height: a blocker here would occlude nothing and block nothing,
    // but keeping it out of `blockers` keeps the occlusion loop honest.
    blocking: false
  }
]

/** Furniture. Every entry is both a drawn box and a collision blocker. */
export const FURNITURE: SolidSpec[] = [
  // Living room
  { id: 'sofa-base', min: [-4.65, 0, -1.1], max: [-3.75, 0.45, 1.1], surface: 'fabric', castShadow: true },
  { id: 'sofa-back', min: [-4.95, 0.45, -1.1], max: [-4.6, 0.95, 1.1], surface: 'fabric', castShadow: true },
  { id: 'coffee-table', min: [-3.3, 0.3, -0.35], max: [-2.3, 0.45, 0.35], surface: 'wood', castShadow: true },
  { id: 'side-table', min: [-4.55, 0, -2.85], max: [-4.05, 0.6, -2.35], surface: 'wood', castShadow: true },
  { id: 'bookshelf', min: [-5.0, 0, 2.2], max: [-4.6, 1.9, 3.6], surface: 'wood', castShadow: true },

  // Kitchen
  { id: 'counter', min: [3.8, 0, -2.0], max: [5.0, 0.9, 2.0], surface: 'stone', castShadow: true },
  { id: 'cabinets', min: [1.0, 0, -4.0], max: [3.0, 0.9, -3.2], surface: 'wood', castShadow: true },
  { id: 'fridge', min: [0.6, 0, 3.2], max: [1.4, 1.8, 4.0], surface: 'metal', castShadow: true },
  { id: 'kitchen-table', min: [1.6, 0.6, 0.6], max: [3.2, 0.75, 2.2], surface: 'wood', castShadow: true }
]

export interface RoomSpec {
  id: string
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * Trigger volumes. They overlap in the doorway on purpose (§1: "overlapping, fire on
 * entry"); `roomOf` resolves the overlap deterministically by declaration order.
 */
export const ROOMS: RoomSpec[] = [
  { id: 'livingRoom', min: [-5.0, 0, -4.0], max: [0.2, CEILING_HEIGHT, 4.0] },
  { id: 'kitchen', min: [-0.2, 0, -4.0], max: [5.0, CEILING_HEIGHT, 4.0] }
]

/** Where the player starts: living room, looking towards the kitchen doorway. */
export const SPAWN_POSITION: [number, number, number] = [-3.4, 1.6, 2.2]
export const SPAWN_LOOK_AT: [number, number] = [0, 0] // x, z — the doorway

/** Prop placements referenced by id in §1's required-id table. */
export const JUG_POSITION: [number, number, number] = [4.3, 0.9, -0.55]
export const DOORWAY_CENTRE: [number, number, number] = [0, DOOR_HEIGHT / 2, 0]
export const LIVING_ROOM_WALL_ANCHOR: [number, number, number] = [-4.98, 1.65, -1.9]
export const BEDSIDE_FRAME_ANCHOR: [number, number, number] = [-4.3, 0.6, -2.6]
export const AUDIO_SOURCE_ANCHOR: [number, number, number] = [-2.8, 0.45, 0]
