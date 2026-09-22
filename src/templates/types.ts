/**
 * SPEC.md §11.1 — a house template is data, not code.
 *
 * `buildHouse` in `proceduralHouse.ts` is the one generator that turns any `Template`
 * into a `WorldSource`. Nothing in here builds geometry: a template declares where
 * things are, and the generator decides how they are made. Every solid is an
 * axis-aligned world-space box, so collision volumes and visible geometry are
 * described once and cannot drift apart.
 *
 * Units are metres. Yaws are radians about +Y; 0 leaves a builder's local axes aligned
 * with the world's.
 *
 * **Mirroring (§11.3) happens to this data, before any geometry is built** — see
 * `mirror.ts`. That is why every oriented placement below says which of its builder's
 * local axes its asymmetry lies along (`MirrorAxis`): a rotation can move an object
 * but never reflect it, so the mirrored yaw depends on which way the object faces.
 */

export type Surface =
  | 'wall' | 'woodFloor' | 'tileFloor' | 'counter' | 'wood' | 'darkWood' | 'metal'
  | 'fabric' | 'fabricWarm' | 'white' | 'dark' | 'accent' | 'mirror' | 'glass'
  | 'grass' | 'concrete' | 'foliage'

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export interface SolidSpec {
  id: string
  min: Vec3
  max: Vec3
  surface: Surface
  /** Solids are blockers unless opted out — lintels, rugs, wall art, towels. */
  blocking?: boolean
  /** Blocker only, no mesh. For props whose visible form is built in code. */
  invisible?: boolean
  castShadow?: boolean
}

export interface RoomSpec {
  id: string
  min: Vec3
  max: Vec3
  floor: Surface
}

/**
 * A straight wall. Openings are not listed here: the generator cuts every declared
 * opening that lies on the run's centreline and inside its span, so a doorway and the
 * gap it needs are declared once (§1.1).
 */
export interface WallRunSpec {
  id: string
  /** The wall's long axis. */
  axis: 'x' | 'z'
  /** Centreline on the perpendicular axis. */
  at: number
  from: number
  to: number
  thickness: number
  surface: Surface
}

/**
 * Every opening in the house, declared once; the wall gaps, the door slabs and the
 * arch trims all derive from it.
 *
 * Widths (`to - from`) are sized against the collider, not against realism: 1.0 m
 * inside and 1.1 m at the front door (§1.1).
 */
export interface OpeningSpec {
  id: string
  /** Player-facing noun. Ids are never shown to the player. */
  label: string
  /** A door gets a hinged slab the player opens with E; an arch gets trim only. */
  kind: 'door' | 'arch'
  axis: 'x' | 'z'
  at: number
  from: number
  to: number
  height: number
  thickness: number
  /** Which end of the span the hinge is on. Ignored for arches. */
  hinge: 'from' | 'to'
  /** Sign of the opening rotation about +Y. Ignored for arches. */
  swing: 1 | -1
}

export interface TableSpec {
  id: string
  /** Footprint on the floor, [x, z]. */
  min: Vec2
  max: Vec2
  topY: number
  topT: number
  surface: Surface
  legSurface: Surface
  legT: number
}

/** Chairs are symmetric left-to-right and face along local Z. */
export interface ChairSpec {
  id: string
  /** Seat centre, [x, z]. */
  at: Vec2
  /** Facing, radians about Y. 0 faces -Z. */
  yaw: number
  surface: Surface
}

export interface WindowSpec {
  id: string
  /** Centre of the glass, on the wall's interior face. */
  at: Vec3
  facing: '+x' | '-x' | '+z' | '-z'
  width: number
  height: number
}

export interface PointSpec {
  id: string
  /** Floor position, [x, z]. */
  at: Vec2
}

export interface ScaledPointSpec extends PointSpec {
  scale: number
}

/**
 * The local axis a builder's asymmetry lies along — which way it faces, or where its
 * handle, spout or cistern is. Mirroring reflects that direction and never the object:
 *
 *   'z'  mirrored yaw = -yaw       (faces along local Z, symmetric left-to-right)
 *   'x'  mirrored yaw = π - yaw    (faces along local X)
 */
export type MirrorAxis = 'x' | 'z'

export type PropKind = 'bowl' | 'kettle' | 'mug' | 'basin' | 'toilet' | 'tap' | 'basket' | 'vase'

/** Where each prop builder's asymmetry lies. See `MirrorAxis`. */
export const PROP_MIRROR_AXIS: Record<PropKind, MirrorAxis> = {
  bowl: 'z',
  kettle: 'x', // spout on local +X
  mug: 'x', // handle on local +X
  basin: 'z', // tap on local -Z
  toilet: 'x', // cistern on local -X
  tap: 'x', // spout on local +X
  basket: 'z',
  vase: 'z'
}

export interface PropSpec {
  id: string
  at: Vec3
  kind: PropKind
  /** Radians about Y. Omitted means unrotated. */
  yaw?: number
}

/** A mount point for a built-in object: where its origin goes, and how it is turned. */
export interface Mount {
  at: Vec3
  yaw: number
}

/**
 * The §1 anchors and interactables every template must place. Each mount's builder
 * is fixed by the generator, and so is its `MirrorAxis`:
 *
 * | Mount            | Is                                              | Faces along |
 * | ---------------- | ----------------------------------------------- | ----------- |
 * | `waterJug`       | interactable `water-jug`                        | local +X (handle) |
 * | `livingRoomWall` | anchor `livingRoomWall`, interactable `wall-photo` | local +X (picture) |
 * | `eventFrame`     | optional §9 anchor `eventFrame`                 | local +X (picture) |
 * | `bedsideFrame`   | anchor `bedsideFrame`                           | local +X (picture) |
 * | `audioSource`    | anchor `audioSource`, interactable `radio`      | local -Z (speaker) |
 *
 * A frame's origin is the centre of its picture; the picture faces the frame's local +X.
 */
export interface Mounts {
  waterJug: Mount
  livingRoomWall: Mount
  eventFrame: Mount
  bedsideFrame: Mount
  audioSource: Mount
}

export const MOUNT_MIRROR_AXIS: Record<keyof Mounts, MirrorAxis> = {
  waterJug: 'x',
  livingRoomWall: 'x',
  eventFrame: 'x',
  bedsideFrame: 'x',
  audioSource: 'z'
}

export interface Template {
  id: string
  /**
   * §11.8 — bumped whenever this template's geometry changes. Attempts are comparable
   * only within the same template id, mirror and version.
   */
  version: number
  /**
   * Trigger volumes, overlapping slightly at the openings. `roomOf` resolves an overlap
   * by declaration order, so a room that joins others (a hallway) is declared last.
   */
  rooms: RoomSpec[]
  walls: WallRunSpec[]
  openings: OpeningSpec[]
  /** The id of the opening the player enters by. Must be a door. */
  frontDoor: string
  /** Interior furniture, placed against wall faces. */
  furniture: SolidSpec[]
  tables: TableSpec[]
  chairs: ChairSpec[]
  windows: WindowSpec[]
  plants: ScaledPointSpec[]
  /** Floor lamps: pole plus shade. */
  lamps: PointSpec[]
  /** Small dressing props built in code. */
  props: PropSpec[]
  mounts: Mounts
  /** Spawn on the path outside, looking at `lookAt` ([x, z]). */
  spawn: { position: Vec3; lookAt: Vec2 }
  /** Porch, path and roof. */
  exterior: SolidSpec[]
  /** The fenced garden the house stands in (§2) — its boundary and its trees. */
  garden: { fence: SolidSpec[]; trees: ScaledPointSpec[] }
}
