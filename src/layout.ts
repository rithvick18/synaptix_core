/**
 * SPEC.md §3 / §11 — the dimensions every house template is built against.
 *
 * The house itself is no longer here: each template's rooms, walls, openings and
 * furniture live in `src/templates/<id>.ts`, and `proceduralHouse.ts` turns any of them
 * into a world. What stays is what is true of every template — the player's collider,
 * which every doorway is sized against, and the storey and wall dimensions §11.4 fixes
 * for all of them.
 *
 * Units are metres.
 */

export type { Surface } from './templates/types'

/** Single-storey, 2.7 m, in every template (§11.4). */
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
