/**
 * SPEC.md §11.4 — `courtyard`: rooms on either side of an open central courtyard, with
 * a verandah along the rooms' courtyard faces and across the back.
 *
 * Loosely based on common Northeast Indian homes: the caregiver picks it as the closest
 * shape, not as an accurate model of their home (§11).
 *
 * Written relative to its wall constants, like every template (§1.1).
 *
 *              z = Z0  (back)
 *   +-----------+-------------------+-----------+
 *   |           |  :   verandah  :  |           |
 *   |  bedroom  |  o - - o - - - o  |  kitchen  |
 *   |           |  :             :  +--(arch)---+  z = KL
 *   +-----------+  o  courtyard  o  |           |
 *   | bathroom  |  :   (no roof) :  | livingRoom|
 *   +-----------+  o             o  |           |
 *   |   store   |  :             :  |           |
 *   +-----------+-------^-----------+-----------+
 *   x = X0     W_IN  front door    E_IN        x = X1
 *
 * The verandah and the courtyard are not rooms. A room gets a ceiling and a ceiling
 * light from the generator, and the courtyard has neither; the verandah is roofed by
 * the exterior roof sections and floored by a slab. `roomOf` is null in both, which is
 * what it is outside the house as well.
 *
 * Roles (§11.2): `livingArch` and `kitchenDoor` open off the east verandah; `kitchenArch`
 * joins the kitchen and the living room directly, inside the east range.
 */
import { ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T } from '../layout'
import { hallway } from './hallway'
import type { OpeningSpec, SolidSpec, Template } from './types'

/** Interior extents. */
const X0 = -8.0
const X1 = 8.0
const Z0 = -7.0
const Z1 = 6.0

/** Interior wall centrelines. */
const W_IN = -3.6 // west range | verandah
const E_IN = 3.6 // verandah | east range
const BED_BATH = -0.6 // bedroom | bathroom
const BATH_STORE = 2.6 // bathroom | store room
const KL = -0.8 // kitchen | living room

/** The verandah's courtyard edge: its posts stand on these lines. */
const VX = 2.0
const VZ = -5.4
const POST = 0.18

/** Exterior wall centrelines. */
const EXT_N = Z0 - EXT_WALL_T / 2
const EXT_S = Z1 + EXT_WALL_T / 2
const EXT_W = X0 - EXT_WALL_T / 2
const EXT_E = X1 + EXT_WALL_T / 2

/** Interior wall faces. */
const H = INT_WALL_T / 2
const W_ROOM = W_IN - H // west range side
const W_VER = W_IN + H // verandah side
const E_ROOM = E_IN + H // east range side
const E_VER = E_IN - H // verandah side
const BED_BATH_S = BED_BATH + H // bathroom side
const BATH_STORE_N = BATH_STORE - H // bathroom side

/** The tub runs along the bathroom's north wall. */
const TUB_N = BED_BATH_S
const TUB_S = 1.2

const OPENINGS: OpeningSpec[] = [
  { id: 'frontDoor', label: 'front door', kind: 'door', axis: 'x', at: EXT_S, from: -0.55, to: 0.55,
    height: 2.1, thickness: EXT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenDoor', label: 'kitchen door', kind: 'door', axis: 'z', at: E_IN,
    from: -4.4, to: -3.4, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'livingArch', label: 'living room arch', kind: 'arch', axis: 'z', at: E_IN,
    from: 1.5, to: 3.3, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenArch', label: 'kitchen arch', kind: 'arch', axis: 'x', at: KL,
    from: 5.0, to: 6.6, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'bedroomDoor', label: 'bedroom door', kind: 'door', axis: 'z', at: W_IN,
    from: -3.8, to: -2.8, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'bathroomDoor', label: 'bathroom door', kind: 'door', axis: 'z', at: W_IN,
    from: 0.5, to: 1.5, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'storeDoor', label: 'store room door', kind: 'door', axis: 'z', at: W_IN,
    from: 3.8, to: 4.8, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'to', swing: 1 }
]

/** A verandah post, floor to roof, centred on (x, z). */
const post = (id: string, x: number, z: number): SolidSpec => ({
  id, min: [x - POST / 2, 0, z - POST / 2], max: [x + POST / 2, CEILING_HEIGHT, z + POST / 2],
  surface: 'darkWood', castShadow: true
})

export const courtyard: Template = {
  id: 'courtyard',
  name: 'Courtyard',
  description: 'Rooms on two sides of an open courtyard, joined by a covered verandah.',
  version: 1,

  rooms: [
    { id: 'kitchen', min: [E_IN, 0, Z0], max: [X1, CEILING_HEIGHT, KL], floor: 'tileFloor' },
    { id: 'livingRoom', min: [E_IN, 0, KL], max: [X1, CEILING_HEIGHT, Z1], floor: 'woodFloor' },
    { id: 'bedroom', min: [X0, 0, Z0], max: [W_IN, CEILING_HEIGHT, BED_BATH], floor: 'woodFloor' },
    { id: 'bathroom', min: [X0, 0, BED_BATH], max: [W_IN, CEILING_HEIGHT, BATH_STORE], floor: 'tileFloor' },
    { id: 'storeRoom', min: [X0, 0, BATH_STORE], max: [W_IN, CEILING_HEIGHT, Z1], floor: 'woodFloor' }
  ],

  walls: [
    { id: 'ext-north', axis: 'x', at: EXT_N, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-south', axis: 'x', at: EXT_S, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-west', axis: 'z', at: EXT_W, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-east', axis: 'z', at: EXT_E, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },

    { id: 'west-in', axis: 'z', at: W_IN, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'east-in', axis: 'z', at: E_IN, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'bed-bath', axis: 'x', at: BED_BATH, from: X0, to: W_IN, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'bath-store', axis: 'x', at: BATH_STORE, from: X0, to: W_IN, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'kitchen-div', axis: 'x', at: KL, from: E_IN, to: X1, thickness: INT_WALL_T, surface: 'wall' }
  ],

  openings: OPENINGS,
  frontDoor: 'frontDoor',

  furniture: [
    // ---- Verandah: a raised slab under the roof, and its posts on the courtyard edge ----
    { id: 'verandah-west', min: [W_VER, 0, Z0], max: [-VX + POST / 2, 0.03, Z1], surface: 'concrete' },
    { id: 'verandah-east', min: [VX - POST / 2, 0, Z0], max: [E_VER, 0.03, Z1], surface: 'concrete' },
    { id: 'verandah-north', min: [-VX + POST / 2, 0, Z0], max: [VX - POST / 2, 0.03, VZ + POST / 2], surface: 'concrete' },
    post('post-nw', -VX, VZ), post('post-n', 0, VZ), post('post-ne', VX, VZ),
    post('post-w1', -VX, -2.9), post('post-w2', -VX, -0.4), post('post-w3', -VX, 2.1), post('post-w4', -VX, 4.6),
    post('post-e1', VX, -2.9), post('post-e2', VX, -0.4), post('post-e3', VX, 2.1), post('post-e4', VX, 4.6),

    // ---- Living room: x [E_ROOM, X1], z [KL + H, Z1] ----
    { id: 'lr-rug', min: [4.6, 0, 1.4], max: [6.8, 0.012, 3.8], surface: 'accent' },
    { id: 'sofa-base', min: [X1 - 1.0, 0, 1.2], max: [X1, 0.42, 3.8], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-back', min: [X1 - 0.25, 0.42, 1.2], max: [X1, 1.0, 3.8], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-arm-n', min: [X1 - 1.0, 0.42, 1.2], max: [X1, 0.7, 1.42], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-arm-s', min: [X1 - 1.0, 0.42, 3.58], max: [X1, 0.7, 3.8], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-cushion-1', min: [X1 - 0.97, 0.42, 1.52], max: [X1 - 0.25, 0.54, 2.47], surface: 'fabric', soft: true },
    { id: 'sofa-cushion-2', min: [X1 - 0.97, 0.42, 2.57], max: [X1 - 0.25, 0.54, 3.52], surface: 'fabric', soft: true },
    { id: 'tv-unit', min: [4.4, 0, Z1 - 0.45], max: [6.6, 0.5, Z1], surface: 'darkWood', castShadow: true },
    { id: 'tv-screen', min: [4.9, 0.55, Z1 - 0.23], max: [6.4, 1.4, Z1 - 0.15], surface: 'dark', castShadow: true },

    // ---- Kitchen: x [E_ROOM, X1], z [Z0, KL_N] ----
    { id: 'counter-north', min: [E_ROOM, 0, Z0], max: [X1, 0.9, Z0 + 0.65], surface: 'counter', castShadow: true },
    { id: 'counter-east', min: [X1 - 0.75, 0, Z0 + 0.65], max: [X1, 0.9, Z0 + 3.0], surface: 'counter', castShadow: true },
    { id: 'upper-cab', min: [E_ROOM, 1.5, Z0], max: [5.2, 2.2, Z0 + 0.33], surface: 'wood', castShadow: true },
    { id: 'sink-basin', min: [4.0, 0.82, Z0 + 0.13], max: [4.9, 0.91, Z0 + 0.53], surface: 'metal' },
    { id: 'stove-top', min: [6.0, 0.9, Z0 + 0.07], max: [6.95, 0.95, Z0 + 0.57], surface: 'dark' },
    { id: 'extractor', min: [6.0, 1.68, Z0], max: [6.95, 2.1, Z0 + 0.45], surface: 'metal', castShadow: true },
    { id: 'fridge', min: [E_ROOM, 0, Z0 + 0.65], max: [E_ROOM + 0.76, 1.85, Z0 + 1.45], surface: 'white', castShadow: true },
    { id: 'fridge-handle', min: [E_ROOM + 0.76, 0.9, Z0 + 0.8], max: [E_ROOM + 0.81, 1.6, Z0 + 0.87], surface: 'metal' },

    // ---- Bedroom: x [X0, W_ROOM], z [Z0, BED_BATH - H] ----
    { id: 'bd-rug', min: [X0 + 1.3, 0, -2.6], max: [X0 + 3.4, 0.012, -1.0], surface: 'accent' },
    { id: 'headboard', min: [X0, 0, -4.6], max: [X0 + 0.14, 1.15, -2.5], surface: 'darkWood', castShadow: true },
    { id: 'bed-frame', min: [X0 + 0.08, 0, -4.5], max: [X0 + 2.3, 0.34, -2.6], surface: 'darkWood', castShadow: true },
    { id: 'mattress', min: [X0 + 0.1, 0.34, -4.46], max: [X0 + 2.24, 0.64, -2.64], surface: 'white', castShadow: true, soft: true },
    { id: 'duvet', min: [X0 + 0.95, 0.64, -4.46], max: [X0 + 2.24, 0.75, -2.64], surface: 'fabricWarm', soft: true },
    { id: 'pillow-1', min: [X0 + 0.16, 0.64, -4.32], max: [X0 + 0.58, 0.78, -3.74], surface: 'white', soft: true },
    { id: 'pillow-2', min: [X0 + 0.16, 0.64, -3.44], max: [X0 + 0.58, 0.78, -2.86], surface: 'white', soft: true },
    { id: 'bedside-table', min: [X0, 0, -2.4], max: [X0 + 0.5, 0.55, -1.9], surface: 'wood', castShadow: true },
    { id: 'wardrobe', min: [X0 + 1.4, 0, Z0], max: [X0 + 3.25, 2.15, Z0 + 0.7], surface: 'wood', castShadow: true },
    { id: 'wardrobe-handle-l', min: [X0 + 2.28, 1.0, Z0 + 0.66], max: [X0 + 2.33, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'wardrobe-handle-r', min: [X0 + 2.38, 1.0, Z0 + 0.66], max: [X0 + 2.43, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'dresser', min: [W_ROOM - 0.5, 0, -1.8], max: [W_ROOM, 0.9, -0.8], surface: 'wood', castShadow: true },

    // ---- Bathroom: x [X0, W_ROOM], z [BED_BATH_S, BATH_STORE_N] ----
    { id: 'tub-rim-w', min: [X0, 0, TUB_N], max: [X0 + 0.14, 0.58, TUB_S], surface: 'white', castShadow: true },
    { id: 'tub-rim-e', min: [X0 + 1.76, 0, TUB_N], max: [X0 + 1.9, 0.58, TUB_S], surface: 'white', castShadow: true },
    { id: 'tub-rim-n', min: [X0, 0, TUB_N], max: [X0 + 1.9, 0.58, TUB_N + 0.14], surface: 'white', castShadow: true },
    { id: 'tub-rim-s', min: [X0, 0, TUB_S - 0.14], max: [X0 + 1.9, 0.58, TUB_S], surface: 'white', castShadow: true },
    { id: 'tub-base', min: [X0 + 0.14, 0, TUB_N + 0.14], max: [X0 + 1.76, 0.12, TUB_S - 0.14], surface: 'white' },
    { id: 'tub-water', min: [X0 + 0.14, 0.12, TUB_N + 0.14], max: [X0 + 1.76, 0.36, TUB_S - 0.14], surface: 'glass' },
    { id: 'vanity', min: [X0 + 2.4, 0, BATH_STORE_N - 0.63], max: [X0 + 3.6, 0.86, BATH_STORE_N], surface: 'wood', castShadow: true },
    { id: 'vanity-top', min: [X0 + 2.35, 0.86, BATH_STORE_N - 0.68], max: [X0 + 3.65, 0.93, BATH_STORE_N + 0.02], surface: 'counter' },
    { id: 'mirror', min: [X0 + 2.45, 1.15, BATH_STORE_N - 0.03], max: [X0 + 3.55, 1.85, BATH_STORE_N], surface: 'mirror', blocking: false },
    { id: 'bath-mat', min: [X0 + 2.1, 0, 0.0], max: [X0 + 3.1, 0.014, 1.0], surface: 'fabric', soft: true },
    { id: 'toilet-blocker', min: [X0 + 0.15, 0, 1.69], max: [X0 + 0.8, 0.75, 2.21], surface: 'white', invisible: true },

    // ---- Store room: x [X0, W_ROOM], z [BATH_STORE + H, Z1] ----
    { id: 'store-shelf', min: [X0, 0, 3.0], max: [X0 + 0.45, 1.9, 5.6], surface: 'wood', castShadow: true },
    { id: 'store-shelf-jars', min: [X0 + 0.04, 1.0, 3.2], max: [X0 + 0.4, 1.25, 5.4], surface: 'accent' },
    { id: 'rice-sack-1', min: [X0 + 0.7, 0, Z1 - 0.6], max: [X0 + 1.25, 0.62, Z1 - 0.05], surface: 'fabricWarm', castShadow: true },
    { id: 'rice-sack-2', min: [X0 + 1.35, 0, Z1 - 0.6], max: [X0 + 1.9, 0.55, Z1 - 0.05], surface: 'fabricWarm', castShadow: true }
  ],

  tables: [
    { id: 'lr-coffee-table', min: [5.0, 1.8], max: [6.2, 3.2], topY: 0.42, topT: 0.07, surface: 'darkWood', legSurface: 'darkWood', legT: 0.07 },
    { id: 'kitchen-table', min: [5.0, -3.4], max: [6.4, -2.2], topY: 0.75, topT: 0.06, surface: 'wood', legSurface: 'wood', legT: 0.08 }
  ],

  chairs: [
    { id: 'kt-chair-n1', at: [5.35, -3.95], yaw: Math.PI, surface: 'wood' },
    { id: 'kt-chair-n2', at: [6.05, -3.95], yaw: Math.PI, surface: 'wood' },
    { id: 'kt-chair-e', at: [6.95, -2.8], yaw: Math.PI / 2, surface: 'wood' }
  ],

  windows: [
    { id: 'win-lr-front', at: [7.3, 1.55, Z1], facing: '-z', width: 0.9, height: 1.2 },
    { id: 'win-lr-east', at: [X1, 1.55, 5.0], facing: '-x', width: 0.9, height: 1.2 },
    { id: 'win-kitchen-east', at: [X1, 1.55, -5.0], facing: '-x', width: 1.2, height: 1.0 },
    { id: 'win-bedroom-west', at: [X0, 1.55, -1.3], facing: '+x', width: 1.2, height: 1.2 },
    { id: 'win-bedroom-north', at: [-7.2, 1.55, Z0], facing: '+z', width: 0.9, height: 1.1 },
    { id: 'win-bathroom-west', at: [X0, 1.75, 0.3], facing: '+x', width: 0.8, height: 0.8 },
    { id: 'win-store-front', at: [-6.0, 1.6, Z1], facing: '-z', width: 0.9, height: 0.8 }
  ],

  plants: [
    { id: 'plant-courtyard', at: [0, 0], scale: 1.3 },
    { id: 'plant-lr', at: [7.55, 4.9], scale: 0.9 },
    { id: 'plant-verandah', at: [-2.5, -6.5], scale: 0.8 }
  ],

  lamps: [
    { id: 'lamp-lr', at: [4.1, 5.4] },
    { id: 'lamp-bd', at: [W_ROOM - 0.54, -6.6] }
  ],

  props: [
    { id: 'fruit-bowl', at: [4.3, 0.9, Z0 + 0.33], kind: 'bowl' },
    { id: 'kettle', at: [6.45, 0.95, Z0 + 0.32], kind: 'kettle' },
    { id: 'mug-1', at: [5.4, 0.75, -2.8], kind: 'mug' },
    { id: 'mug-2', at: [6.0, 0.75, -2.8], kind: 'mug' },
    // Against the south wall, so its tap is turned to face it (`basin` faces along Z).
    { id: 'basin', at: [X0 + 3.0, 0.93, BATH_STORE_N - 0.33], kind: 'basin', yaw: Math.PI },
    { id: 'toilet', at: [X0 + 0.5, 0, 1.95], kind: 'toilet' },
    { id: 'store-basket-1', at: [X0 + 2.4, 0, Z1 - 0.35], kind: 'basket' },
    { id: 'store-basket-2', at: [X0 + 1.0, 0, 3.15], kind: 'basket' },
    { id: 'lr-vase', at: [5.6, 0.42, 2.5], kind: 'vase' },
    { id: 'tub-tap', at: [X0 + 0.1, 0.58, 0.3], kind: 'tap' }
  ],

  mounts: {
    waterJug: { at: [5.4, 0.9, Z0 + 0.33], yaw: Math.PI },
    // Above the sofa on the east wall, facing west into the room, as in `hallway`.
    livingRoomWall: { at: [X1 - 0.06, 1.78, 1.9], yaw: Math.PI },
    eventFrame: { at: [X1 - 0.06, 1.78, 1.9 + 1.2], yaw: Math.PI },
    bedsideFrame: { at: [X0 + 0.25, 0.55 + 0.17, -2.15], yaw: 0.35 },
    // West end of the television unit, which stands beside the front window.
    audioSource: { at: [4.62, 0.5, Z1 - 0.28], yaw: 0 }
  },

  spawn: { position: [0, 1.6, Z1 + 4.5], lookAt: [0, Z1] },

  exterior: [
    { id: 'porch-slab', min: [-2.8, 0, Z1 + EXT_WALL_T], max: [2.8, 0.06, Z1 + 2.5], surface: 'concrete' },
    { id: 'porch-post-w', min: [-2.7, 0, Z1 + 2.2], max: [-2.46, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
    { id: 'porch-post-e', min: [2.46, 0, Z1 + 2.2], max: [2.7, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
    { id: 'porch-roof', min: [-2.92, 2.55, Z1 + EXT_WALL_T], max: [2.92, 2.7, Z1 + 2.6], surface: 'wall', blocking: false, castShadow: true },
    { id: 'path', min: [-0.9, 0, Z1 + 2.5], max: [0.9, 0.04, Z1 + 8.0], surface: 'concrete' },
    // Three roof sections — over each range and its verandah, and across the back —
    // leaving the courtyard open to the sky.
    { id: 'roof-west', min: [X0 - 0.6, CEILING_HEIGHT, Z0 - 0.6], max: [-VX + POST / 2, CEILING_HEIGHT + 0.26, Z1 + 0.6], surface: 'wall', blocking: false, castShadow: true },
    { id: 'roof-east', min: [VX - POST / 2, CEILING_HEIGHT, Z0 - 0.6], max: [X1 + 0.6, CEILING_HEIGHT + 0.26, Z1 + 0.6], surface: 'wall', blocking: false, castShadow: true },
    { id: 'roof-north', min: [-VX + POST / 2, CEILING_HEIGHT, Z0 - 0.6], max: [VX - POST / 2, CEILING_HEIGHT + 0.26, VZ + POST / 2], surface: 'wall', blocking: false, castShadow: true }
  ],

  garden: hallway.garden
}
