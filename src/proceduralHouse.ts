import * as THREE from 'three'
import {
  AUDIO_SOURCE_ANCHOR,
  BEDSIDE_FRAME_ANCHOR,
  CEILING_HEIGHT,
  DOORWAY_CENTRE,
  DOOR_HALF_WIDTH,
  DOOR_HEIGHT,
  FURNITURE,
  JUG_POSITION,
  LIVING_ROOM_WALL_ANCHOR,
  ROOMS,
  SPAWN_LOOK_AT,
  SPAWN_POSITION,
  WALLS,
  type SolidSpec,
  type Surface
} from './layout'
import { tagInteractable, type WorldSource } from './World'

/**
 * SPEC.md §1.1 — the default world, built from primitives.
 *
 * §1.1's degradation contract is the governing rule here: every network asset is
 * optional. Textures are fetched with a timeout and the scene falls back to flat
 * `MeshStandardMaterial`s; the HDRI is handled in Renderer.ts the same way. With the
 * network offline the house still renders, still lights, and is still walkable.
 */

const POLY_HAVEN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k'
const TEXTURE_TIMEOUT_MS = 8000

/** Flat fallbacks — also the base colour when textures do load. */
const SURFACE_COLOUR: Record<Surface, number> = {
  wall: 0xdcd3c6,
  floor: 0x8a6a4a,
  wood: 0x8a6244,
  stone: 0xbdb7ad,
  metal: 0xb9bcc0,
  fabric: 0x6b7f88
}

const SURFACE_ROUGHNESS: Record<Surface, number> = {
  wall: 0.95,
  floor: 0.7,
  wood: 0.65,
  stone: 0.45,
  metal: 0.35,
  fabric: 0.9
}

const SURFACE_METALNESS: Record<Surface, number> = {
  wall: 0,
  floor: 0,
  wood: 0,
  stone: 0,
  metal: 0.75,
  fabric: 0
}

/** Which Poly Haven set backs which surface. Surfaces absent here stay flat by design. */
const TEXTURE_SET: Partial<Record<Surface, string>> = {
  wall: 'painted_plaster_wall',
  floor: 'laminate_floor_02',
  stone: 'marble_01'
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
    loader.load(
      url,
      (tex) => {
        clearTimeout(timer)
        resolve(tex)
      },
      undefined,
      () => {
        clearTimeout(timer)
        reject(new Error(`failed ${url}`))
      }
    )
  })
}

async function loadSet(loader: THREE.TextureLoader, name: string, repeat: number): Promise<MapTriplet> {
  const [map, roughnessMap, normalMap] = await Promise.all([
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_diff_1k.jpg`),
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_rough_1k.jpg`),
    loadTexture(loader, `${POLY_HAVEN}/${name}/${name}_nor_gl_1k.jpg`)
  ])
  map.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat, repeat)
    t.anisotropy = 4
  }
  return { map, roughnessMap, normalMap }
}

function makeMaterial(surface: Surface, maps: MapTriplet | null): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: SURFACE_COLOUR[surface],
    roughness: SURFACE_ROUGHNESS[surface],
    metalness: SURFACE_METALNESS[surface]
  })
  if (maps) {
    // Cloned so each surface can carry its own repeat without sharing texture state.
    mat.map = maps.map
    mat.roughnessMap = maps.roughnessMap
    mat.normalMap = maps.normalMap
    mat.color.set(0xffffff)
  }
  return mat
}

function boxMesh(spec: SolidSpec, material: THREE.Material): THREE.Mesh {
  const sx = spec.max[0] - spec.min[0]
  const sy = spec.max[1] - spec.min[1]
  const sz = spec.max[2] - spec.min[2]
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
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

/** §1.1: "The jug may be a lathe or cylinder+torus primitive." */
function buildWaterJug(): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'water-jug'

  const ceramic = new THREE.MeshStandardMaterial({ color: 0xc8d6de, roughness: 0.25, metalness: 0.05 })

  // Lathe profile: a bellied jug, ~0.30 m tall.
  const profile: THREE.Vector2[] = []
  const rings: [number, number][] = [
    [0.0, 0.0],
    [0.075, 0.0],
    [0.085, 0.02],
    [0.105, 0.09],
    [0.1, 0.17],
    [0.07, 0.235],
    [0.062, 0.27],
    [0.07, 0.3],
    [0.064, 0.3]
  ]
  for (const [r, y] of rings) profile.push(new THREE.Vector2(r, y))
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), ceramic)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Torus lies in its local XY plane by default; the open 0.75 rad of the arc is turned
  // to face the body so the handle reads as a handle rather than a ring.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20, Math.PI * 1.25), ceramic)
  handle.position.set(0.125, 0.2, 0)
  handle.rotation.z = -0.625 * Math.PI
  handle.castShadow = true
  group.add(handle)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.07, 0.12, 20),
    new THREE.MeshStandardMaterial({ color: 0x9fd6e8, roughness: 0.1, metalness: 0 })
  )
  water.position.y = 0.11
  group.add(water)

  return group
}

/** The `kitchenDoor` hint target: jambs and a head trim framing the passable doorway. */
function buildDoorFrame(): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'kitchenDoor'
  const trim = new THREE.MeshStandardMaterial({ color: 0x5c4433, roughness: 0.6 })
  const t = 0.08
  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.24, DOOR_HEIGHT, t), trim)
    jamb.position.set(0, DOOR_HEIGHT / 2, side * (DOOR_HALF_WIDTH + t / 2))
    jamb.castShadow = true
    group.add(jamb)
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, t, DOOR_HALF_WIDTH * 2 + t * 2), trim)
  head.position.set(0, DOOR_HEIGHT + t / 2, 0)
  group.add(head)
  return group
}

/**
 * Anchors are mount points (§1). Each carries a neutral placeholder so the spot is
 * visible before a pack supplies media — packs land in Checkpoint C.
 */
function buildFrameAnchor(width: number, height: number): THREE.Object3D {
  const group = new THREE.Group()
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, height + 0.06, width + 0.06),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.7 })
  )
  frame.castShadow = true
  group.add(frame)
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color: 0xb9ada0, roughness: 0.9 })
  )
  plate.rotation.y = Math.PI / 2
  plate.position.x = 0.016
  group.add(plate)
  return group
}

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
      const name = TEXTURE_SET[surface]!
      const repeat = surface === 'floor' ? 6 : surface === 'wall' ? 4 : 2
      try {
        sets.set(surface, await loadSet(loader, name, repeat))
        texturesLoaded.push(name)
      } catch {
        // Degradation contract: flat colour, keep going, never block the load.
        sets.set(surface, null)
        texturesFailed.push(name)
      }
    })
  )

  const materials = new Map<Surface, THREE.MeshStandardMaterial>()
  const materialFor = (surface: Surface): THREE.MeshStandardMaterial => {
    let m = materials.get(surface)
    if (!m) {
      m = makeMaterial(surface, sets.get(surface) ?? null)
      materials.set(surface, m)
    }
    return m
  }

  // Floor and ceiling.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 8.4), materialFor('floor'))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.name = 'floor'
  root.add(floor)

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(10.4, 8.4),
    new THREE.MeshStandardMaterial({ color: 0xf0ece6, roughness: 1 })
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = CEILING_HEIGHT
  ceiling.name = 'ceiling'
  root.add(ceiling)

  // Walls and furniture, plus the blockers derived from the same specs.
  const blockers: THREE.Box3[] = []
  for (const spec of [...WALLS, ...FURNITURE]) {
    root.add(boxMesh(spec, materialFor(spec.surface)))
    if (spec.blocking !== false) {
      blockers.push(new THREE.Box3(new THREE.Vector3(...spec.min), new THREE.Vector3(...spec.max)))
    }
  }

  // Interactables and hint targets.
  const jug = buildWaterJug()
  jug.position.set(...JUG_POSITION)
  // Handle turned to the player's right on approach, so it reads in silhouette
  // rather than head-on.
  jug.rotation.y = -Math.PI / 2
  tagInteractable(jug, 'water-jug')
  root.add(jug)

  const doorFrame = buildDoorFrame()
  doorFrame.position.set(DOORWAY_CENTRE[0], 0, DOORWAY_CENTRE[2])
  root.add(doorFrame)

  // Anchors.
  const livingRoomWall = buildFrameAnchor(0.9, 0.65)
  livingRoomWall.position.set(...LIVING_ROOM_WALL_ANCHOR)
  livingRoomWall.name = 'anchor:livingRoomWall'
  root.add(livingRoomWall)

  const bedsideFrame = buildFrameAnchor(0.22, 0.28)
  bedsideFrame.position.set(
    BEDSIDE_FRAME_ANCHOR[0],
    BEDSIDE_FRAME_ANCHOR[1] + 0.18,
    BEDSIDE_FRAME_ANCHOR[2]
  )
  bedsideFrame.rotation.y = 0.5
  bedsideFrame.name = 'anchor:bedsideFrame'
  root.add(bedsideFrame)

  // audioSource is a positional mount point; a small radio body marks it in the room.
  const audioSource = new THREE.Group()
  audioSource.name = 'anchor:audioSource'
  const radio = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.14, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x3d4247, roughness: 0.5 })
  )
  radio.position.y = 0.07
  radio.castShadow = true
  audioSource.add(radio)
  audioSource.position.set(...AUDIO_SOURCE_ANCHOR)
  root.add(audioSource)

  // A rug, purely so the living room reads as lived-in. No blocker.
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x7a3f3a, roughness: 1 })
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.set(-3.0, 0.005, 0)
  rug.receiveShadow = true
  root.add(rug)

  const triggers = ROOMS.map((r) => ({
    room: r.id,
    box: new THREE.Box3(new THREE.Vector3(...r.min), new THREE.Vector3(...r.max))
  }))

  const spawnPos = new THREE.Vector3(...SPAWN_POSITION)
  const dx = SPAWN_LOOK_AT[0] - spawnPos.x
  const dz = SPAWN_LOOK_AT[1] - spawnPos.z
  // Camera forward is -Z at yaw 0, so yaw = atan2(-dx, -dz).
  const yaw = Math.atan2(-dx, -dz)

  const world: WorldSource = {
    root,
    blockers,
    triggers,
    anchors: { livingRoomWall, bedsideFrame, audioSource },
    interactables: { 'water-jug': jug },
    hintTargets: { kitchenDoor: doorFrame, 'water-jug': jug },
    spawn: { position: spawnPos, yaw },
    roomOf(point: THREE.Vector3): string | null {
      // Containment, not entry (§1). Declaration order breaks the doorway overlap.
      for (const t of triggers) if (t.box.containsPoint(point)) return t.room
      return null
    }
  }

  return { world, report: { texturesLoaded, texturesFailed } }
}
