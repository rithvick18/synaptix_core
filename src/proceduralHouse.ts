import * as THREE from 'three'
import {
  ARCHES,
  AUDIO_SOURCE_ANCHOR,
  BEDSIDE_FRAME_ANCHOR,
  BEDSIDE_FRAME_YAW,
  CEILING_HEIGHT,
  CHAIRS,
  DOORS,
  FURNITURE,
  JUG_POSITION,
  LAMPS,
  LIVING_ROOM_WALL_ANCHOR,
  LIVING_ROOM_WALL_YAW,
  PLANTS,
  PROPS,
  ROOMS,
  SPAWN_LOOK_AT,
  SPAWN_POSITION,
  TABLES,
  TREES,
  WALLS,
  WINDOWS,
  type ChairSpec,
  type DoorSpec,
  type SolidSpec,
  type Surface,
  type WindowSpec
} from './layout'
import { tagInteractable, type WorldSource } from './World'

/**
 * SPEC.md §1.1 — the default world, built from primitives.
 *
 * §1.1's degradation contract governs every download here: textures are fetched with a
 * timeout and the house falls back to flat `MeshStandardMaterial`s; the HDRI is handled
 * the same way in Renderer.ts. With the network offline the house still renders, still
 * lights, and is still walkable.
 */

const POLY_HAVEN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k'
const TEXTURE_TIMEOUT_MS = 8000

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

/** Which Poly Haven set backs which surface, and at what world tile size in metres. */
const TEXTURE_SET: Partial<Record<Surface, { name: string; tile: number }>> = {
  wall: { name: 'painted_plaster_wall', tile: 2.5 },
  woodFloor: { name: 'laminate_floor_02', tile: 2.0 },
  tileFloor: { name: 'square_tiles_03', tile: 1.5 },
  counter: { name: 'marble_01', tile: 1.2 }
}

export interface HouseBuildReport {
  texturesLoaded: string[]
  texturesFailed: string[]
}

type MapTriplet = { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture }

function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    // A hung request must not hold the loading screen open — §1.1 is a hard "always works".
    const timer = setTimeout(() => reject(new Error(`timeout ${url}`)), TEXTURE_TIMEOUT_MS)
    loader.load(url, (t) => { clearTimeout(timer); resolve(t) }, undefined, () => {
      clearTimeout(timer); reject(new Error(`failed ${url}`))
    })
  })
}

async function loadSet(loader: THREE.TextureLoader, name: string): Promise<MapTriplet> {
  const [map, roughnessMap, normalMap] = await Promise.all([
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_diff_1k.jpg`),
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_rough_1k.jpg`),
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_nor_gl_1k.jpg`)
  ])
  map.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
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

/** BoxGeometry emits faces in the order +X, -X, +Y, -Y, +Z, -Z, four vertices each. */
function scaleBoxUV(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, tile: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const spans: [number, number][] = [
    [sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]
  ]
  for (let f = 0; f < 6; f++) {
    const [u, v] = spans[f]
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * (u / tile), uv.getY(i) * (v / tile))
    }
  }
  uv.needsUpdate = true
}

class Materials {
  private cache = new Map<Surface, THREE.MeshStandardMaterial>()
  constructor(private sets: Map<Surface, MapTriplet | null>) {}

  get(surface: Surface): THREE.MeshStandardMaterial {
    let m = this.cache.get(surface)
    if (m) return m
    m = new THREE.MeshStandardMaterial({
      color: SURFACE_COLOUR[surface],
      roughness: SURFACE_ROUGHNESS[surface],
      metalness: SURFACE_METALNESS[surface]
    })
    if (surface === 'glass') { m.transparent = true; m.opacity = 0.55 }
    const maps = this.sets.get(surface)
    if (maps) {
      m.map = maps.map
      m.roughnessMap = maps.roughnessMap
      m.normalMap = maps.normalMap
      // Tint multiplies into the map; plain white left the plaster a cold grey.
      m.color.set(surface === 'wall' ? 0xf4ead9 : 0xffffff)
    }
    this.cache.set(surface, m)
    return m
  }

  tileOf(surface: Surface): number | null {
    return this.sets.get(surface) ? (TEXTURE_SET[surface]?.tile ?? null) : null
  }
}

function boxMesh(spec: SolidSpec, mats: Materials): THREE.Mesh {
  const sx = spec.max[0] - spec.min[0]
  const sy = spec.max[1] - spec.min[1]
  const sz = spec.max[2] - spec.min[2]
  const geo = new THREE.BoxGeometry(sx, sy, sz)
  const tile = mats.tileOf(spec.surface)
  if (tile) scaleBoxUV(geo, sx, sy, sz, tile)
  const mesh = new THREE.Mesh(geo, mats.get(spec.surface))
  mesh.position.set(
    (spec.min[0] + spec.max[0]) / 2,
    (spec.min[1] + spec.max[1]) / 2,
    (spec.min[2] + spec.max[2]) / 2
  )
  mesh.name = spec.id
  mesh.castShadow = spec.castShadow ?? false
  mesh.receiveShadow = true
  return mesh
}

function simpleBox(
  mats: Materials, surface: Surface, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, cast = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats.get(surface))
  mesh.position.set(x, y, z)
  mesh.castShadow = cast
  mesh.receiveShadow = true
  return mesh
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

const OPEN_ANGLE = THREE.MathUtils.degToRad(96)
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

  private amount = 0
  private closedBox = new THREE.Box3()
  private openBox = new THREE.Box3()
  private baseYaw: number

  constructor(readonly spec: DoorSpec, mats: Materials) {
    const width = spec.to - spec.from
    const slabW = width - 0.02
    const slabT = Math.min(spec.thickness - 0.02, 0.06)

    // Build the slab so the hinge sits at the pivot's origin, on the floor, with the
    // slab extending along local +X.
    const geo = new THREE.BoxGeometry(slabW, spec.height, slabT)
    geo.translate(slabW / 2, spec.height / 2, 0)
    const slab = new THREE.Mesh(geo, mats.get('darkWood'))
    slab.castShadow = true
    slab.receiveShadow = true
    slab.name = `${spec.id}-slab`
    this.pivot.add(slab)

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
    this.openBox.setFromObject(slab).expandByScalar(0.03)
    this.pivot.rotation.y = this.baseYaw
    this.pivot.updateMatrixWorld(true)

    this.blocker.copy(this.closedBox)
  }

  toggle(): string {
    this.open = !this.open
    return this.open ? 'open' : 'close'
  }

  update(dt: number): void {
    const target = this.open ? 1 : 0
    if (this.amount === target) return
    const step = dt / SWING_SECONDS
    this.amount = target > this.amount
      ? Math.min(target, this.amount + step)
      : Math.max(target, this.amount - step)
    this.pivot.rotation.y = this.baseYaw + this.spec.swing * OPEN_ANGLE * this.amount
    // Past half-swing the doorway is clear and the slab is what stands in the room.
    this.blocker.copy(this.amount < 0.5 ? this.closedBox : this.openBox)
  }
}

/** Trim around a door or archway, so an opening reads as a framed one. */
function buildTrim(spec: DoorSpec, mats: Materials): THREE.Object3D {
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

function buildTable(spec: (typeof TABLES)[number], mats: Materials): THREE.Object3D {
  const group = new THREE.Group()
  group.name = spec.id
  const w = spec.max[0] - spec.min[0]
  const d = spec.max[1] - spec.min[1]
  const cx = (spec.min[0] + spec.max[0]) / 2
  const cz = (spec.min[1] + spec.max[1]) / 2
  group.add(simpleBox(mats, spec.surface, cx, spec.topY - spec.topT / 2, cz, w, spec.topT, d))
  const legH = spec.topY - spec.topT
  const inset = spec.legT / 2 + 0.06
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
function buildWindow(spec: WindowSpec, mats: Materials, wallThickness: number): THREE.Object3D {
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
  group.add(plate)
  return group
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function createProceduralHouse(): Promise<{ world: WorldSource; report: HouseBuildReport }> {
  const root = new THREE.Group()
  root.name = 'proceduralHouse'

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const texturesLoaded: string[] = []
  const texturesFailed: string[] = []
  const sets = new Map<Surface, MapTriplet | null>()

  await Promise.all(
    (Object.keys(TEXTURE_SET) as Surface[]).map(async (surface) => {
      const { name } = TEXTURE_SET[surface]!
      try {
        sets.set(surface, await loadSet(loader, name))
        texturesLoaded.push(name)
      } catch {
        // Degradation contract: flat colour, keep going, never block the load.
        sets.set(surface, null)
        texturesFailed.push(name)
      }
    })
  )

  const mats = new Materials(sets)
  const blockers: THREE.Box3[] = []

  // ---- Ground, floors, ceilings ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mats.get('grass'))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  ground.name = 'ground'
  root.add(ground)

  for (const room of ROOMS) {
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
    const offsets = length > 6 ? [-length / 4, length / 4] : [0]
    for (const off of offsets) {
      const lx = along === 'x' ? cx + off : cx
      const lz = along === 'z' ? cz + off : cz
      const spot = new THREE.SpotLight(0xffeccd, 26, 9, 1.15, 0.6, 1.4)
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

  // ---- Walls and furniture ----
  for (const spec of [...WALLS, ...FURNITURE]) {
    const mesh = boxMesh(spec, mats)
    if (spec.surface === 'wall' && spec.id.startsWith('ext-')) mesh.castShadow = true
    root.add(mesh)
    if (spec.blocking !== false) {
      blockers.push(new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max)))
    }
  }

  for (const spec of TABLES) {
    root.add(buildTable(spec, mats))
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.min[0], 0, spec.min[1]),
      new THREE.Vector3(spec.max[0], spec.topY, spec.max[1])
    ))
  }

  for (const spec of CHAIRS) {
    root.add(buildChair(spec, mats))
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.25, 0, spec.at[1] - 0.25),
      new THREE.Vector3(spec.at[0] + 0.25, 0.95, spec.at[1] + 0.25)
    ))
  }

  for (const spec of WINDOWS) root.add(buildWindow(spec, mats, 0.24))

  for (const spec of PLANTS) {
    const plant = buildPlant(mats, spec.scale)
    plant.position.set(spec.at[0], 0, spec.at[1])
    plant.name = spec.id
    root.add(plant)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.2, 0, spec.at[1] - 0.2),
      new THREE.Vector3(spec.at[0] + 0.2, 0.8, spec.at[1] + 0.2)
    ))
  }

  for (const spec of TREES) {
    const tree = buildTree(mats, spec.scale)
    tree.position.set(spec.at[0], 0, spec.at[1])
    tree.name = spec.id
    root.add(tree)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.3, 0, spec.at[1] - 0.3),
      new THREE.Vector3(spec.at[0] + 0.3, 2.5, spec.at[1] + 0.3)
    ))
  }

  for (const spec of LAMPS) {
    const lamp = buildLamp(mats)
    lamp.position.set(spec.at[0], 0, spec.at[1])
    lamp.name = spec.id
    root.add(lamp)
    blockers.push(new THREE.Box3(
      new THREE.Vector3(spec.at[0] - 0.22, 0, spec.at[1] - 0.22),
      new THREE.Vector3(spec.at[0] + 0.22, 1.8, spec.at[1] + 0.22)
    ))
  }

  for (const spec of PROPS) {
    const prop = buildProp(spec.kind, mats)
    prop.position.set(...spec.at)
    prop.name = spec.id
    root.add(prop)
  }
  // The toilet is the one prop big enough to walk into.
  blockers.push(new THREE.Box3(new THREE.Vector3(-5.85, 0, 1.44), new THREE.Vector3(-5.2, 0.75, 1.96)))

  // ---- Doors ----
  const doors = new Map<string, Door>()
  const interactables: Record<string, THREE.Object3D> = {}
  const hintTargets: Record<string, THREE.Object3D> = {}

  for (const spec of DOORS) {
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

  for (const spec of ARCHES) root.add(buildTrim(spec, mats))

  // ---- Interactables and anchors ----
  const jug = buildWaterJug(mats)
  jug.position.set(...JUG_POSITION)
  // Handle turned to the player's right on approach, so it reads in silhouette.
  jug.rotation.y = Math.PI
  tagInteractable(jug, { id: 'water-jug', label: 'water jug', verb: () => 'Look at' })
  root.add(jug)
  interactables['water-jug'] = jug
  hintTargets['water-jug'] = jug

  const livingRoomWall = buildFrameAnchor(0.95, 0.7, mats)
  livingRoomWall.position.set(...LIVING_ROOM_WALL_ANCHOR)
  livingRoomWall.rotation.y = LIVING_ROOM_WALL_YAW
  livingRoomWall.name = 'anchor:livingRoomWall'
  root.add(livingRoomWall)

  const bedsideFrame = buildFrameAnchor(0.2, 0.26, mats)
  bedsideFrame.position.set(BEDSIDE_FRAME_ANCHOR[0], BEDSIDE_FRAME_ANCHOR[1] + 0.17, BEDSIDE_FRAME_ANCHOR[2])
  bedsideFrame.rotation.y = BEDSIDE_FRAME_YAW
  bedsideFrame.name = 'anchor:bedsideFrame'
  root.add(bedsideFrame)

  const audioSource = new THREE.Group()
  audioSource.name = 'anchor:audioSource'
  const radio = simpleBox(mats, 'dark', 0, 0.07, 0, 0.3, 0.14, 0.13)
  audioSource.add(radio)
  const speaker = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 14),
    new THREE.MeshStandardMaterial({ color: 0x55585d, roughness: 0.9 })
  )
  speaker.position.set(-0.07, 0.07, 0.066)
  audioSource.add(speaker)
  audioSource.position.set(...AUDIO_SOURCE_ANCHOR)
  root.add(audioSource)

  // ---- World ----
  const triggers = ROOMS.map((r) => ({
    room: r.id,
    box: new THREE.Box3(new THREE.Vector3(...r.min), new THREE.Vector3(...r.max))
  }))

  const spawnPos = new THREE.Vector3(...SPAWN_POSITION)
  // Camera forward is -Z at yaw 0, so yaw = atan2(-dx, -dz).
  const yaw = Math.atan2(-(SPAWN_LOOK_AT[0] - spawnPos.x), -(SPAWN_LOOK_AT[1] - spawnPos.z))

  const world: WorldSource = {
    root,
    blockers,
    triggers,
    anchors: { livingRoomWall, bedsideFrame, audioSource },
    interactables,
    hintTargets,
    spawn: { position: spawnPos, yaw },
    roomOf(point: THREE.Vector3): string | null {
      // Containment, not entry (§1). Declaration order breaks the doorway overlaps.
      for (const t of triggers) if (t.box.containsPoint(point)) return t.room
      return null
    },
    update(dt: number): void {
      for (const door of doors.values()) door.update(dt)
    }
  }

  return { world, report: { texturesLoaded, texturesFailed } }
}
