/**
 * SPEC.md §11.3 — flip a template left-to-right, in the layout data, before any
 * geometry is built.
 *
 * x is negated across every extent, run, opening and placement; hinge sides swap; yaws
 * are mirrored. Nothing is ever given a negative scale: that would reverse triangle
 * winding, flip which way doors swing, and mirror the caregiver's photographs and any
 * text. Every object the generator builds from the mirrored data is still built with
 * rotations only, so a photograph on a mirrored wall reads the right way round.
 *
 * Negation is exact in floating point, so every mirrored box, run, opening and position
 * is the exact reflection of the unmirrored one.
 */
import {
  MOUNT_MIRROR_AXIS,
  PROP_MIRROR_AXIS,
  type MirrorAxis,
  type Mount,
  type Mounts,
  type OpeningSpec,
  type SolidSpec,
  type Template,
  type Vec2,
  type Vec3,
  type WindowSpec
} from './types'

/** `0 - x` rather than `-x`, so 0 stays 0 instead of becoming -0. */
const neg = (x: number): number => 0 - x

const point2 = ([x, z]: Vec2): Vec2 => [neg(x), z]
const point3 = ([x, y, z]: Vec3): Vec3 => [neg(x), y, z]

/** A box's x extent swaps ends: [min, max] → [-max, -min]. */
function extent<T extends { min: Vec3; max: Vec3 }>(spec: T): T {
  return { ...spec, min: [neg(spec.max[0]), spec.min[1], spec.min[2]], max: [neg(spec.min[0]), spec.max[1], spec.max[2]] }
}

/**
 * Reflects the direction an object faces and never the object itself (see
 * `MirrorAxis`). For a picture frame (faces local +X) at yaw π — facing west into a
 * room on the east wall — this gives 0: facing east into the mirrored room on the west
 * wall. Negating the yaw instead would give -π, turning the picture to face the wall.
 */
export function mirrorYaw(yaw: number, axis: MirrorAxis): number {
  return axis === 'x' ? Math.PI - yaw : neg(yaw)
}

function mount(m: Mount, axis: MirrorAxis): Mount {
  return { at: point3(m.at), yaw: mirrorYaw(m.yaw, axis) }
}

/**
 * An opening on an x-running wall has its span negated, so its ends swap and so must
 * the hinge label. Every door's swing reverses: a rotation of +θ reflects to -θ.
 */
function opening(o: OpeningSpec): OpeningSpec {
  const swing = o.swing === 1 ? -1 : 1
  if (o.axis === 'x') {
    return { ...o, from: neg(o.to), to: neg(o.from), hinge: o.hinge === 'from' ? 'to' : 'from', swing }
  }
  return { ...o, at: neg(o.at), swing }
}

const FACING: Record<WindowSpec['facing'], WindowSpec['facing']> = { '+x': '-x', '-x': '+x', '+z': '+z', '-z': '-z' }

const solids = (list: SolidSpec[]): SolidSpec[] => list.map(extent)

export function mirrorTemplate(t: Template): Template {
  const mounts = {} as Mounts
  for (const key of Object.keys(t.mounts) as (keyof Mounts)[]) {
    mounts[key] = mount(t.mounts[key], MOUNT_MIRROR_AXIS[key])
  }
  return {
    ...t,
    rooms: t.rooms.map(extent),
    walls: t.walls.map((w) =>
      w.axis === 'x' ? { ...w, from: neg(w.to), to: neg(w.from) } : { ...w, at: neg(w.at) }
    ),
    openings: t.openings.map(opening),
    furniture: solids(t.furniture),
    tables: t.tables.map((s) => ({ ...s, min: [neg(s.max[0]), s.min[1]], max: [neg(s.min[0]), s.max[1]] })),
    chairs: t.chairs.map((c) => ({ ...c, at: point2(c.at), yaw: mirrorYaw(c.yaw, 'z') })),
    windows: t.windows.map((w) => ({ ...w, at: point3(w.at), facing: FACING[w.facing] })),
    plants: t.plants.map((p) => ({ ...p, at: point2(p.at) })),
    lamps: t.lamps.map((l) => ({ ...l, at: point2(l.at) })),
    props: t.props.map((p) => ({ ...p, at: point3(p.at), yaw: mirrorYaw(p.yaw ?? 0, PROP_MIRROR_AXIS[p.kind]) })),
    mounts,
    spawn: { position: point3(t.spawn.position), lookAt: point2(t.spawn.lookAt) },
    exterior: solids(t.exterior),
    garden: {
      fence: solids(t.garden.fence),
      trees: t.garden.trees.map((p) => ({ ...p, at: point2(p.at) }))
    }
  }
}
