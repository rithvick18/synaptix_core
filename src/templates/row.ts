/**
 * SPEC.md §11.4 — `row`: a linear house. The front room, the living room and the
 * kitchen follow one another from the street to the back; a side passage runs the
 * whole depth beside them, with the bedroom and the bathroom off it.
 *
 * Written relative to its wall constants, like every template (§1.1).
 *
 *              z = Z0  (back)
 *   +-----------+---+-----------------------+
 *   |           | p |       kitchen         |
 *   |  bedroom  | a +-------( arch )--------+  z = LK
 *   |           | s |     livingRoom        |
 *   +-----------+ s +-------( arch )--------+  z = FR
 *   | bathroom  | a |     frontRoom         |
 *   |           | g |                       |
 *   +-----------+-e-+---^-------------------+
 *     x = X0   PASS_W  MAIN_W  front door   x = X1
 *
 * Roles (§11.2): `livingArch` is the arch from the front room into the living room;
 * `kitchenArch` joins the living room and the kitchen directly; `kitchenDoor` is the
 * door from the side passage into the kitchen. Spawn reaches the kitchen either way.
 */
import { ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T } from '../layout'
import { hallway } from './hallway'
import type { OpeningSpec, Template } from './types'

/** Interior extents. */
const X0 = -6.2
const X1 = 6.0
const Z0 = -6.5
const Z1 = 5.5

/** Interior wall centrelines. */
const PASS_W = -2.6 // side rooms | passage
const MAIN_W = -1.0 // passage | front room, living room, kitchen
const FR = 2.2 // front room | living room
const LK = -2.0 // living room | kitchen
const SIDE = 0.5 // bedroom | bathroom

/** Exterior wall centrelines. */
const EXT_N = Z0 - EXT_WALL_T / 2
const EXT_S = Z1 + EXT_WALL_T / 2
const EXT_W = X0 - EXT_WALL_T / 2
const EXT_E = X1 + EXT_WALL_T / 2

/** Interior wall faces. */
const H = INT_WALL_T / 2
const MAIN_ROOM = MAIN_W + H // front room / living room / kitchen side
const PASS_ROOM = PASS_W - H // bedroom / bathroom side
const LK_N = LK - H // kitchen side
const SIDE_S = SIDE + H // bathroom side

const OPENINGS: OpeningSpec[] = [
  { id: 'frontDoor', label: 'front door', kind: 'door', axis: 'x', at: EXT_S, from: -0.55, to: 0.55,
    height: 2.1, thickness: EXT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'livingArch', label: 'living room arch', kind: 'arch', axis: 'x', at: FR,
    from: 1.2, to: 3.4, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenArch', label: 'kitchen arch', kind: 'arch', axis: 'x', at: LK,
    from: 0.4, to: 2.0, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'passageArch', label: 'passage arch', kind: 'arch', axis: 'z', at: MAIN_W,
    from: 3.1, to: 4.3, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenDoor', label: 'kitchen door', kind: 'door', axis: 'z', at: MAIN_W,
    from: -4.7, to: -3.7, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'bedroomDoor', label: 'bedroom door', kind: 'door', axis: 'z', at: PASS_W,
    from: -1.8, to: -0.8, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'bathroomDoor', label: 'bathroom door', kind: 'door', axis: 'z', at: PASS_W,
    from: 1.5, to: 2.5, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'to', swing: 1 }
]

export const row: Template = {
  id: 'row',
  name: 'Rooms in a row',
  description: 'Front room, living room and kitchen one behind another, with a side passage to the bedroom and bathroom.',
  version: 1,

  rooms: [
    { id: 'kitchen', min: [MAIN_W, 0, Z0], max: [X1, CEILING_HEIGHT, LK], floor: 'tileFloor' },
    { id: 'livingRoom', min: [MAIN_W, 0, LK], max: [X1, CEILING_HEIGHT, FR], floor: 'woodFloor' },
    { id: 'frontRoom', min: [MAIN_W, 0, FR], max: [X1, CEILING_HEIGHT, Z1], floor: 'woodFloor' },
    { id: 'bedroom', min: [X0, 0, Z0], max: [PASS_W, CEILING_HEIGHT, SIDE], floor: 'woodFloor' },
    { id: 'bathroom', min: [X0, 0, SIDE], max: [PASS_W, CEILING_HEIGHT, Z1], floor: 'tileFloor' },
    { id: 'passage', min: [PASS_W - 0.1, 0, Z0], max: [MAIN_W + 0.1, CEILING_HEIGHT, Z1], floor: 'woodFloor' }
  ],

  walls: [
    { id: 'ext-north', axis: 'x', at: EXT_N, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-south', axis: 'x', at: EXT_S, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-west', axis: 'z', at: EXT_W, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-east', axis: 'z', at: EXT_E, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },

    { id: 'main-west', axis: 'z', at: MAIN_W, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'pass-west', axis: 'z', at: PASS_W, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'front-div', axis: 'x', at: FR, from: MAIN_W, to: X1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'kitchen-div', axis: 'x', at: LK, from: MAIN_W, to: X1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'side-div', axis: 'x', at: SIDE, from: X0, to: PASS_W, thickness: INT_WALL_T, surface: 'wall' }
  ],

  openings: OPENINGS,
  frontDoor: 'frontDoor',

  furniture: [
    // ---- Front room: x [MAIN_ROOM, X1], z [FR + H, Z1] ----
    { id: 'fr-rug', min: [1.0, 0, 3.2], max: [3.6, 0.012, 4.8], surface: 'accent' },
    { id: 'fr-bench', min: [X1 - 0.5, 0, 3.3], max: [X1, 0.45, 4.8], surface: 'wood', castShadow: true },
    { id: 'fr-console', min: [4.2, 0, FR + H], max: [5.4, 0.8, FR + H + 0.4], surface: 'wood', castShadow: true },
    { id: 'coat-board', min: [MAIN_ROOM, 1.45, 4.55], max: [MAIN_ROOM + 0.16, 1.75, 5.25], surface: 'darkWood' },

    // ---- Living room: x [MAIN_ROOM, X1], z [LK_S, FR_N] ----
    { id: 'lr-rug', min: [0.5, 0, -1.3], max: [3.1, 0.012, 1.3], surface: 'accent' },
    { id: 'sofa-base', min: [MAIN_ROOM, 0, -1.3], max: [MAIN_ROOM + 1.0, 0.42, 1.3], surface: 'fabric', castShadow: true },
    { id: 'sofa-back', min: [MAIN_ROOM, 0.42, -1.3], max: [MAIN_ROOM + 0.25, 1.0, 1.3], surface: 'fabric', castShadow: true },
    { id: 'sofa-arm-n', min: [MAIN_ROOM, 0.42, -1.3], max: [MAIN_ROOM + 1.0, 0.7, -1.08], surface: 'fabric', castShadow: true },
    { id: 'sofa-arm-s', min: [MAIN_ROOM, 0.42, 1.08], max: [MAIN_ROOM + 1.0, 0.7, 1.3], surface: 'fabric', castShadow: true },
    { id: 'sofa-cushion-1', min: [MAIN_ROOM + 0.25, 0.42, -0.98], max: [MAIN_ROOM + 0.97, 0.54, -0.03], surface: 'fabric' },
    { id: 'sofa-cushion-2', min: [MAIN_ROOM + 0.25, 0.42, 0.03], max: [MAIN_ROOM + 0.97, 0.54, 0.98], surface: 'fabric' },
    { id: 'tv-unit', min: [X1 - 0.45, 0, -0.4], max: [X1, 0.5, 1.9], surface: 'darkWood', castShadow: true },
    { id: 'tv-screen', min: [X1 - 0.23, 0.55, 0.15], max: [X1 - 0.15, 1.4, 1.65], surface: 'dark', castShadow: true },
    { id: 'lr-side-table', min: [MAIN_ROOM, 0, 1.45], max: [MAIN_ROOM + 0.45, 0.52, 1.9], surface: 'wood', castShadow: true },

    // ---- Kitchen: x [MAIN_ROOM, X1], z [Z0, LK_N] ----
    { id: 'counter-north', min: [MAIN_ROOM, 0, Z0], max: [4.4, 0.9, Z0 + 0.65], surface: 'counter', castShadow: true },
    { id: 'counter-east', min: [X1 - 0.75, 0, Z0 + 0.65], max: [X1, 0.9, Z0 + 3.0], surface: 'counter', castShadow: true },
    { id: 'upper-cab', min: [MAIN_ROOM, 1.5, Z0], max: [1.6, 2.2, Z0 + 0.33], surface: 'wood', castShadow: true },
    { id: 'sink-basin', min: [0.3, 0.82, Z0 + 0.13], max: [1.2, 0.91, Z0 + 0.53], surface: 'metal' },
    { id: 'stove-top', min: [2.9, 0.9, Z0 + 0.07], max: [3.85, 0.95, Z0 + 0.57], surface: 'dark' },
    { id: 'extractor', min: [2.9, 1.68, Z0], max: [3.85, 2.1, Z0 + 0.45], surface: 'metal', castShadow: true },
    { id: 'fridge', min: [X1 - 0.8, 0, LK_N - 0.8], max: [X1, 1.85, LK_N], surface: 'white', castShadow: true },
    { id: 'fridge-handle', min: [X1 - 0.85, 0.9, LK_N - 0.65], max: [X1 - 0.8, 1.6, LK_N - 0.58], surface: 'metal' },

    // ---- Bedroom: x [X0, PASS_ROOM], z [Z0, SIDE - H] ----
    { id: 'bd-rug', min: [X0 + 0.9, 0, -2.4], max: [X0 + 2.9, 0.012, -0.6], surface: 'accent' },
    { id: 'headboard', min: [X0, 0, -4.6], max: [X0 + 0.14, 1.15, -2.5], surface: 'darkWood', castShadow: true },
    { id: 'bed-frame', min: [X0 + 0.08, 0, -4.5], max: [X0 + 2.3, 0.34, -2.6], surface: 'darkWood', castShadow: true },
    { id: 'mattress', min: [X0 + 0.1, 0.34, -4.46], max: [X0 + 2.24, 0.64, -2.64], surface: 'white', castShadow: true },
    { id: 'duvet', min: [X0 + 0.95, 0.64, -4.46], max: [X0 + 2.24, 0.75, -2.64], surface: 'fabricWarm' },
    { id: 'pillow-1', min: [X0 + 0.16, 0.64, -4.32], max: [X0 + 0.58, 0.78, -3.74], surface: 'white' },
    { id: 'pillow-2', min: [X0 + 0.16, 0.64, -3.44], max: [X0 + 0.58, 0.78, -2.86], surface: 'white' },
    { id: 'bedside-table', min: [X0, 0, -2.4], max: [X0 + 0.5, 0.55, -1.9], surface: 'wood', castShadow: true },
    { id: 'wardrobe', min: [X0 + 1.4, 0, Z0], max: [X0 + 3.25, 2.15, Z0 + 0.7], surface: 'wood', castShadow: true },
    { id: 'wardrobe-handle-l', min: [X0 + 2.28, 1.0, Z0 + 0.66], max: [X0 + 2.33, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'wardrobe-handle-r', min: [X0 + 2.38, 1.0, Z0 + 0.66], max: [X0 + 2.43, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'dresser', min: [X0, 0, -1.2], max: [X0 + 0.5, 0.9, 0.2], surface: 'wood', castShadow: true },

    // ---- Bathroom: x [X0, PASS_ROOM], z [SIDE_S, Z1] ----
    { id: 'tub-rim-w', min: [X0, 0, Z1 - 2.1], max: [X0 + 0.14, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-rim-e', min: [X0 + 1.76, 0, Z1 - 2.1], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-rim-n', min: [X0, 0, Z1 - 2.1], max: [X0 + 1.9, 0.58, Z1 - 1.96], surface: 'white', castShadow: true },
    { id: 'tub-rim-s', min: [X0, 0, Z1 - 0.19], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-base', min: [X0 + 0.14, 0, Z1 - 1.96], max: [X0 + 1.76, 0.12, Z1 - 0.19], surface: 'white' },
    { id: 'tub-water', min: [X0 + 0.14, 0.12, Z1 - 1.96], max: [X0 + 1.76, 0.36, Z1 - 0.19], surface: 'glass' },
    { id: 'vanity', min: [X0 + 1.3, 0, SIDE_S], max: [X0 + 2.6, 0.86, SIDE_S + 0.63], surface: 'wood', castShadow: true },
    { id: 'vanity-top', min: [X0 + 1.25, 0.86, SIDE_S - 0.02], max: [X0 + 2.65, 0.93, SIDE_S + 0.68], surface: 'counter' },
    { id: 'mirror', min: [X0 + 1.35, 1.15, SIDE_S], max: [X0 + 2.55, 1.85, SIDE_S + 0.03], surface: 'mirror', blocking: false },
    { id: 'towel-rail', min: [PASS_ROOM - 0.06, 1.2, 3.2], max: [PASS_ROOM, 1.26, 3.95], surface: 'metal', blocking: false },
    { id: 'towel', min: [PASS_ROOM - 0.13, 0.62, 3.3], max: [PASS_ROOM - 0.01, 1.22, 3.85], surface: 'fabric', blocking: false },
    { id: 'bath-mat', min: [X0 + 2.0, 0, 3.4], max: [X0 + 3.0, 0.014, 4.4], surface: 'fabric' },
    // Blocker only; the visible toilet is the `toilet` prop below.
    { id: 'toilet-blocker', min: [X0 + 0.15, 0, 1.84], max: [X0 + 0.8, 0.75, 2.36], surface: 'white', invisible: true },

    // ---- Passage: x [PASS_W + H, MAIN_W - H], z [Z0, Z1] ----
    { id: 'passage-runner', min: [-2.2, 0, Z0 + 0.6], max: [-1.4, 0.01, Z1 - 0.6], surface: 'accent' }
  ],

  tables: [
    { id: 'lr-coffee-table', min: [1.2, -0.6], max: [2.4, 0.6], topY: 0.42, topT: 0.07, surface: 'darkWood', legSurface: 'darkWood', legT: 0.07 },
    { id: 'kitchen-table', min: [3.2, -4.4], max: [4.6, -3.2], topY: 0.75, topT: 0.06, surface: 'wood', legSurface: 'wood', legT: 0.08 }
  ],

  chairs: [
    { id: 'kt-chair-n1', at: [3.55, -4.95], yaw: Math.PI, surface: 'wood' },
    { id: 'kt-chair-n2', at: [4.25, -4.95], yaw: Math.PI, surface: 'wood' }
  ],

  windows: [
    { id: 'win-front', at: [3.6, 1.55, Z1], facing: '-z', width: 1.4, height: 1.2 },
    { id: 'win-lr-east', at: [X1, 1.55, -1.1], facing: '-x', width: 1.0, height: 1.2 },
    { id: 'win-kitchen-east', at: [X1, 1.55, -4.8], facing: '-x', width: 1.2, height: 1.0 },
    { id: 'win-kitchen-north', at: [2.2, 1.55, Z0], facing: '+z', width: 1.0, height: 0.9 },
    { id: 'win-bedroom-west', at: [X0, 1.55, -1.3], facing: '+x', width: 1.2, height: 1.2 },
    { id: 'win-bathroom-west', at: [X0, 1.75, 2.1], facing: '+x', width: 0.9, height: 0.8 }
  ],

  plants: [
    { id: 'plant-front', at: [5.5, 5.05], scale: 1.0 },
    { id: 'plant-lr', at: [X1 - 0.35, -1.6], scale: 0.8 },
    { id: 'plant-bath', at: [PASS_ROOM - 0.35, 5.1], scale: 0.7 }
  ],

  lamps: [
    { id: 'lamp-lr', at: [MAIN_ROOM + 0.3, -1.65] },
    { id: 'lamp-bd', at: [PASS_ROOM - 0.35, 0.05] }
  ],

  props: [
    { id: 'fruit-bowl', at: [-0.4, 0.9, Z0 + 0.33], kind: 'bowl' },
    { id: 'kettle', at: [3.35, 0.95, Z0 + 0.32], kind: 'kettle' },
    { id: 'mug-1', at: [3.6, 0.75, -3.8], kind: 'mug' },
    { id: 'mug-2', at: [4.2, 0.75, -3.8], kind: 'mug' },
    { id: 'basin', at: [X0 + 1.95, 0.93, SIDE_S + 0.33], kind: 'basin' },
    { id: 'toilet', at: [X0 + 0.5, 0, 2.1], kind: 'toilet' },
    { id: 'laundry-basket', at: [PASS_ROOM - 0.35, 0, 4.3], kind: 'basket' },
    { id: 'lr-vase', at: [1.8, 0.42, 0.0], kind: 'vase' },
    { id: 'fr-bowl', at: [4.8, 0.8, FR + H + 0.2], kind: 'bowl' },
    { id: 'tub-tap', at: [X0 + 0.1, 0.58, Z1 - 1.4], kind: 'tap' }
  ],

  mounts: {
    waterJug: { at: [2.2, 0.9, Z0 + 0.33], yaw: Math.PI },
    // Above the sofa on the living room's west wall, facing east into the room.
    livingRoomWall: { at: [MAIN_ROOM + 0.06, 1.78, -0.6], yaw: 0 },
    eventFrame: { at: [MAIN_ROOM + 0.06, 1.78, -0.6 + 1.2], yaw: 0 },
    // On the bedside table (top at 0.55), as in `hallway`.
    bedsideFrame: { at: [X0 + 0.25, 0.55 + 0.17, -2.15], yaw: 0.35 },
    // On the north end of the television unit, beside the east window, facing west.
    audioSource: { at: [X1 - 0.28, 0.5, -0.2], yaw: Math.PI / 2 }
  },

  spawn: { position: [0, 1.6, Z1 + 4.5], lookAt: [0, Z1] },

  exterior: [
    { id: 'porch-slab', min: [-2.8, 0, Z1 + EXT_WALL_T], max: [2.8, 0.06, Z1 + 2.5], surface: 'concrete' },
    { id: 'porch-post-w', min: [-2.7, 0, Z1 + 2.2], max: [-2.46, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
    { id: 'porch-post-e', min: [2.46, 0, Z1 + 2.2], max: [2.7, 2.55, Z1 + 2.44], surface: 'wall', castShadow: true },
    { id: 'porch-roof', min: [-2.92, 2.55, Z1 + EXT_WALL_T], max: [2.92, 2.7, Z1 + 2.6], surface: 'wall', blocking: false, castShadow: true },
    { id: 'path', min: [-0.9, 0, Z1 + 2.5], max: [0.9, 0.04, Z1 + 8.0], surface: 'concrete' },
    { id: 'roof', min: [X0 - 0.6, CEILING_HEIGHT, Z0 - 0.6], max: [X1 + 0.6, CEILING_HEIGHT + 0.26, Z1 + 0.6], surface: 'wall', blocking: false, castShadow: true }
  ],

  // The same fenced garden as `hallway` (§11.4: every template fits inside it).
  garden: hallway.garden
}
