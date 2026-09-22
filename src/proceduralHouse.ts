import type { EnvironmentStyle } from './agent/environment'
import { styleAnisotropy, styleMaterial, stylesSurface } from './EnvironmentMaterials'
import type { TextureResolution } from './Quality'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CEILING_HEIGHT, PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS } from './layout'
import { mirrorTemplate } from './templates/mirror'
import type {
  ChairSpec,
  OpeningSpec,
  RoomSpec,
  SolidSpec,
  Surface,
  TableSpec,
  Template,
  WallRunSpec,
  WindowSpec
} from './templates/types'
import { tagInteractable, type WorldSource } from './World'
import type { StageProgress } from './ui'

/**
 * SPEC.md §1.1 / §11.1 — the house generator.
 *
 * `buildHouse` turns any template (`src/templates/`) into a `WorldSource`, built from
 * primitives. Mirroring (§11.3) is applied to the template's data before anything is
 * built, so nothing here knows or cares which way round the house is.
 *
 * §1.1's degradation contract governs every download here: textures are fetched with a
 * timeout and the house falls back to flat `MeshStandardMaterial`s; the HDRI is handled
 * the same way in Renderer.ts. With the network offline the house still renders, still
 * lights, and is still walkable.
 */

const POLY_HAVEN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg'
const TEXTURE_TIMEOUT_MS = 8000
/** The background upgrade is not on the loading screen's critical path, and a 2k set is
 *  four times the bytes of a 1k one, so it gets longer before it is given up on. */
const UPGRADE_TIMEOUT_MS = 30000

const SURFACE_COLOUR: Record<Surface, number> = {
  wall: 0xe8e2d8,
  woodFloor: 0x9a7550,
  tileFloor: 0xc9c9c4,
  counter: 0xcfcac2,
  wood: 0xb08654,
  darkWood: 0x5d4632,
  metal: 0xc6ccd2,
  fabric: 0x5f7381,
  fabricWarm: 0xb5654a,
  white: 0xf2f0ec,
  dark: 0x1e2024,
  accent: 0x8c3f38,
  mirror: 0xccd8e2,
  glass: 0x9fd6e8,
  grass: 0x6f8a4e,
  concrete: 0xa8a49c,
  foliage: 0x3f6b3a
}

const SURFACE_ROUGHNESS: Record<Surface, number> = {
  wall: 0.95, woodFloor: 0.78, tileFloor: 0.5, counter: 0.45, wood: 0.65, darkWood: 0.6,
  metal: 0.35, fabric: 0.9, fabricWarm: 0.9, white: 0.4, dark: 0.5, accent: 0.95,
  mirror: 0.12, glass: 0.1, grass: 1.0, concrete: 0.9, foliage: 0.85
}

const SURFACE_METALNESS: Record<Surface, number> = {
  wall: 0, woodFloor: 0, tileFloor: 0, counter: 0, wood: 0, darkWood: 0,
  metal: 0.6, fabric: 0, fabricWarm: 0, white: 0, dark: 0.1, accent: 0,
  mirror: 0.7, glass: 0, grass: 0, concrete: 0, foliage: 0
}

/**
 * Which Poly Haven set backs which surface, and at what world tile size in metres.
 *
 * Several surfaces may share one set — it is downloaded once — and are told apart by
 * tint. `mean` is the measured average colour of the set's diffuse map; a surface that
 * declares one is tinted so that, on average, it comes out the flat colour it has
 * without textures (`SURFACE_COLOUR`). The palette is therefore the same online and
 * offline, and dark wood is the oak set darkened rather than a second download. The
 * four original sets predate this and keep the tints they always had.
 *
 * Tile sizes for the added sets are Poly Haven's own published dimensions: oak veneer
 * 1.83 m, the herringbone upholstery weave 0.27 m, the concrete 2.0 m.
 */
interface TextureSource { name: string; tile: number; mean?: number }
const TEXTURE_SET: Partial<Record<Surface, TextureSource>> = {
  wall: { name: 'painted_plaster_wall', tile: 2.5 },
  woodFloor: { name: 'laminate_floor_02', tile: 2.0 },
  tileFloor: { name: 'square_tiles_03', tile: 1.5 },
  counter: { name: 'marble_01', tile: 1.2 },
  wood: { name: 'oak_veneer_01', tile: 1.83, mean: 0xa17e57 },
  darkWood: { name: 'oak_veneer_01', tile: 1.83, mean: 0xa17e57 },
  fabric: { name: 'poly_wool_herringbone', tile: 0.27, mean: 0x797571 },
  fabricWarm: { name: 'poly_wool_herringbone', tile: 0.27, mean: 0x797571 },
  concrete: { name: 'concrete_floor_02', tile: 2.0, mean: 0x786e5b }
}

/** Every distinct set, in declaration order: what is actually downloaded. */
const TEXTURE_NAMES = [...new Set(Object.values(TEXTURE_SET).map((source) => source!.name))]

/** The tint that makes a set whose average is `mean` average out to `target` instead.
 *  Worked per channel in linear space, where the multiply in the shader happens. */
function tintFor(target: number, mean: number): THREE.Color {
  const t = new THREE.Color(target)
  const m = new THREE.Color(mean)
  const channel = (a: number, b: number): number => Math.min(3, a / Math.max(b, 1e-4))
  return new THREE.Color(channel(t.r, m.r), channel(t.g, m.g), channel(t.b, m.b))
}

export interface HouseBuildReport {
  texturesLoaded: string[]
  texturesFailed: string[]
  /** Which size the loaded sets are, now that it can change after boot. */
  textureResolution: TextureResolution
  anisotropy: number
  doorways: DoorwayReport[]
  reachability: ReachabilityReport[]
  /** Which house this is (§11): template id, geometry version, and whether mirrored. */
  template: { id: string; version: number; mirrored: boolean }
}

export interface HouseOptions {
  /** What to fetch during boot. 1k everywhere: boot time is not for sale. */
  resolution?: TextureResolution
  anisotropy?: number
}

export interface UpgradeReport {
  resolution: TextureResolution
  upgraded: string[]
  /** Sets that failed or were skipped; each keeps whatever it already had. */
  failed: string[]
}

type MapTriplet = { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture }

function loadTexture(loader: THREE.TextureLoader, url: string, timeoutMs = TEXTURE_TIMEOUT_MS): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    // A hung request must not hold the loading screen open — §1.1 is a hard "always works".
    const timer = setTimeout(() => reject(new Error(`timeout ${url}`)), timeoutMs)
    loader.load(url, (t) => { clearTimeout(timer); resolve(t) }, undefined, () => {
      clearTimeout(timer); reject(new Error(`failed ${url}`))
    })
  })
}

/** Each map settles individually, so the loading screen counts files and not sets. */
async function loadSet(
  loader: THREE.TextureLoader,
  name: string,
  options: { resolution: TextureResolution; anisotropy: number; timeoutMs?: number },
  settled: (ok: boolean) => void
): Promise<MapTriplet> {
  const res = options.resolution
  const one = (suffix: string): Promise<THREE.Texture> =>
    loadTexture(loader, `${POLY_HAVEN}/${res}/${name}/${name}_${suffix}_${res}.jpg`, options.timeoutMs).then(
      (t) => {
        settled(true)
        return t
      },
      (error) => {
        settled(false)
        throw error
      }
    )
  const [map, roughnessMap, normalMap] = await Promise.all([
    one('diff'),
    one('rough'),
    one('nor_gl')
  ])
  map.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    // Anisotropy is what a floor actually needs. A wall seen head-on looks the same at
    // 1 as at 16; a floor running away from the camera is sampled along a direction the
    // mip chain cannot represent, and without this it turns to mush about three metres
    // out — at any texture resolution, which is why raising the maps without raising
    // this would have bought almost nothing on the surfaces people look along.
    t.anisotropy = options.anisotropy
  }
  return { map, roughnessMap, normalMap }
}

/**
 * Tiling is done by scaling UVs per mesh rather than by `texture.repeat`, because every
 * surface shares one material instance — a shared repeat would stretch a 12 m wall and a
 * 0.4 m shelf by the same factor.
 */
function scalePlaneUV(geo: THREE.BufferGeometry, w: number, h: number, tile: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile))
  uv.needsUpdate = true
}

/**
 * Box projection at true scale: each vertex takes its UV from the two world axes its
 * face lies across, divided by the set's tile size. It works on any geometry — rounded
 * boxes included — and, given the mesh's position as `origin`,
 * neighbouring pieces continue one texture instead of each restarting it at a corner.
 */
function projectUV(geo: THREE.BufferGeometry, tile: number, origin: THREE.Vector3Like = { x: 0, y: 0, z: 0 }): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + origin.x, y = pos.getY(i) + origin.y, z = pos.getZ(i) + origin.z
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i))
    if (ax >= ay && ax >= az) uv.setXY(i, z / tile, y / tile)
    else if (ay >= az) uv.setXY(i, x / tile, z / tile)
    else uv.setXY(i, x / tile, y / tile)
  }
  uv.needsUpdate = true
}

/**
 * How a box-shaped piece of furniture is drawn. Real furniture has no knife edges, and
 * a bevel is what catches the light along an edge and tells the eye where one surface
 * ends. `soft` pieces — upholstery, bedding — are rounded well past a bevel. Walls,
 * floors and the exterior stay square. Only the drawn geometry changes: every blocker
 * is still the axis-aligned `min`/`max` box.
 */
type Edge = 'square' | 'bevel' | 'soft'
function edgeGeometry(sx: number, sy: number, sz: number, edge: Edge): THREE.BufferGeometry {
  const least = Math.min(sx, sy, sz)
  if (edge === 'square' || least < 0.02) return new THREE.BoxGeometry(sx, sy, sz)
  return edge === 'soft'
    ? new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(0.06, least * 0.45))
    : new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(0.012, least * 0.25))
}

/**
 * Static detail that never moves or collides — skirting boards, cabinet seams, sills,
 * window bars, table aprons. Drawn as one merged mesh per surface, so a house full of
 * trim costs a handful of draw calls rather than hundreds.
 */
class DetailBatch {
  private parts = new Map<Surface, THREE.BufferGeometry[]>()
  constructor(private mats: Materials) {}

  box(surface: Surface, min: THREE.Vector3Like, max: THREE.Vector3Like): void {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z
    if (sx < 1e-4 || sy < 1e-4 || sz < 1e-4) return
    const geo = new THREE.BoxGeometry(sx, sy, sz)
    geo.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2)
    const tile = this.mats.tileOf(surface)
    if (tile) projectUV(geo, tile)
    const list = this.parts.get(surface) ?? []
    list.push(geo)
    this.parts.set(surface, list)
  }

  meshes(): THREE.Mesh[] {
    return [...this.parts].map(([surface, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list), this.mats.get(surface))
      for (const geo of list) geo.dispose()
      mesh.name = `detail:${surface}`
      mesh.receiveShadow = true
      return mesh
    })
  }
}

/**
 * The surfaces a house is dressed in. Built by `createProceduralHouse` from whatever
 * texture sets downloaded; `buildHouse` without one uses flat colours throughout, which
 * is exactly §1.1's offline fallback.
 */
export class Materials {
  private cache = new Map<Surface, THREE.MeshStandardMaterial>()
  constructor(
    /** Keyed by Poly Haven set name; null where that set failed to download. */
    private sets: Map<string, MapTriplet | null>,
    private style?: EnvironmentStyle,
    private anisotropy = 4
  ) {}

  /**
   * Swaps a higher-resolution set onto an already-built material. Two refusals matter
   * more than the swap itself:
   *
   * - A surface with no set is one whose 1k download failed. This is an upgrade, not a
   *   retry: the flat-colour fallback §1.1 promises stays exactly where it is.
   * - A surface a personalised environment has claimed keeps the caregiver's colour and
   *   drawn pattern. Re-attaching a photographed plaster map there would silently
   *   overwrite the home they generated from their own rooms.
   */
  replace(name: string, maps: MapTriplet): boolean {
    const previous = this.sets.get(name)
    if (!previous) return false
    // Every surface this set dresses. Surfaces that share a set are styled together
    // (wood and dark wood take one colour, both fabrics another), so this is all or none.
    const unstyled = surfacesOf(name).filter((surface) => !stylesSurface(surface, this.style))
    if (!unstyled.length) return false
    this.sets.set(name, maps)
    for (const surface of unstyled) {
      const material = this.cache.get(surface)
      if (!material) continue
      material.map = maps.map
      material.roughnessMap = maps.roughnessMap
      material.normalMap = maps.normalMap
      material.needsUpdate = true
    }
    // Released only after the replacements are bound, so no frame renders without one.
    for (const t of [previous.map, previous.roughnessMap, previous.normalMap]) t.dispose()
    return true
  }

  private setFor(surface: Surface): MapTriplet | null {
    const source = TEXTURE_SET[surface]
    return source ? this.sets.get(source.name) ?? null : null
  }

  get(surface: Surface): THREE.MeshStandardMaterial {
    let m = this.cache.get(surface)
    if (m) return m
    m = new THREE.MeshStandardMaterial({
      color: SURFACE_COLOUR[surface],
      roughness: SURFACE_ROUGHNESS[surface],
      metalness: SURFACE_METALNESS[surface]
    })
    if (surface === 'glass') { m.transparent = true; m.opacity = 0.55 }
    const maps = this.setFor(surface)
    if (maps) {
      m.map = maps.map
      m.roughnessMap = maps.roughnessMap
      m.normalMap = maps.normalMap
      // Tint multiplies into the map; plain white left the plaster a cold grey.
      const mean = TEXTURE_SET[surface]!.mean
      if (mean !== undefined) m.color.copy(tintFor(SURFACE_COLOUR[surface], mean))
      else m.color.set(surface === 'wall' ? 0xf4ead9 : 0xffffff)
    }
    if (this.style) styleMaterial(m, surface, this.style)
    styleAnisotropy(m, this.anisotropy)
    this.cache.set(surface, m)
    return m
  }

  tileOf(surface: Surface): number | null {
    if (this.style && (surface === 'woodFloor' || surface === 'tileFloor')) return this.style.floorType === 'tile' ? 0.8 : 2
    return this.setFor(surface) ? (TEXTURE_SET[surface]?.tile ?? null) : null
  }
}

function surfacesOf(name: string): Surface[] {
  return (Object.keys(TEXTURE_SET) as Surface[]).filter((surface) => TEXTURE_SET[surface]!.name === name)
}

function boxMesh(spec: SolidSpec, mats: Materials, edge: Edge = 'square', surface: Surface = spec.surface): THREE.Mesh {
  const sx = spec.max[0] - spec.min[0]
  const sy = spec.max[1] - spec.min[1]
  const sz = spec.max[2] - spec.min[2]
  const geo = edgeGeometry(sx, sy, sz, edge)
  const centre = new THREE.Vector3(
    (spec.min[0] + spec.max[0]) / 2,
    (spec.min[1] + spec.max[1]) / 2,
    (spec.min[2] + spec.max[2]) / 2
  )
  const tile = mats.tileOf(surface)
  if (tile) projectUV(geo, tile, centre)
  const mesh = new THREE.Mesh(geo, mats.get(surface))
  mesh.position.copy(centre)
  mesh.name = spec.id
  mesh.castShadow = spec.castShadow ?? false
  mesh.receiveShadow = true
  return mesh
}

function simpleBox(
  mats: Materials, surface: Surface, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, cast = true, edge: Edge = 'bevel'
): THREE.Mesh {
  const geo = edgeGeometry(sx, sy, sz, edge)
  const tile = mats.tileOf(surface)
  if (tile) projectUV(geo, tile, { x, y, z })
  const mesh = new THREE.Mesh(geo, mats.get(surface))
  mesh.position.set(x, y, z)
  mesh.castShadow = cast
  mesh.receiveShadow = true
  return mesh
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

/**
 * Expands a run into full-height segments between its openings, plus a non-blocking
 * lintel over each opening. Writing the segments by hand is how doorways end up
 * one wall-thickness out of place.
 *
 * A run is cut by every opening declared on its centreline and inside its span, so an
 * opening is declared once and the gap follows it — mirrored or not.
 */
function expandWall(run: WallRunSpec, openings: readonly OpeningSpec[]): SolidSpec[] {
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

  const cuts = openings
    .filter((o) => o.axis === run.axis && o.at === run.at && o.from >= run.from && o.to <= run.to)
    .sort((a, b) => a.from - b.from)
  let cursor = run.from
  cuts.forEach((op, i) => {
    box(cursor, op.from, 0, CEILING_HEIGHT, `seg${i}`)
    // Above head height, so it can block nothing and occlude nothing.
    box(op.from, op.to, op.height, CEILING_HEIGHT, `lintel${i}`, false)
    cursor = op.to
  })
  box(cursor, run.to, 0, CEILING_HEIGHT, 'segN')
  return out
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

// Just past square. Opening further swings the slab's AABB back across the doorway,
// which is exactly the clearance the player needs.
const OPEN_ANGLE = THREE.MathUtils.degToRad(91)
const SWING_SECONDS = 0.55

/**
 * A hinged door. The live `blocker` stays in `world.blockers` by identity; opening swaps
 * its contents between the closed volume (the whole doorway) and the AABB of the swung
 * slab, so the player can neither walk through a shut door nor through an open one.
 */
class Door {
  readonly blocker = new THREE.Box3()
  readonly pivot = new THREE.Group()
  open = false

  /** Where the slab sits when open — public so `auditDoorways` can measure against it. */
  readonly openBox = new THREE.Box3()

  private amount = 0
  private closedBox = new THREE.Box3()
  private baseYaw: number


  constructor(readonly spec: OpeningSpec, mats: Materials) {
    const width = spec.to - spec.from
    const slabW = width - 0.02
    const slabT = Math.min(spec.thickness - 0.02, 0.06)

    // Build the slab so the hinge sits at the pivot's origin, on the floor, with the
    // slab extending along local +X.
    const geo = edgeGeometry(slabW, spec.height, slabT, 'bevel')
    const tile = mats.tileOf('darkWood')
    if (tile) projectUV(geo, tile)
    geo.translate(slabW / 2, spec.height / 2, 0)
    const slab = new THREE.Mesh(geo, mats.get('darkWood'))
    slab.castShadow = true
    slab.receiveShadow = true
    slab.name = `${spec.id}-slab`
    this.pivot.add(slab)

    // Two raised panels on each face, upper and lower — what makes a slab read as a door.
    // Children of the pivot, not the slab: `openBox` below is measured from the slab
    // alone, so the door's open blocker is unchanged by them.
    const margin = 0.11
    const panelW = slabW - margin * 2
    const lowerH = spec.height * 0.42
    const upperH = spec.height - lowerH - margin * 3
    for (const face of [1, -1]) {
      for (const [h, y] of [[lowerH, margin + lowerH / 2], [upperH, margin * 2 + lowerH + upperH / 2]]) {
        const panel = simpleBox(mats, 'darkWood', slabW / 2, y, face * (slabT / 2 + 0.006), panelW, h, 0.012, false)
        panel.name = `${spec.id}-panel`
        this.pivot.add(panel)
      }
    }

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10),
      mats.get('metal')
    )
    handle.rotation.x = Math.PI / 2
    handle.position.set(slabW - 0.09, 1.02, slabT / 2 + 0.03)
    handle.castShadow = true
    this.pivot.add(handle)
    const handleBack = handle.clone()
    handleBack.position.z = -slabT / 2 - 0.03
    this.pivot.add(handleBack)

    // Hinge point and the base rotation that aims local +X along the opening.
    const hingeAt = spec.hinge === 'from' ? spec.from : spec.to
    const towards = spec.hinge === 'from' ? 1 : -1
    if (spec.axis === 'x') {
      this.pivot.position.set(hingeAt, 0, spec.at)
      this.baseYaw = towards > 0 ? 0 : Math.PI
    } else {
      this.pivot.position.set(spec.at, 0, hingeAt)
      this.baseYaw = towards > 0 ? -Math.PI / 2 : Math.PI / 2
    }
    this.pivot.rotation.y = this.baseYaw

    // Closed: the doorway volume itself, which is thicker and more reliable for AABB
    // collision than the 5 cm slab. Open: whatever the swung slab actually occupies,
    // measured rather than derived, so the sign conventions cannot be got wrong.
    const half = spec.thickness / 2
    if (spec.axis === 'x') {
      this.closedBox.set(
        new THREE.Vector3(spec.from, 0, spec.at - half),
        new THREE.Vector3(spec.to, spec.height, spec.at + half)
      )
    } else {
      this.closedBox.set(
        new THREE.Vector3(spec.at - half, 0, spec.from),
        new THREE.Vector3(spec.at + half, spec.height, spec.to)
      )
    }
    this.pivot.rotation.y = this.baseYaw + spec.swing * OPEN_ANGLE
    this.pivot.updateMatrixWorld(true)
    this.openBox.setFromObject(slab).expandByScalar(0.01)
    this.pivot.rotation.y = this.baseYaw
    this.pivot.updateMatrixWorld(true)

    this.blocker.copy(this.closedBox)
  }

  toggle(): string {
    this.open = !this.open
    return this.open ? 'open' : 'close'
  }

  /** Returns true while the slab is actually swinging. */
  update(dt: number): boolean {
    const target = this.open ? 1 : 0
    if (this.amount === target) return false
    const step = dt / SWING_SECONDS
    this.amount = target > this.amount
      ? Math.min(target, this.amount + step)
      : Math.max(target, this.amount - step)
    this.pivot.rotation.y = this.baseYaw + this.spec.swing * OPEN_ANGLE * this.amount
    // Past half-swing the doorway is clear and the slab is what stands in the room.
    this.blocker.copy(this.amount < 0.5 ? this.closedBox : this.openBox)
    return true
  }
}

/** Trim around a door or archway, so an opening reads as a framed one. */
function buildTrim(spec: OpeningSpec, mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  group.name = `${spec.id}-trim`
  const t = 0.07
  const depth = spec.thickness + 0.1
  for (const end of [spec.from, spec.to]) {
    const sign = end === spec.from ? -1 : 1
    const jamb = spec.axis === 'x'
      ? simpleBox(mats, 'darkWood', end + sign * t / 2, spec.height / 2, spec.at, t, spec.height, depth)
      : simpleBox(mats, 'darkWood', spec.at, spec.height / 2, end + sign * t / 2, depth, spec.height, t)
    group.add(jamb)
  }
  const span = spec.to - spec.from + t * 2
  const head = spec.axis === 'x'
    ? simpleBox(mats, 'darkWood', (spec.from + spec.to) / 2, spec.height + t / 2, spec.at, span, t, depth)
    : simpleBox(mats, 'darkWood', spec.at, spec.height + t / 2, (spec.from + spec.to) / 2, depth, t, span)
  group.add(head)
  return group
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** §1.1: "The jug may be a lathe or cylinder+torus primitive." */
function buildWaterJug(mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'water-jug'
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xc8d6de, roughness: 0.25, metalness: 0.05 })

  const rings: [number, number][] = [
    [0, 0], [0.075, 0], [0.085, 0.02], [0.105, 0.09], [0.1, 0.17],
    [0.07, 0.235], [0.062, 0.27], [0.07, 0.3], [0.064, 0.3]
  ]
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(r, y)), 24),
    ceramic
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Torus lies in its local XY plane; the open 0.75 rad of the arc faces the body so the
  // handle reads as a handle rather than a ring.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20, Math.PI * 1.25), ceramic)
  handle.position.set(0.125, 0.2, 0)
  handle.rotation.z = -0.625 * Math.PI
  handle.castShadow = true
  group.add(handle)

  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 20), mats.get('glass'))
  water.position.y = 0.11
  group.add(water)
  return group
}

function buildTable(spec: TableSpec, mats: Materials, detail: DetailBatch): THREE.Object3D {
  const group = new THREE.Group()
  group.name = spec.id
  const w = spec.max[0] - spec.min[0]
  const d = spec.max[1] - spec.min[1]
  const cx = (spec.min[0] + spec.max[0]) / 2
  const cz = (spec.min[1] + spec.max[1]) / 2
  group.add(simpleBox(mats, spec.surface, cx, spec.topY - spec.topT / 2, cz, w, spec.topT, d))
  const legH = spec.topY - spec.topT
  const inset = spec.legT / 2 + 0.06
  // The apron: rails under the top between the legs, as a real table has. Only on a
  // table tall enough to sit at — on a coffee table it would hide the legs.
  if (spec.topY > 0.6) {
    const apron = 0.08, rail = 0.025, below = spec.topY - spec.topT
    const x0 = cx - w / 2 + inset, x1 = cx + w / 2 - inset, z0 = cz - d / 2 + inset, z1 = cz + d / 2 - inset
    for (const z of [z0, z1]) detail.box(spec.surface, { x: x0, y: below - apron, z: z - rail / 2 }, { x: x1, y: below, z: z + rail / 2 })
    for (const x of [x0, x1]) detail.box(spec.surface, { x: x - rail / 2, y: below - apron, z: z0 }, { x: x + rail / 2, y: below, z: z1 })
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(simpleBox(
        mats, spec.legSurface,
        cx + sx * (w / 2 - inset), legH / 2, cz + sz * (d / 2 - inset),
        spec.legT, legH, spec.legT
      ))
    }
  }
  return group
}

function buildChair(spec: ChairSpec, mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  group.name = spec.id
  const s = 0.44
  group.add(simpleBox(mats, spec.surface, 0, 0.44, 0, s, 0.05, s))
  group.add(simpleBox(mats, spec.surface, 0, 0.72, -s / 2 + 0.03, s, 0.5, 0.05))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(simpleBox(mats, spec.surface, sx * (s / 2 - 0.04), 0.21, sz * (s / 2 - 0.04), 0.045, 0.42, 0.045))
    }
  }
  group.position.set(spec.at[0], 0, spec.at[1])
  group.rotation.y = spec.yaw
  return group
}

const WINDOW_NORMAL: Record<WindowSpec['facing'], [number, number, number]> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1]
}

/**
 * Windows are painted on, not cut through: the wall stays one solid box and a bright
 * pane sits on each face. Cutting a real aperture would mean splitting wall runs
 * horizontally, which buys nothing at this checkpoint.
 */
function buildWindow(spec: WindowSpec, mats: Materials, wallThickness: number, detail: DetailBatch): THREE.Object3D {
  const group = new THREE.Group()
  group.name = spec.id
  const n = WINDOW_NORMAL[spec.facing]
  const alongX = spec.facing === '+z' || spec.facing === '-z'
  const daylight = new THREE.MeshBasicMaterial({ color: 0xdceaf6 })

  for (const side of [0, 1]) {
    const face = new THREE.Group()
    const off = side === 0 ? 0.012 : -(wallThickness + 0.012)
    face.position.set(
      spec.at[0] + n[0] * off, spec.at[1], spec.at[2] + n[2] * off
    )
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), daylight)
    if (alongX) pane.rotation.y = n[2] > 0 ? 0 : Math.PI
    else pane.rotation.y = n[0] > 0 ? Math.PI / 2 : -Math.PI / 2
    if (side === 1) pane.rotation.y += Math.PI
    face.add(pane)

    const t = 0.06
    const sx = alongX ? spec.width + t * 2 : t
    const sz = alongX ? t : spec.width + t * 2
    face.add(simpleBox(mats, 'white', 0, spec.height / 2 + t / 2, 0, sx, t, sz, false))
    face.add(simpleBox(mats, 'white', 0, -spec.height / 2 - t / 2, 0, sx, t, sz, false))
    const jx = alongX ? spec.width / 2 + t / 2 : 0
    const jz = alongX ? 0 : spec.width / 2 + t / 2
    for (const s of [-1, 1]) {
      face.add(simpleBox(mats, 'white', s * jx, 0, s * jz, alongX ? t : t, spec.height, alongX ? t : t, false))
    }
    // A glazing bar across and down the middle, and a sill standing out from the wall
    // below the frame. Static, so they go in the merged detail mesh, in world space.
    const p = face.position
    const bar = 0.035
    const out = side === 0 ? 1 : -1
    const n0 = (v: number): number => v * out
    if (alongX) {
      detail.box('white', { x: p.x - spec.width / 2, y: p.y - bar / 2, z: p.z - bar / 2 }, { x: p.x + spec.width / 2, y: p.y + bar / 2, z: p.z + bar / 2 })
      detail.box('white', { x: p.x - bar / 2, y: p.y - spec.height / 2, z: p.z - bar / 2 }, { x: p.x + bar / 2, y: p.y + spec.height / 2, z: p.z + bar / 2 })
      const z0 = p.z, z1 = p.z + n0(n[2] * 0.09)
      detail.box('white', { x: p.x - spec.width / 2 - 0.1, y: p.y - spec.height / 2 - t - 0.035, z: Math.min(z0, z1) }, { x: p.x + spec.width / 2 + 0.1, y: p.y - spec.height / 2 - t, z: Math.max(z0, z1) })
    } else {
      detail.box('white', { x: p.x - bar / 2, y: p.y - bar / 2, z: p.z - spec.width / 2 }, { x: p.x + bar / 2, y: p.y + bar / 2, z: p.z + spec.width / 2 })
      detail.box('white', { x: p.x - bar / 2, y: p.y - spec.height / 2, z: p.z - bar / 2 }, { x: p.x + bar / 2, y: p.y + spec.height / 2, z: p.z + bar / 2 })
      const x0 = p.x, x1 = p.x + n0(n[0] * 0.09)
      detail.box('white', { x: Math.min(x0, x1), y: p.y - spec.height / 2 - t - 0.035, z: p.z - spec.width / 2 - 0.1 }, { x: Math.max(x0, x1), y: p.y - spec.height / 2 - t, z: p.z + spec.width / 2 + 0.1 })
    }
    group.add(face)
  }
  return group
}

function buildPlant(mats: Materials, scale: number): THREE.Object3D {
  const group = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.26, 14), mats.get('fabricWarm'))
  pot.position.y = 0.13
  pot.castShadow = true
  group.add(pot)
  const foliage = mats.get('foliage')
  for (const [x, y, z, r] of [[0, 0.52, 0, 0.26], [0.16, 0.42, 0.08, 0.18], [-0.13, 0.46, -0.1, 0.2]]) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), foliage)
    blob.position.set(x, y, z)
    blob.castShadow = true
    group.add(blob)
  }
  group.scale.setScalar(scale)
  return group
}

function buildTree(mats: Materials, scale: number): THREE.Object3D {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 10), mats.get('darkWood'))
  trunk.position.y = 1.2
  trunk.castShadow = true
  group.add(trunk)
  const foliage = mats.get('foliage')
  for (const [x, y, z, r] of [[0, 3.0, 0, 1.3], [0.8, 2.5, 0.4, 0.9], [-0.7, 2.6, -0.5, 1.0]]) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), foliage)
    blob.position.set(x, y, z)
    blob.castShadow = true
    group.add(blob)
  }
  group.scale.setScalar(scale)
  return group
}

function buildLamp(mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.04, 14), mats.get('metal'))
  base.position.y = 0.02
  group.add(base)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8), mats.get('metal'))
  pole.position.y = 0.75
  pole.castShadow = true
  group.add(pole)
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 0.3, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.9, side: THREE.DoubleSide })
  )
  shade.position.y = 1.6
  group.add(shade)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3dd })
  )
  bulb.position.y = 1.58
  group.add(bulb)
  const light = new THREE.PointLight(0xffe4b8, 6, 5, 2)
  light.position.y = 1.58
  group.add(light)
  return group
}

function buildProp(kind: string, mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  const add = (m: THREE.Mesh): void => { m.castShadow = true; m.receiveShadow = true; group.add(m) }
  switch (kind) {
    case 'bowl': {
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.4, side: THREE.DoubleSide })
      )
      bowl.position.y = 0.13
      add(bowl)
      for (const [x, z, c] of [[0.04, 0.02, 0xc0392b], [-0.04, 0.03, 0xe67e22], [0.01, -0.05, 0x7d9b3a]]) {
        const fruit = new THREE.Mesh(
          new THREE.SphereGeometry(0.043, 10, 8),
          new THREE.MeshStandardMaterial({ color: c as number, roughness: 0.6 })
        )
        fruit.position.set(x as number, 0.1, z as number)
        add(fruit)
      }
      break
    }
    case 'kettle': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 16), mats.get('metal'))
      body.position.y = 0.1
      add(body)
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), mats.get('metal'))
      lid.position.y = 0.21
      add(lid)
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), mats.get('metal'))
      spout.position.set(0.1, 0.13, 0)
      spout.rotation.z = -0.7
      add(spout)
      break
    }
    case 'mug': {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), mats.get('white'))
      mug.position.y = 0.05
      add(mug)
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), mats.get('white'))
      ear.position.set(0.05, 0.055, 0)
      ear.rotation.z = -Math.PI / 2
      add(ear)
      break
    }
    case 'basin': {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.12, 20), mats.get('white'))
      basin.position.y = 0.06
      add(basin)
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), mats.get('metal'))
      tap.position.set(0, 0.11, -0.2)
      add(tap)
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 8), mats.get('metal'))
      spout.position.set(0, 0.21, -0.14)
      spout.rotation.x = Math.PI / 2
      add(spout)
      break
    }
    case 'toilet': {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.4, 16), mats.get('white'))
      bowl.position.y = 0.2
      add(bowl)
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), mats.get('white'))
      seat.position.y = 0.42
      add(seat)
      const cistern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.42), mats.get('white'))
      cistern.position.set(-0.24, 0.42, 0)
      add(cistern)
      break
    }
    case 'tap': {
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), mats.get('metal'))
      spout.rotation.z = Math.PI / 2
      spout.position.set(0.08, 0.06, 0)
      add(spout)
      for (const z of [-0.09, 0.09]) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), mats.get('metal'))
        knob.position.set(0.02, 0.05, z)
        add(knob)
      }
      break
    }
    case 'basket': {
      const basket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.18, 0.5, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xc8a76a, roughness: 0.9, side: THREE.DoubleSide })
      )
      basket.position.y = 0.25
      add(basket)
      break
    }
    case 'vase': {
      const vase = new THREE.Mesh(
        new THREE.LatheGeometry(
          [[0, 0], [0.055, 0], [0.075, 0.07], [0.055, 0.19], [0.062, 0.26], [0.056, 0.26]]
            .map(([r, y]) => new THREE.Vector2(r, y)),
          16
        ),
        new THREE.MeshStandardMaterial({ color: 0x6d8b8f, roughness: 0.3 })
      )
      add(vase)
      for (const [x, z, h] of [[0.01, 0, 0.3], [-0.02, 0.02, 0.24], [0.02, -0.02, 0.27]]) {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, h as number, 5),
          mats.get('foliage')
        )
        stem.position.set(x as number, 0.26 + (h as number) / 2, z as number)
        add(stem)
      }
      break
    }
  }
  return group
}

/** Anchors are mount points (§1) carrying a neutral placeholder until a pack (C) fills them. */
/** The mesh inside a frame anchor that carries the pack's photo. See MemoryPack.ts. */
export const ANCHOR_PLATE = 'anchor-plate'

function buildFrameAnchor(width: number, height: number, mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.035, height + 0.08, width + 0.08), mats.get('darkWood'))
  frame.castShadow = true
  group.add(frame)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: 0xb9ada0, roughness: 0.9 })
  )
  plate.rotation.y = Math.PI / 2
  plate.position.x = 0.019
  // Named so MemoryPack.ts can find the picture surface of any frame anchor without
  // knowing how the frame was built (§4.2 injection). The neutral plate colour above is
  // also the "decorative anchor photo missing" fallback: a bare frame, never a hole.
  plate.name = ANCHOR_PLATE
  group.add(plate)
  return group
}

// ---------------------------------------------------------------------------
// Fitted detail
// ---------------------------------------------------------------------------

const TOP_T = 0.04
const TOP_OVERHANG = 0.02
const SKIRTING_H = 0.09
const SKIRTING_T = 0.014

/**
 * A kitchen counter declared as one solid is drawn as what it is: a wooden base unit
 * under a stone top that overhangs it slightly, with the seams of its cupboard doors and
 * a drawer line. Which face is the front is not in the data, so the seams go on both long
 * faces; the one against the wall is never seen. The blocker is the declared box.
 */
function kitchenUnit(spec: SolidSpec, mats: Materials, detail: DetailBatch): THREE.Mesh[] {
  const [x0, y0, z0] = spec.min
  const [x1, y1, z1] = spec.max
  const top = y1 - TOP_T
  const body = boxMesh({ ...spec, max: [x1, top, z1] }, mats, 'bevel', 'wood')
  body.name = `${spec.id}-unit`
  const slab = boxMesh({
    ...spec,
    min: [x0 - TOP_OVERHANG, top, z0 - TOP_OVERHANG],
    max: [x1 + TOP_OVERHANG, y1, z1 + TOP_OVERHANG]
  }, mats, 'bevel')
  slab.name = `${spec.id}-top`

  const seam = 0.006, proud = 0.003
  const alongX = x1 - x0 >= z1 - z0
  const from = alongX ? x0 : z0, to = alongX ? x1 : z1
  const doors = Math.max(1, Math.round((to - from) / 0.6))
  const step = (to - from) / doors
  const drawer = top - 0.18
  for (const face of alongX ? [z0, z1] : [x0, x1]) {
    const lo = face - proud, hi = face + proud
    for (let i = 1; i < doors; i++) {
      const c = from + i * step
      if (alongX) detail.box('dark', { x: c - seam / 2, y: y0 + 0.1, z: lo }, { x: c + seam / 2, y: top, z: hi })
      else detail.box('dark', { x: lo, y: y0 + 0.1, z: c - seam / 2 }, { x: hi, y: top, z: c + seam / 2 })
    }
    if (alongX) detail.box('dark', { x: from, y: drawer - seam / 2, z: lo }, { x: to, y: drawer + seam / 2, z: hi })
    else detail.box('dark', { x: lo, y: drawer - seam / 2, z: from }, { x: hi, y: drawer + seam / 2, z: to })
    // The kick: a dark recess line at the foot of the unit.
    if (alongX) detail.box('dark', { x: from, y: y0, z: lo }, { x: to, y: y0 + 0.1, z: hi })
    else detail.box('dark', { x: lo, y: y0, z: from }, { x: hi, y: y0 + 0.1, z: to })
  }
  return [body, slab]
}

/**
 * Skirting boards along the foot of every full-height wall segment, on both faces of an
 * interior wall and on the inside face of an exterior one. They stop at every opening,
 * because the segments do. 9 cm high: under the player body (§1.1 — nothing below
 * `PLAYER_BODY_MIN_Y` meets it), so they are drawn and never collide.
 */
function addSkirting(t: Template, detail: DetailBatch): void {
  let cx0 = Infinity, cx1 = -Infinity, cz0 = Infinity, cz1 = -Infinity
  for (const r of t.rooms) {
    cx0 = Math.min(cx0, r.min[0]); cx1 = Math.max(cx1, r.max[0])
    cz0 = Math.min(cz0, r.min[2]); cz1 = Math.max(cz1, r.max[2])
  }
  const centre = { x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2 }
  // The run, not the segment's shape, says which way a wall runs: a stub between two
  // close openings can be shorter than the wall is thick.
  for (const run of t.walls) for (const seg of expandWall(run, t.openings)) {
    if (seg.blocking === false) continue
    const [x0, , z0] = seg.min
    const [x1, , z1] = seg.max
    const alongX = run.axis === 'x'
    const exterior = run.id.startsWith('ext-')
    const faces: (1 | -1)[] = exterior
      ? [alongX ? (centre.z > (z0 + z1) / 2 ? 1 : -1) : (centre.x > (x0 + x1) / 2 ? 1 : -1)]
      : [1, -1]
    for (const f of faces) {
      if (alongX) {
        const z = f > 0 ? z1 : z0
        detail.box('white', { x: x0, y: 0, z: Math.min(z, z + f * SKIRTING_T) }, { x: x1, y: SKIRTING_H, z: Math.max(z, z + f * SKIRTING_T) })
      } else {
        const x = f > 0 ? x1 : x0
        detail.box('white', { x: Math.min(x, x + f * SKIRTING_T), y: 0, z: z0 }, { x: Math.max(x, x + f * SKIRTING_T), y: SKIRTING_H, z: z1 })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Doorway audit
// ---------------------------------------------------------------------------

export interface DoorwayReport {
  id: string
  /** Usable corridor width in metres, 0 if the opening is impassable. */
  width: number
  ok: boolean
}

/**
 * Walks a player-sized box through each opening and reports how wide the usable gap
 * actually is.
 *
 * This exists because furniture placed a few centimetres inside a doorway makes it
 * silently impassable — the wall is clear, the door swings, and the player still cannot
 * get through. Geometry that looks right in a screenshot can be unwalkable, so the
 * clearance is measured rather than eyeballed.
 */
function passableWidth(blockers: THREE.Box3[], o: OpeningSpec, radius: number): number {
  const body = new THREE.Box3()
  const centre = (o.from + o.to) / 2
  const clearAt = (lateral: number): boolean => {
    const c = centre + lateral
    // Step right through the wall and out the far side.
    for (let d = -1.0; d <= 1.0001; d += 0.1) {
      const x = o.axis === 'x' ? c : o.at + d
      const z = o.axis === 'x' ? o.at + d : c
      body.min.set(x - radius, PLAYER_BODY_MIN_Y, z - radius)
      body.max.set(x + radius, PLAYER_BODY_MAX_Y, z + radius)
      for (const b of blockers) if (body.intersectsBox(b)) return false
    }
    return true
  }
  if (!clearAt(0)) return 0
  let slack = 0
  for (let l = 0.05; l <= 0.8; l += 0.05) {
    if (!clearAt(l) || !clearAt(-l)) break
    slack = l
  }
  return (radius + slack) * 2
}

/**
 * Every opening must admit the player with its door open. Anything under the player's
 * own width is impassable; anything under ~0.7 m is passable but unpleasant.
 */
export function auditDoorways(
  openings: readonly OpeningSpec[],
  blockers: THREE.Box3[],
  doors: Map<string, Door>
): DoorwayReport[] {
  return openings.map((o) => {
    const door = doors.get(o.id)
    const consider = blockers.filter((b) => b !== door?.blocker)
    if (door) consider.push(door.openBox)
    const width = passableWidth(consider, o, PLAYER_RADIUS)
    return { id: o.id, width: +width.toFixed(2), ok: width >= PLAYER_RADIUS * 2 + 0.2 }
  })
}

export interface ReachabilityReport {
  room: string
  /** Fraction of the room's player-sized open floor actually reachable from spawn. */
  reachable: number
  openCells: number
  /** How many of the room's four corners the player can stand in, 0-4. */
  cornersReached: number
}

/**
 * Flood-fills the walkable floor from the spawn point with every door open, and reports
 * how much of each room the player can actually get to.
 *
 * The doorway audit proves you can get *into* a room. This proves you can move *around*
 * in it — that furniture has not walled off a corner, and that no pocket of floor is
 * cut off from the rest of the house.
 */
export function auditReachability(
  rooms: readonly RoomSpec[],
  blockers: THREE.Box3[],
  doors: Map<string, Door>,
  spawn: THREE.Vector3
): ReachabilityReport[] {
  const STEP = 0.25
  const minX = -16, maxX = 16, minZ = -14, maxZ = 18
  const nx = Math.ceil((maxX - minX) / STEP)
  const nz = Math.ceil((maxZ - minZ) / STEP)

  // Doors count as open: a shut door is not a permanent obstacle.
  const live = new Set([...doors.values()].map((d) => d.blocker))
  const consider = blockers.filter((b) => !live.has(b))
  for (const d of doors.values()) consider.push(d.openBox)

  const body = new THREE.Box3()
  const open = new Uint8Array(nx * nz)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = minX + i * STEP
      const z = minZ + j * STEP
      body.min.set(x - PLAYER_RADIUS, PLAYER_BODY_MIN_Y, z - PLAYER_RADIUS)
      body.max.set(x + PLAYER_RADIUS, PLAYER_BODY_MAX_Y, z + PLAYER_RADIUS)
      let free = 1
      for (const b of consider) if (body.intersectsBox(b)) { free = 0; break }
      open[i * nz + j] = free
    }
  }

  const seen = new Uint8Array(nx * nz)
  const si = Math.round((spawn.x - minX) / STEP)
  const sj = Math.round((spawn.z - minZ) / STEP)
  const queue = [si * nz + sj]
  seen[si * nz + sj] = 1
  while (queue.length) {
    const c = queue.pop()!
    const i = Math.floor(c / nz)
    const j = c % nz
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue
      const n = ni * nz + nj
      if (seen[n] || !open[n]) continue
      seen[n] = 1
      queue.push(n)
    }
  }

  return rooms.map((room) => {
    let openCells = 0
    let reached = 0
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = minX + i * STEP
        const z = minZ + j * STEP
        if (x < room.min[0] || x > room.max[0] || z < room.min[2] || z > room.max[2]) continue
        if (!open[i * nz + j]) continue
        openCells++
        if (seen[i * nz + j]) reached++
      }
    }
    // A corner counts as reached if any open, reached cell sits within 0.75 m of it.
    const corners: [number, number][] = [
      [room.min[0], room.min[2]], [room.max[0], room.min[2]],
      [room.min[0], room.max[2]], [room.max[0], room.max[2]]
    ]
    let cornersReached = 0
    for (const [cx, cz] of corners) {
      let ok = false
      for (let i = 0; i < nx && !ok; i++) {
        for (let j = 0; j < nz && !ok; j++) {
          if (!seen[i * nz + j]) continue
          const x = minX + i * STEP
          const z = minZ + j * STEP
          if (Math.abs(x - cx) <= 0.75 && Math.abs(z - cz) <= 0.75) ok = true
        }
      }
      if (ok) cornersReached++
    }
    return {
      room: room.id,
      reachable: openCells ? +(reached / openCells).toFixed(3) : 0,
      openCells,
      cornersReached
    }
  })
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * What `buildHouse` returns: a `WorldSource`, plus what the audits and the checks need
 * to know about how it was built.
 */
export interface HouseWorld extends WorldSource {
  readonly templateId: string
  /** §11.8 — the template's geometry version. */
  readonly templateVersion: number
  readonly mirrored: boolean
  /** The openings as built — already mirrored when `mirrored` is set. */
  readonly openings: readonly OpeningSpec[]
  readonly doorways: DoorwayReport[]
  readonly reachability: ReachabilityReport[]
  /**
   * The blockers with every door swung open: the floor both audits walk. A fresh array
   * each call, holding each door's open volume in place of its live blocker.
   */
  openBlockers(): THREE.Box3[]
}

export interface BuildOptions {
  /** §11.3 — flip the template left-to-right, in its data, before anything is built. */
  mirror: boolean
  /** The surfaces to dress it in. Omitted: flat colours, as if every download failed. */
  materials?: Materials
  /** Read here only for the ceiling lights' colour; surfaces read it through `materials`. */
  environment?: EnvironmentStyle
}

/**
 * SPEC.md §11.1 — the one generator. Turns any template into a `WorldSource`.
 *
 * Synchronous, and deterministic (§11.6): the same `(template, mirror)` builds identical
 * blockers, triggers, anchors, interactables, hint targets and spawn every time. Nothing
 * here downloads anything — that is `createProceduralHouse`'s job — so the checks can
 * build every template under node.
 */
export function buildHouse(template: Template, opts: BuildOptions): HouseWorld {
  const t = opts.mirror ? mirrorTemplate(template) : template
  const environment = opts.environment
  const mats = opts.materials ?? new Materials(new Map())
  if (t.openings.find((o) => o.id === t.frontDoor)?.kind !== 'door') {
    throw new Error(`Template "${t.id}": frontDoor "${t.frontDoor}" is not one of its doors`)
  }

  const root = new THREE.Group()
  root.name = 'proceduralHouse'
  const blockers: THREE.Box3[] = []
  const detail = new DetailBatch(mats)

  // ---- Ground, floors, ceilings ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mats.get('grass'))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  ground.name = 'ground'
  root.add(ground)

  for (const room of t.rooms) {
    const w = room.max[0] - room.min[0]
    const d = room.max[2] - room.min[2]
    const cx = (room.min[0] + room.max[0]) / 2
    const cz = (room.min[2] + room.max[2]) / 2

    const floorGeo = new THREE.PlaneGeometry(w, d)
    const tile = mats.tileOf(room.floor)
    if (tile) scalePlaneUV(floorGeo, w, d, tile)
    const floor = new THREE.Mesh(floorGeo, mats.get(room.floor))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(cx, 0.002, cz)
    floor.receiveShadow = true
    floor.name = `floor:${room.id}`
    root.add(floor)

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0xf4f1eb, roughness: 1 })
    )
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(cx, CEILING_HEIGHT - 0.002, cz)
    ceiling.name = `ceiling:${room.id}`
    root.add(ceiling)

    // Shadow-casting ceiling lights. The roof blocks the sun entirely, so without these
    // the interior would be lit only by ambient and read completely flat. A room longer
    // than 6 m gets two fittings — one cone cannot reach both ends of the hallway.
    const along: 'x' | 'z' = w >= d ? 'x' : 'z'
    const length = Math.max(w, d)
    const offsets = length > 7 ? [-length / 4, length / 4] : [0]
    for (const off of offsets) {
      const lx = along === 'x' ? cx + off : cx
      const lz = along === 'z' ? cz + off : cz
      const spot = new THREE.SpotLight(environment?.light === 'cool' ? 0xdceaff : environment?.light === 'neutral' ? 0xffffff : 0xffeccd, 26, 9, 1.15, 0.6, 1.4)
      spot.position.set(lx, CEILING_HEIGHT - 0.12, lz)
      spot.target.position.set(lx, 0, lz)
      spot.castShadow = true
      spot.shadow.mapSize.set(1024, 1024)
      spot.shadow.camera.near = 0.3
      spot.shadow.camera.far = 6
      spot.shadow.bias = -0.002
      spot.shadow.normalBias = 0.02
      root.add(spot, spot.target)

      const fitting = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.19, 0.1, 14),
        new THREE.MeshBasicMaterial({ color: 0xfff1d6 })
      )
      fitting.position.set(lx, CEILING_HEIGHT - 0.07, lz)
      root.add(fitting)
    }
  }

  // ---- Walls, furniture, porch and fence ----
  const walls = t.walls.flatMap((run) => expandWall(run, t.openings))
  const furniture = new Set(t.furniture)
  for (const spec of [...walls, ...t.furniture, ...t.exterior, ...t.garden.fence]) {
    // `invisible` specs are blockers only — props whose visible form is built from
    // primitives further down (the toilet).
    if (!spec.invisible) {
      if (furniture.has(spec) && spec.surface === 'counter' && spec.max[1] - spec.min[1] > 0.3) {
        for (const mesh of kitchenUnit(spec, mats, detail)) root.add(mesh)
      } else {
        const mesh = boxMesh(spec, mats, !furniture.has(spec) ? 'square' : spec.soft ? 'soft' : 'bevel')
        if (spec.surface === 'wall' && spec.id.startsWith('ext-')) mesh.castShadow = true
        root.add(mesh)
      }
    }
    if (spec.blocking !== false) {
      blockers.push(new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max)))
    }
  }
  addSkirting(t, detail)

  for (const spec of t.tables) {
    root.add(buildTable(spec, mats, detail))
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.min[0], 0, spec.min[1]),
      new THREE.Vector3(spec.max[0], spec.topY, spec.max[1])
    ))
  }

  for (const spec of t.chairs) {
    root.add(buildChair(spec, mats))
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.25, 0, spec.at[1] - 0.25),
      new THREE.Vector3(spec.at[0] + 0.25, 0.95, spec.at[1] + 0.25)
    ))
  }

  for (const spec of t.windows) root.add(buildWindow(spec, mats, 0.24, detail))

  for (const spec of t.plants) {
    const plant = buildPlant(mats, spec.scale)
    plant.position.set(spec.at[0], 0, spec.at[1])
    plant.name = spec.id
    root.add(plant)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.2, 0, spec.at[1] - 0.2),
      new THREE.Vector3(spec.at[0] + 0.2, 0.8, spec.at[1] + 0.2)
    ))
  }

  for (const spec of t.garden.trees) {
    const tree = buildTree(mats, spec.scale)
    tree.position.set(spec.at[0], 0, spec.at[1])
    tree.name = spec.id
    root.add(tree)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.3, 0, spec.at[1] - 0.3),
      new THREE.Vector3(spec.at[0] + 0.3, 2.5, spec.at[1] + 0.3)
    ))
  }

  for (const spec of t.lamps) {
    const lamp = buildLamp(mats)
    lamp.position.set(spec.at[0], 0, spec.at[1])
    lamp.name = spec.id
    root.add(lamp)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.22, 0, spec.at[1] - 0.22),
      new THREE.Vector3(spec.at[0] + 0.22, 1.8, spec.at[1] + 0.22)
    ))
  }

  for (const spec of t.props) {
    const prop = buildProp(spec.kind, mats)
    prop.position.set(...spec.at)
    if (spec.yaw !== undefined) prop.rotation.y = spec.yaw
    prop.name = spec.id
    root.add(prop)
  }
  // ---- Doors ----
  const doors = new Map<string, Door>()
  const interactables: Record<string, THREE.Object3D> = {}
  const hintTargets: Record<string, THREE.Object3D> = {}

  for (const spec of t.openings) {
    if (spec.kind !== 'door') continue
    const door = new Door(spec, mats)
    doors.set(spec.id, door)
    root.add(door.pivot, buildTrim(spec, mats))
    blockers.push(door.blocker)
    tagInteractable(door.pivot, {
      id: spec.id,
      label: spec.label,
      verb: () => (door.open ? 'Close' : 'Open'),
      activate: () => door.toggle(),
      // §5.2's occlusion loop must skip this, or a closed door occludes itself.
      ownBlockers: [door.blocker]
    })
    interactables[spec.id] = door.pivot
    hintTargets[spec.id] = door.pivot
  }

  // An arch has no slab to open, so it is never an interactable — but it is the thing
  // to point at when the step is "go to the living room", which has no door of its own.
  for (const spec of t.openings) {
    if (spec.kind !== 'arch') continue
    const trim = buildTrim(spec, mats)
    root.add(trim)
    hintTargets[spec.id] = trim
  }

  // ---- Interactables and anchors ----
  const jug = buildWaterJug(mats)
  jug.position.set(...t.mounts.waterJug.at)
  jug.rotation.y = t.mounts.waterJug.yaw
  tagInteractable(jug, { id: 'water-jug', label: 'water jug', verb: () => 'Look at' })
  root.add(jug)
  interactables['water-jug'] = jug
  hintTargets['water-jug'] = jug

  const livingRoomWall = buildFrameAnchor(0.95, 0.7, mats)
  livingRoomWall.position.set(...t.mounts.livingRoomWall.at)
  livingRoomWall.rotation.y = t.mounts.livingRoomWall.yaw
  livingRoomWall.name = 'anchor:livingRoomWall'
  root.add(livingRoomWall)
  // The same object is both a personalisation anchor and something the player walks up
  // to and looks at. The verb is "Look at" and nothing else: pressing E on the picture
  // does not take it down, turn it over or open anything, and the prompt must not
  // suggest that it does.
  tagInteractable(livingRoomWall, {
    id: 'wall-photo',
    label: 'framed photograph',
    verb: () => 'Look at'
  })
  interactables['wall-photo'] = livingRoomWall
  hintTargets['wall-photo'] = livingRoomWall

  const eventFrame = buildFrameAnchor(0.95, 0.7, mats)
  eventFrame.position.set(...t.mounts.eventFrame.at)
  eventFrame.rotation.y = t.mounts.eventFrame.yaw
  eventFrame.name = 'anchor:eventFrame'
  root.add(eventFrame)

  const bedsideFrame = buildFrameAnchor(0.2, 0.26, mats)
  bedsideFrame.position.set(...t.mounts.bedsideFrame.at)
  bedsideFrame.rotation.y = t.mounts.bedsideFrame.yaw
  bedsideFrame.name = 'anchor:bedsideFrame'
  root.add(bedsideFrame)

  /**
   * The radio: the `audioSource` anchor the pack's voices play from, and — since the
   * levels ask the player to find it — something that has to read as a radio at a
   * glance from across the room.
   *
   * It was a plain dark box with its one distinguishing feature, the speaker grille,
   * on the face turned towards the wall. Against the black television beside it, at
   * the far end of a dim living room, it was very close to invisible. It is now a
   * warm-cased set whose speaker, dial and carry handle all face the way the player
   * comes in, which is what "recognisable, not beautiful" (§1.1) has to mean when a
   * step says "can you find the radio?".
   *
   * The front of the set is its local -Z face; the template's mount turns it to face
   * the way the player comes in.
   */
  const audioSource = new THREE.Group()
  audioSource.name = 'anchor:audioSource'
  const FRONT = -0.075
  const radio = simpleBox(mats, 'wood', 0, 0.09, 0, 0.34, 0.18, 0.15)
  audioSource.add(radio)
  // Speaker grille, left of centre and facing the room.
  const grille = new THREE.Mesh(
    new THREE.CircleGeometry(0.058, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.95 })
  )
  grille.position.set(-0.08, 0.09, FRONT - 0.001)
  grille.rotation.y = Math.PI
  audioSource.add(grille)
  // Tuning dial and its pointer, right of centre.
  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.55, metalness: 0.2 })
  )
  dial.rotation.x = Math.PI / 2
  dial.position.set(0.085, 0.09, FRONT - 0.004)
  audioSource.add(dial)
  const scale = new THREE.Mesh(
    new THREE.PlaneGeometry(0.115, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.8 })
  )
  scale.position.set(0.0, 0.155, FRONT - 0.001)
  scale.rotation.y = Math.PI
  audioSource.add(scale)
  // Carry handle across the top — the silhouette that says "radio" from a distance.
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3c3a38, roughness: 0.7 })
  )
  // Left in the XY plane: the half-arc then reads as a handle from the front, which is
  // where the player sees it. Turned into ZY it is edge-on and looks like an aerial.
  handle.position.set(0, 0.18, 0)
  audioSource.add(handle)
  for (const part of [radio, grille, dial, scale, handle]) part.castShadow = true
  audioSource.position.set(...t.mounts.audioSource.at)
  audioSource.rotation.y = t.mounts.audioSource.yaw
  root.add(audioSource)
  // Likewise the radio: it is the `audioSource` anchor the pack's voices play from, and
  // it is also a findable object. "Look at", not "Switch on" — E does not operate it,
  // and §9 of the level brief is that an instruction never claims otherwise.
  tagInteractable(audioSource, { id: 'radio', label: 'radio', verb: () => 'Look at' })
  interactables['radio'] = audioSource
  hintTargets['radio'] = audioSource

  // Everything that never moves, merged: one mesh per surface.
  for (const mesh of detail.meshes()) root.add(mesh)

  // ---- World ----
  const triggers = t.rooms.map((r) => ({
    room: r.id,
    box: new THREE.Box3(new THREE.Vector3(...r.min), new THREE.Vector3(...r.max))
  }))

  const spawnPos = new THREE.Vector3(...t.spawn.position)
  const [lookX, lookZ] = t.spawn.lookAt
  // Camera forward is -Z at yaw 0, so yaw = atan2(-dx, -dz).
  const yaw = Math.atan2(-(lookX - spawnPos.x), -(lookZ - spawnPos.z))

  const openBlockers = (): THREE.Box3[] => {
    // Doors count as open: a shut door is not a permanent obstacle.
    const live = new Set([...doors.values()].map((d) => d.blocker))
    return [...blockers.filter((b) => !live.has(b)), ...[...doors.values()].map((d) => d.openBox)]
  }

  const world: HouseWorld = {
    root,
    blockers,
    triggers,
    anchors: { livingRoomWall, bedsideFrame, eventFrame, audioSource },
    interactables,
    hintTargets,
    spawn: { position: spawnPos, yaw },
    roomOf(point: THREE.Vector3): string | null {
      // Containment, not entry (§1). Declaration order breaks the doorway overlaps.
      for (const trigger of triggers) if (trigger.box.containsPoint(point)) return trigger.room
      return null
    },
    update(dt: number): boolean {
      let moved = false
      // Every door is stepped; `some` would short-circuit and freeze the rest.
      for (const door of doors.values()) if (door.update(dt)) moved = true
      return moved
    },
    templateId: t.id,
    templateVersion: t.version,
    mirrored: opts.mirror,
    openings: t.openings,
    doorways: auditDoorways(t.openings, blockers, doors),
    reachability: auditReachability(t.rooms, blockers, doors, spawnPos),
    openBlockers
  }
  return world
}

/**
 * Downloads the texture sets, then builds `template` with them (§1.1: every download
 * is optional, and a failed one leaves that surface a flat colour).
 */
export async function createProceduralHouse(
  template: Template,
  build: { mirror: boolean },
  onProgress?: StageProgress,
  environment?: EnvironmentStyle,
  options: HouseOptions = {}
): Promise<{ world: HouseWorld; report: HouseBuildReport; upgradeTextures: (to: TextureResolution) => Promise<UpgradeReport> }> {
  const resolution = options.resolution ?? '1k'
  const anisotropy = options.anisotropy ?? 4

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const texturesLoaded: string[] = []
  const texturesFailed: string[] = []
  const sets = new Map<string, MapTriplet | null>()

  // Three maps per set — diffuse, roughness, normal. The denominator is known before
  // the first request, which is the whole reason this can be an honest count.
  const textureTotal = TEXTURE_NAMES.length * 3
  let textureDone = 0
  let textureFailed = 0
  onProgress?.('textures', 0, 0, textureTotal)

  await Promise.all(
    TEXTURE_NAMES.map(async (name) => {
      try {
        sets.set(
          name,
          await loadSet(loader, name, { resolution, anisotropy }, (fileOk) => {
            if (fileOk) textureDone++
            else textureFailed++
            onProgress?.('textures', textureDone, textureFailed, textureTotal)
          })
        )
        texturesLoaded.push(name)
      } catch {
        // Degradation contract: flat colour, keep going, never block the load.
        sets.set(name, null)
        texturesFailed.push(name)
      }
    })
  )

  // A set that failed early leaves its siblings' requests unsettled; report the stage as
  // finished rather than leaving the count short of its own denominator.
  onProgress?.('textures', textureDone, textureTotal - textureDone, textureTotal)
  // Geometry from here on: no downloads, so no counts. The stage exists because the
  // audits below take visible time on a slow machine and silence looks like a hang.
  onProgress?.('house', 0, 0, 0)

  const mats = new Materials(sets, environment, anisotropy)
  const world = buildHouse(template, { mirror: build.mirror, materials: mats, environment })
  const { doorways, reachability } = world

  const impassable = doorways.filter((d) => !d.ok)
  if (impassable.length) {
    console.error(
      '[memoria] impassable or tight doorways:',
      impassable.map((d) => `${d.id} ${d.width}m`).join(', ')
    )
  }

  const cutOff = reachability.filter((r) => r.reachable < 0.98 || r.cornersReached < 4)
  if (cutOff.length) {
    console.warn(
      '[memoria] rooms with unreachable floor:',
      cutOff.map((r) => `${r.room} ${(r.reachable * 100).toFixed(0)}% corners ${r.cornersReached}/4`).join(', ')
    )
  }

  /**
   * Raises the loaded sets to a larger size, after boot and off the critical path.
   *
   * The reason this is an upgrade pass rather than simply a bigger `bootResolution` is
   * that the two costs are different things. A 2k set is four times the bytes, which is
   * download time — paid once, and paid on the loading screen if it happens during boot.
   * It is *not* four times the frame cost: the draw calls, the shaders and the triangle
   * count are identical, and a mip chain means the pixels being sampled at any distance
   * are about the same number either way. So the sharpness is close to free to *render*
   * and expensive to *fetch*, and fetching it afterwards is how you get one without the
   * other. Sets are fetched one at a time for the same reason — twelve simultaneous 2k
   * requests would compete with the memory pack's photographs and voices.
   */
  const upgradeTextures = async (to: TextureResolution): Promise<UpgradeReport> => {
    const upgraded: string[] = []
    const failed: string[] = []
    for (const name of TEXTURE_NAMES) {
      if (!sets.get(name) || surfacesOf(name).every((surface) => stylesSurface(surface, environment))) {
        failed.push(name)
        continue
      }
      try {
        const maps = await loadSet(loader, name, { resolution: to, anisotropy, timeoutMs: UPGRADE_TIMEOUT_MS }, () => {})
        if (mats.replace(name, maps)) upgraded.push(name)
        else {
          for (const t of [maps.map, maps.roughnessMap, maps.normalMap]) t.dispose()
          failed.push(name)
        }
      } catch {
        // §1.1 again: a failed upgrade is not a failure, it is the previous size.
        failed.push(name)
      }
    }
    return { resolution: to, upgraded, failed }
  }

  // Total stays 0 so the row shows a tick and no count: there was nothing to fetch.
  onProgress?.('house', 1, 0, 0)
  return {
    world,
    report: {
      texturesLoaded, texturesFailed, textureResolution: resolution, anisotropy, doorways, reachability,
      template: { id: world.templateId, version: world.templateVersion, mirrored: world.mirrored }
    },
    upgradeTextures
  }
}
