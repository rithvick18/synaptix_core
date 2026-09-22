/**
 * SPEC.md §11.4 — `openPlan`: the living room and the kitchen are one space, split by
 * a counter; the bedroom and the bathroom open off the living side. The front door
 * opens into a small foyer with a way into each half.
 *
 * Written relative to its wall constants, like every template (§1.1).
 *
 *              z = Z0  (back)
 *   +-----------+-----------------c-----------------+
 *   |  bedroom  |                 o                 |
 *   |           |   livingRoom    u    kitchen      |
 *   +-----------+                 n                 |
 *   |           |           ::: threshold :::       |  kitchenArch
 *   | bathroom  |                 r                 |
 *   |           |           +---foyer---+           |
 *   |           |      arch |           | door      |
 *   +-----------+-----------+-----^-----+-----------+
 *   x = X0     WING       FX0  front door FX1       x = X1
 *
 * §11.2: with no wall between the two rooms, `kitchenArch` is a threshold marker — a
 * floor strip in the gap in the counter, the only way from one half to the other.
 * It is declared as an `arch` opening that lies on no wall run, so no wall is cut, and
 * given a 1 cm height: the generator's opening trim (two jambs and a head, §1.1) then
 * lies on the floor as a strip across the gap. It is not a blocker — trims never are —
 * and it is the mesh the level-2 hint beacon fits around.
 */
import { ARCH_HEIGHT, CEILING_HEIGHT, DOOR_HEIGHT, EXT_WALL_T, INT_WALL_T } from '../layout'
import { hallway } from './hallway'
import type { OpeningSpec, Template } from './types'

/** Interior extents. */
const X0 = -9.4
const X1 = 6.0
const Z0 = -3.0
const Z1 = 4.0

/** Interior wall centrelines. */
const WING = -5.0 // bedroom and bathroom | living room
const WING_DIV = 1.0 // bedroom | bathroom
const FX0 = -1.2 // foyer west wall
const FX1 = 1.2 // foyer east wall
const FZ = 1.2 // foyer north wall

/** The counter that splits the great room: its centreline, depth and the gap in it. */
const SPLIT = 0.6
const COUNTER_D = 0.6
const GAP_FROM = -1.3
const GAP_TO = -0.1

/** Exterior wall centrelines. */
const EXT_N = Z0 - EXT_WALL_T / 2
const EXT_S = Z1 + EXT_WALL_T / 2
const EXT_W = X0 - EXT_WALL_T / 2
const EXT_E = X1 + EXT_WALL_T / 2

/** Interior wall faces. */
const H = INT_WALL_T / 2
const WING_ROOM = WING - H // bedroom / bathroom side
const WING_DIV_S = WING_DIV + H // bathroom side
const FOYER_N = FZ - H // great-room side of the foyer's back wall
const COUNTER_W = SPLIT - COUNTER_D / 2
const COUNTER_E = SPLIT + COUNTER_D / 2

const OPENINGS: OpeningSpec[] = [
  { id: 'frontDoor', label: 'front door', kind: 'door', axis: 'x', at: EXT_S, from: -0.55, to: 0.55,
    height: 2.1, thickness: EXT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'livingArch', label: 'living room arch', kind: 'arch', axis: 'z', at: FX0,
    from: 1.6, to: 2.8, height: ARCH_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  { id: 'kitchenDoor', label: 'kitchen door', kind: 'door', axis: 'z', at: FX1,
    from: 1.6, to: 2.6, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: 1 },
  // The threshold marker. See the header: on no wall run, 1 cm tall, as deep as the counter.
  { id: 'kitchenArch', label: 'kitchen threshold', kind: 'arch', axis: 'z', at: SPLIT,
    from: GAP_FROM, to: GAP_TO, height: 0.01, thickness: COUNTER_D, hinge: 'from', swing: 1 },
  { id: 'bedroomDoor', label: 'bedroom door', kind: 'door', axis: 'z', at: WING,
    from: -1.5, to: -0.5, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'from', swing: -1 },
  { id: 'bathroomDoor', label: 'bathroom door', kind: 'door', axis: 'z', at: WING,
    from: 2.0, to: 3.0, height: DOOR_HEIGHT, thickness: INT_WALL_T, hinge: 'to', swing: 1 }
]

export const openPlan: Template = {
  id: 'openPlan',
  name: 'Open plan',
  description: 'The living room and kitchen share one open space split by a counter, with the bedroom and bathroom off it.',
  version: 1,

  // The foyer sits inside both halves' boxes, so it is declared first: `roomOf` takes
  // the first room that contains the point.
  rooms: [
    { id: 'foyer', min: [FX0, 0, FZ], max: [FX1, CEILING_HEIGHT, Z1], floor: 'tileFloor' },
    { id: 'livingRoom', min: [WING, 0, Z0], max: [SPLIT, CEILING_HEIGHT, Z1], floor: 'woodFloor' },
    { id: 'kitchen', min: [SPLIT, 0, Z0], max: [X1, CEILING_HEIGHT, Z1], floor: 'tileFloor' },
    { id: 'bedroom', min: [X0, 0, Z0], max: [WING, CEILING_HEIGHT, WING_DIV], floor: 'woodFloor' },
    { id: 'bathroom', min: [X0, 0, WING_DIV], max: [WING, CEILING_HEIGHT, Z1], floor: 'tileFloor' }
  ],

  walls: [
    { id: 'ext-north', axis: 'x', at: EXT_N, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-south', axis: 'x', at: EXT_S, from: EXT_W - EXT_WALL_T / 2, to: EXT_E + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-west', axis: 'z', at: EXT_W, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },
    { id: 'ext-east', axis: 'z', at: EXT_E, from: EXT_N - EXT_WALL_T / 2, to: EXT_S + EXT_WALL_T / 2, thickness: EXT_WALL_T, surface: 'wall' },

    { id: 'wing', axis: 'z', at: WING, from: Z0, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'wing-div', axis: 'x', at: WING_DIV, from: X0, to: WING, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'foyer-west', axis: 'z', at: FX0, from: FZ, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'foyer-east', axis: 'z', at: FX1, from: FZ, to: Z1, thickness: INT_WALL_T, surface: 'wall' },
    { id: 'foyer-north', axis: 'x', at: FZ, from: FX0, to: FX1, thickness: INT_WALL_T, surface: 'wall' }
  ],

  openings: OPENINGS,
  frontDoor: 'frontDoor',

  furniture: [
    // ---- The counter: from the back wall to the foyer, with the threshold gap ----
    { id: 'divider-counter-n', min: [COUNTER_W, 0, Z0], max: [COUNTER_E, 0.92, GAP_FROM], surface: 'counter', castShadow: true },
    { id: 'divider-counter-s', min: [COUNTER_W, 0, GAP_TO], max: [COUNTER_E, 0.92, FOYER_N], surface: 'counter', castShadow: true },

    // ---- Living room: x [WING_LR, COUNTER_W], z [Z0, Z1], less the foyer ----
    { id: 'lr-rug', min: [-4.2, 0, -1.6], max: [-1.6, 0.012, 0.8], surface: 'accent' },
    { id: 'sofa-base', min: [-4.2, 0, Z0], max: [-1.6, 0.42, Z0 + 1.0], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-back', min: [-4.2, 0.42, Z0], max: [-1.6, 1.0, Z0 + 0.25], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-arm-w', min: [-4.2, 0.42, Z0], max: [-3.98, 0.7, Z0 + 1.0], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-arm-e', min: [-1.82, 0.42, Z0], max: [-1.6, 0.7, Z0 + 1.0], surface: 'fabric', castShadow: true, soft: true },
    { id: 'sofa-cushion-1', min: [-3.88, 0.42, Z0 + 0.25], max: [-2.95, 0.54, Z0 + 0.97], surface: 'fabric', soft: true },
    { id: 'sofa-cushion-2', min: [-2.85, 0.42, Z0 + 0.25], max: [-1.92, 0.54, Z0 + 0.97], surface: 'fabric', soft: true },
    { id: 'tv-unit', min: [-3.7, 0, Z1 - 0.45], max: [-1.5, 0.5, Z1], surface: 'darkWood', castShadow: true },
    { id: 'tv-screen', min: [-3.2, 0.55, Z1 - 0.23], max: [-1.7, 1.4, Z1 - 0.15], surface: 'dark', castShadow: true },
    { id: 'lr-side-table', min: [-4.75, 0, Z0 + 0.1], max: [-4.3, 0.52, Z0 + 0.55], surface: 'wood', castShadow: true },

    // ---- Kitchen: x [COUNTER_E, X1], z [Z0, Z1], less the foyer ----
    { id: 'counter-north', min: [COUNTER_E, 0, Z0], max: [X1, 0.9, Z0 + 0.65], surface: 'counter', castShadow: true },
    { id: 'counter-east', min: [X1 - 0.75, 0, Z0 + 0.65], max: [X1, 0.9, 0.0], surface: 'counter', castShadow: true },
    { id: 'upper-cab', min: [COUNTER_E, 1.5, Z0], max: [3.0, 2.2, Z0 + 0.33], surface: 'wood', castShadow: true },
    { id: 'sink-basin', min: [1.6, 0.82, Z0 + 0.13], max: [2.5, 0.91, Z0 + 0.53], surface: 'metal' },
    { id: 'stove-top', min: [3.6, 0.9, Z0 + 0.07], max: [4.55, 0.95, Z0 + 0.57], surface: 'dark' },
    { id: 'extractor', min: [3.6, 1.68, Z0], max: [4.55, 2.1, Z0 + 0.45], surface: 'metal', castShadow: true },
    { id: 'fridge', min: [X1 - 0.8, 0, Z1 - 0.76], max: [X1, 1.85, Z1], surface: 'white', castShadow: true },
    { id: 'fridge-handle', min: [X1 - 0.65, 0.9, Z1 - 0.81], max: [X1 - 0.58, 1.6, Z1 - 0.76], surface: 'metal' },

    // ---- Bedroom: x [X0, WING_ROOM], z [Z0, WING_DIV - H] ----
    { id: 'bd-rug', min: [X0 + 1.3, 0, -2.2], max: [X0 + 3.4, 0.012, -0.2], surface: 'accent' },
    { id: 'headboard', min: [X0, 0, -2.8], max: [X0 + 0.14, 1.15, -0.7], surface: 'darkWood', castShadow: true },
    { id: 'bed-frame', min: [X0 + 0.08, 0, -2.7], max: [X0 + 2.3, 0.34, -0.8], surface: 'darkWood', castShadow: true },
    { id: 'mattress', min: [X0 + 0.1, 0.34, -2.66], max: [X0 + 2.24, 0.64, -0.84], surface: 'white', castShadow: true, soft: true },
    { id: 'duvet', min: [X0 + 0.95, 0.64, -2.66], max: [X0 + 2.24, 0.75, -0.84], surface: 'fabricWarm', soft: true },
    { id: 'pillow-1', min: [X0 + 0.16, 0.64, -2.52], max: [X0 + 0.58, 0.78, -1.94], surface: 'white', soft: true },
    { id: 'pillow-2', min: [X0 + 0.16, 0.64, -1.64], max: [X0 + 0.58, 0.78, -1.06], surface: 'white', soft: true },
    { id: 'bedside-table', min: [X0, 0, -0.6], max: [X0 + 0.5, 0.55, -0.1], surface: 'wood', castShadow: true },
    { id: 'wardrobe', min: [X0 + 2.6, 0, Z0], max: [X0 + 4.1, 2.15, Z0 + 0.7], surface: 'wood', castShadow: true },
    { id: 'wardrobe-handle-l', min: [X0 + 3.28, 1.0, Z0 + 0.66], max: [X0 + 3.33, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'wardrobe-handle-r', min: [X0 + 3.38, 1.0, Z0 + 0.66], max: [X0 + 3.43, 1.35, Z0 + 0.75], surface: 'metal' },
    { id: 'dresser', min: [X0 + 1.2, 0, WING_DIV - H - 0.5], max: [X0 + 2.6, 0.9, WING_DIV - H], surface: 'wood', castShadow: true },

    // ---- Bathroom: x [X0, WING_ROOM], z [WING_DIV_S, Z1] ----
    { id: 'tub-rim-w', min: [X0, 0, Z1 - 2.1], max: [X0 + 0.14, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-rim-e', min: [X0 + 1.76, 0, Z1 - 2.1], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-rim-n', min: [X0, 0, Z1 - 2.1], max: [X0 + 1.9, 0.58, Z1 - 1.96], surface: 'white', castShadow: true },
    { id: 'tub-rim-s', min: [X0, 0, Z1 - 0.19], max: [X0 + 1.9, 0.58, Z1 - 0.05], surface: 'white', castShadow: true },
    { id: 'tub-base', min: [X0 + 0.14, 0, Z1 - 1.96], max: [X0 + 1.76, 0.12, Z1 - 0.19], surface: 'white' },
    { id: 'tub-water', min: [X0 + 0.14, 0.12, Z1 - 1.96], max: [X0 + 1.76, 0.36, Z1 - 0.19], surface: 'glass' },
    { id: 'vanity', min: [X0 + 2.6, 0, WING_DIV_S], max: [X0 + 3.9, 0.86, WING_DIV_S + 0.63], surface: 'wood', castShadow: true },
    { id: 'vanity-top', min: [X0 + 2.55, 0.86, WING_DIV_S - 0.02], max: [X0 + 3.95, 0.93, WING_DIV_S + 0.68], surface: 'counter' },
    { id: 'mirror', min: [X0 + 2.65, 1.15, WING_DIV_S], max: [X0 + 3.85, 1.85, WING_DIV_S + 0.03], surface: 'mirror', blocking: false },
    { id: 'bath-mat', min: [X0 + 2.1, 0, 2.6], max: [X0 + 3.1, 0.014, 3.6], surface: 'fabric', soft: true },
    { id: 'toilet-blocker', min: [X0 + 0.15, 0, 1.34], max: [X0 + 0.8, 0.75, 1.86], surface: 'white', invisible: true },

    // ---- Foyer: x [FX0 + H, FX1 - H], z [FZ + H, Z1] ----
    { id: 'foyer-mat', min: [-0.5, 0, 2.6], max: [0.5, 0.012, 3.6], surface: 'accent' },
    { id: 'shoe-rack', min: [-0.4, 0, FZ + H], max: [0.4, 0.5, FZ + H + 0.34], surface: 'wood', castShadow: true }
  ],

  tables: [
    { id: 'lr-coffee-table', min: [-3.5, -1.3], max: [-2.3, -0.2], topY: 0.42, topT: 0.07, surface: 'darkWood', legSurface: 'darkWood', legT: 0.07 },
    { id: 'kitchen-table', min: [2.6, 0.4], max: [4.2, 1.6], topY: 0.75, topT: 0.06, surface: 'wood', legSurface: 'wood', legT: 0.08 }
  ],

  chairs: [
    { id: 'kt-chair-n1', at: [3.0, -0.15], yaw: Math.PI, surface: 'wood' },
    { id: 'kt-chair-n2', at: [3.8, -0.15], yaw: Math.PI, surface: 'wood' },
    { id: 'kt-chair-s1', at: [3.0, 2.15], yaw: 0, surface: 'wood' },
    { id: 'kt-chair-s2', at: [3.8, 2.15], yaw: 0, surface: 'wood' }
  ],

  windows: [
    { id: 'win-lr-front', at: [-4.3, 1.55, Z1], facing: '-z', width: 0.9, height: 1.2 },
    { id: 'win-kitchen-east', at: [X1, 1.55, 1.8], facing: '-x', width: 1.3, height: 1.1 },
    { id: 'win-kitchen-north', at: [5.2, 1.55, Z0], facing: '+z', width: 0.9, height: 0.9 },
    { id: 'win-bedroom-north', at: [X0 + 1.2, 1.55, Z0], facing: '+z', width: 1.2, height: 1.2 },
    { id: 'win-bathroom-west', at: [X0, 1.75, 1.6], facing: '+x', width: 0.8, height: 0.8 }
  ],

  plants: [
    { id: 'plant-lr', at: [-0.15, -2.6], scale: 1.0 },
    { id: 'plant-kitchen', at: [1.55, 3.55], scale: 0.8 },
    { id: 'plant-bath', at: [WING_ROOM - 0.3, 3.6], scale: 0.7 }
  ],

  lamps: [
    { id: 'lamp-lr', at: [-4.55, -1.9] },
    { id: 'lamp-bd', at: [WING_ROOM - 0.35, 0.5] }
  ],

  props: [
    { id: 'fruit-bowl', at: [5.3, 0.9, -1.2], kind: 'bowl' },
    { id: 'kettle', at: [4.05, 0.95, Z0 + 0.32], kind: 'kettle' },
    { id: 'mug-1', at: [3.1, 0.75, 1.0], kind: 'mug' },
    { id: 'mug-2', at: [3.7, 0.75, 1.0], kind: 'mug' },
    { id: 'basin', at: [X0 + 3.25, 0.93, WING_DIV_S + 0.33], kind: 'basin' },
    { id: 'toilet', at: [X0 + 0.5, 0, 1.6], kind: 'toilet' },
    { id: 'laundry-basket', at: [WING_ROOM - 0.4, 0, 1.5], kind: 'basket' },
    { id: 'lr-vase', at: [-2.9, 0.42, -0.75], kind: 'vase' },
    { id: 'counter-bowl', at: [SPLIT, 0.92, 0.6], kind: 'bowl' },
    { id: 'tub-tap', at: [X0 + 0.1, 0.58, Z1 - 1.4], kind: 'tap' }
  ],

  mounts: {
    waterJug: { at: [3.0, 0.9, Z0 + 0.33], yaw: Math.PI },
    // Above the sofa on the back wall, facing the front of the house (+z).
    livingRoomWall: { at: [-3.5, 1.78, Z0 + 0.06], yaw: -Math.PI / 2 },
    eventFrame: { at: [-3.5 + 1.2, 1.78, Z0 + 0.06], yaw: -Math.PI / 2 },
    bedsideFrame: { at: [X0 + 0.25, 0.55 + 0.17, -0.35], yaw: 0.35 },
    // West end of the television unit, beside the front window, facing into the room.
    audioSource: { at: [-3.48, 0.5, Z1 - 0.28], yaw: 0 }
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

  garden: hallway.garden
}
