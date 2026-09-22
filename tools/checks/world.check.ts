/**
 * SPEC.md §11 — house templates, checked headlessly for every registered template in
 * both orientations.
 *
 *   §11.6  `buildHouse(hallway, { mirror: false })` matches the pre-G1 snapshot with
 *          zero diffs at epsilon 1e-6, and two builds of any (template, mirror) are
 *          identical
 *   §11.5  both audits report clean, and every §1 required id is present
 *   §11.2  `kitchenArch` directly connects `livingRoom` and `kitchen`; a route from spawn
 *          enters each through its role opening; every hint target can glow
 *   §11.3  the mirrored build is the exact reflection of the unmirrored one, nothing in
 *          it has a reflecting transform, and every photograph reads the right way round
 *
 * `buildHouse` downloads nothing, so no stubs are needed: with no texture sets every
 * surface is its flat §1.1 fallback, which is also how the snapshot was captured.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as THREE from 'three'
import { PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS } from '../../src/layout'
import { ANCHOR_PLATE, buildHouse, type HouseWorld } from '../../src/proceduralHouse'
import { TEMPLATES, templateFromLocation } from '../../src/templates'
import type { OpeningSpec } from '../../src/templates/types'
import { assertWorldContract } from '../../src/World'
import { SNAPSHOT_PATH, diffSnapshots, snapshotWorld } from './worldSnapshot'

let checks = 0
const failures: string[] = []

function ok(condition: boolean, label: string, detail = ''): void {
  checks++
  if (!condition) failures.push(label + (detail ? `\n     ${detail}` : ''))
}

const ROOT = process.env.MEMORIA_ROOT ?? process.cwd()
const EPSILON = 1e-6

const snap = (world: HouseWorld): unknown =>
  snapshotWorld({ world, openings: world.openings, doorways: world.doorways, reachability: world.reachability })

const configs = Object.values(TEMPLATES).flatMap((template) =>
  [false, true].map((mirror) => ({ template, mirror, name: `${template.id}${mirror ? ' · mirrored' : ''}` }))
)

// ---------------------------------------------------------------------------
// §11.6 — the refactor moved nothing
// ---------------------------------------------------------------------------

{
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, SNAPSHOT_PATH), 'utf8')) as { world: unknown }
  const diffs = diffSnapshots(stored.world, snap(buildHouse(TEMPLATES.hallway, { mirror: false })), EPSILON)
  console.log(`  snapshot: buildHouse(hallway, { mirror: false }) vs ${SNAPSHOT_PATH} — ${diffs.length} diff(s)`)
  ok(
    diffs.length === 0,
    '§11.6 buildHouse(hallway, { mirror: false }) matches the pre-refactor snapshot with zero diffs',
    diffs.slice(0, 20).join('\n     ') + (diffs.length > 20 ? `\n     … and ${diffs.length - 20} more` : '')
  )
}

for (const { template, mirror, name } of configs) {
  const a = JSON.stringify(snap(buildHouse(template, { mirror })))
  const b = JSON.stringify(snap(buildHouse(template, { mirror })))
  ok(a === b, `§11.6 ${name}: two builds are identical`, `${a.length} vs ${b.length} bytes`)
}

// ---------------------------------------------------------------------------
// A walkable grid over the open-door floor, for the §11.2 route checks
// ---------------------------------------------------------------------------

const STEP = 0.125
const MIN_X = -16, MAX_X = 16, MIN_Z = -14, MAX_Z = 18
const NX = Math.round((MAX_X - MIN_X) / STEP) + 1
const NZ = Math.round((MAX_Z - MIN_Z) / STEP) + 1

interface Grid {
  standable: Uint8Array
  /** Room of each cell by `world.roomOf`, as an index into `rooms`; -1 outside. */
  room: Int16Array
  rooms: string[]
}

const cx = (i: number): number => MIN_X + i * STEP
const cz = (j: number): number => MIN_Z + j * STEP

function grid(world: HouseWorld): Grid {
  const blockers = world.openBlockers()
  const rooms = [...new Set(world.triggers.map((t) => t.room))]
  const standable = new Uint8Array(NX * NZ)
  const room = new Int16Array(NX * NZ)
  const body = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x = cx(i), z = cz(j)
      body.min.set(x - PLAYER_RADIUS, PLAYER_BODY_MIN_Y, z - PLAYER_RADIUS)
      body.max.set(x + PLAYER_RADIUS, PLAYER_BODY_MAX_Y, z + PLAYER_RADIUS)
      standable[i * NZ + j] = blockers.some((b) => body.intersectsBox(b)) ? 0 : 1
      const r = world.roomOf(point.set(x, 1, z))
      room[i * NZ + j] = r === null ? -1 : rooms.indexOf(r)
    }
  }
  return { standable, room, rooms }
}

/** Flood fill over standable cells that `allow` admits. Returns the reached set. */
function flood(g: Grid, start: number, allow: (cell: number) => boolean): Uint8Array {
  const seen = new Uint8Array(NX * NZ)
  if (!g.standable[start] || !allow(start)) return seen
  seen[start] = 1
  const queue = [start]
  while (queue.length) {
    const c = queue.pop()!
    const i = Math.floor(c / NZ), j = c % NZ
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
      const n = ni * NZ + nj
      if (seen[n] || !g.standable[n] || !allow(n)) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  return seen
}

/** Every step between two neighbouring standable cells, one in `from`'s set and one in room `to`. */
function crossings(g: Grid, from: Uint8Array, to: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const c = i * NZ + j
      if (!from[c]) continue
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
        const n = ni * NZ + nj
        if (g.standable[n] && g.room[n] === to && g.room[c] !== to) {
          out.push({ x: (cx(i) + cx(ni)) / 2, z: (cz(j) + cz(nj)) / 2 })
        }
      }
    }
  }
  return out
}

/** Is this step inside the opening — on its wall line and within its span? */
function through(o: OpeningSpec, p: { x: number; z: number }): boolean {
  const across = o.axis === 'x' ? p.z : p.x
  const along = o.axis === 'x' ? p.x : p.z
  return Math.abs(across - o.at) <= o.thickness / 2 + STEP && along >= o.from && along <= o.to
}

function cellNear(x: number, z: number): number {
  return Math.round((x - MIN_X) / STEP) * NZ + Math.round((z - MIN_Z) / STEP)
}

/** The standable cell of `room` nearest its trigger's centre. */
function cellIn(world: HouseWorld, g: Grid, roomId: string): number {
  const r = g.rooms.indexOf(roomId)
  const centre = world.triggers.find((t) => t.room === roomId)!.box.getCenter(new THREE.Vector3())
  let best = -1, bestD = Infinity
  for (let c = 0; c < NX * NZ; c++) {
    if (!g.standable[c] || g.room[c] !== r) continue
    const d = Math.hypot(cx(Math.floor(c / NZ)) - centre.x, cz(c % NZ) - centre.z)
    if (d < bestD) { best = c; bestD = d }
  }
  return best
}

// ---------------------------------------------------------------------------
// Per template × mirror
// ---------------------------------------------------------------------------

const auditLines: string[] = []

for (const { template, mirror, name } of configs) {
  const world = buildHouse(template, { mirror })

  // ---- §1 / §11.2: every required id ----
  let contract = ''
  try { assertWorldContract(world) } catch (e) { contract = String(e) }
  ok(contract === '', `§11.2 ${name}: provides every §1 required id`, contract)

  // ---- §11.5: both audits clean ----
  const tight = world.doorways.filter((d) => !d.ok)
  ok(tight.length === 0, `§11.5 ${name}: auditDoorways reports every opening passable`,
    tight.map((d) => `${d.id} ${d.width} m`).join(', '))
  const cut = world.reachability.filter((r) => r.reachable < 0.98 || r.cornersReached < 4)
  ok(cut.length === 0, `§11.5 ${name}: auditReachability reports every room reachable, all four corners`,
    cut.map((r) => `${r.room} ${(r.reachable * 100).toFixed(1)}% corners ${r.cornersReached}/4`).join(', '))
  auditLines.push(
    `    ${name.padEnd(20)} doorways ${world.doorways.map((d) => `${d.id} ${d.width.toFixed(2)}`).join(' · ')}`,
    `    ${''.padEnd(20)} reach    ${world.reachability.map((r) => `${r.room} ${(r.reachable * 100).toFixed(0)}%/${r.cornersReached}c`).join(' · ')}`
  )

  // ---- §11.2: role openings ----
  const g = grid(world)
  const opening = (id: string): OpeningSpec | undefined => world.openings.find((o) => o.id === id)
  const living = g.rooms.indexOf('livingRoom')
  const kitchen = g.rooms.indexOf('kitchen')
  const spawn = cellNear(world.spawn.position.x, world.spawn.position.z)
  ok(g.standable[spawn] === 1, `§11.2 ${name}: the spawn point is standable`)

  // kitchenArch directly connects the two rooms: walk from the living room using only
  // living-room and kitchen floor — no hallway — and every step across goes through it.
  const arch = opening('kitchenArch')
  const direct = flood(g, cellIn(world, g, 'livingRoom'), (c) => g.room[c] === living || g.room[c] === kitchen)
  const directSteps = crossings(g, direct, kitchen)
  ok(directSteps.length > 0, `§11.2 ${name}: livingRoom reaches kitchen without leaving the two rooms`)
  ok(
    !!arch && directSteps.length > 0 && directSteps.every((p) => through(arch, p)),
    `§11.2 ${name}: every direct livingRoom → kitchen step goes through kitchenArch`,
    directSteps.filter((p) => !arch || !through(arch, p)).slice(0, 3).map((p) => `(${p.x}, ${p.z})`).join(' ')
  )

  // kitchenDoor / livingArch: from spawn, without entering the room, reach its doorstep
  // and step in through the role opening.
  for (const [role, roomId] of [['kitchenDoor', 'kitchen'], ['livingArch', 'livingRoom']] as const) {
    const r = g.rooms.indexOf(roomId)
    const outside = flood(g, spawn, (c) => g.room[c] !== r)
    const o = opening(role)
    const steps = crossings(g, outside, r).filter((p) => !!o && through(o, p))
    ok(steps.length > 0, `§11.2 ${name}: a route from spawn enters ${roomId} through ${role}`,
      o ? 'no step into the room lies inside the opening' : `${role} is not an opening in this template`)
  }

  // ---- §11.2: every hint target can glow ----
  for (const [id, target] of Object.entries(world.hintTargets)) {
    let meshes = 0
    target.traverse((n) => { if ((n as THREE.Mesh).isMesh && n.visible) meshes++ })
    const size = new THREE.Box3().setFromObject(target).getSize(new THREE.Vector3())
    const solidAxes = [size.x, size.y, size.z].filter((s) => s > 0.01).length
    ok(meshes > 0 && solidAxes >= 2, `§11.2 ${name}: hint target ${id} is visibly highlightable`,
      `${meshes} visible mesh(es), bounds ${size.toArray().map((v) => v.toFixed(2)).join(' × ')}`)
  }

  // ---- §11.3: nothing reflects ----
  world.root.updateMatrixWorld(true)
  let reflected = 0
  world.root.traverse((n) => { if (n.matrixWorld.determinant() <= 0 && ((n as THREE.Mesh).isMesh)) reflected++ })
  ok(reflected === 0, `§11.3 ${name}: no mesh has a reflecting (negative-determinant) world transform`, `${reflected}`)
}

console.log('\n  audits (open doors):')
for (const line of auditLines) console.log(line)

// ---------------------------------------------------------------------------
// §11.3 — the mirror is an exact reflection, and photographs are not mirrored
// ---------------------------------------------------------------------------

/** Where a plate's texture points, as seen by someone standing in front of it. */
function plateReading(plate: THREE.Mesh): { centre: THREE.Vector3; normal: THREE.Vector3; rightOk: boolean; upOk: boolean } {
  plate.updateWorldMatrix(true, false)
  const centre = plate.getWorldPosition(new THREE.Vector3())
  // PlaneGeometry faces its local +Z; that face is the one carrying the photograph.
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(plate.matrixWorld)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 10)
  camera.position.copy(centre).addScaledVector(normal, 1)
  camera.up.set(0, 1, 0)
  camera.lookAt(centre)
  camera.updateMatrixWorld(true)
  const pos = plate.geometry.attributes.position as THREE.BufferAttribute
  const uv = plate.geometry.attributes.uv as THREE.BufferAttribute
  const screen: { u: number; v: number; x: number; y: number }[] = []
  for (let k = 0; k < pos.count; k++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(plate.matrixWorld).project(camera)
    screen.push({ u: uv.getX(k), v: uv.getY(k), x: p.x, y: p.y })
  }
  // Texture u = 1 must be to the viewer's right of u = 0, and v = 1 above v = 0: a
  // photograph mapped this way is the right way round, not a mirror image.
  const mean = (f: (s: (typeof screen)[number]) => boolean, key: 'x' | 'y'): number => {
    const picked = screen.filter(f)
    return picked.reduce((a, s) => a + s[key], 0) / picked.length
  }
  const rightOk = mean((s) => s.u === 1, 'x') > mean((s) => s.u === 0, 'x')
  const upOk = mean((s) => s.v === 1, 'y') > mean((s) => s.v === 0, 'y')
  return { centre, normal, rightOk, upOk }
}

function platesOf(world: HouseWorld): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>()
  for (const [id, anchor] of Object.entries(world.anchors)) {
    anchor.traverse((n) => { if (n.name === ANCHOR_PLATE && (n as THREE.Mesh).isMesh) out.set(id, n as THREE.Mesh) })
  }
  return out
}

const reflect = (v: number[]): number[] => [-v[0], v[1], v[2]]
const reflectBox = (b: THREE.Box3): number[][] => [[-b.max.x, b.min.y, b.min.z], [-b.min.x, b.max.y, b.max.z]]
const near = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]) <= EPSILON)
const nearBox = (a: THREE.Box3, b: number[][]): boolean => near(a.min.toArray(), b[0]) && near(a.max.toArray(), b[1])

for (const template of Object.values(TEMPLATES)) {
  const plain = buildHouse(template, { mirror: false })
  const flipped = buildHouse(template, { mirror: true })
  const name = template.id

  // As a set, matched one-to-one: a wall run cut by an opening along x emits its
  // segments in increasing x, so mirroring reverses their order within the list. Nothing
  // reads blocker order — collision and occlusion test every box.
  const unmatched = [...flipped.blockers]
  const missing = plain.blockers.filter((b) => {
    const k = unmatched.findIndex((f) => nearBox(f, reflectBox(b)))
    if (k < 0) return true
    unmatched.splice(k, 1)
    return false
  })
  ok(
    plain.blockers.length === flipped.blockers.length && missing.length === 0 && unmatched.length === 0,
    `§11.3 ${name}: every mirrored blocker is the reflection of exactly one unmirrored blocker`,
    `${missing.length} without a reflection, ${unmatched.length} left over`
  )
  ok(
    plain.triggers.every((t, i) => flipped.triggers[i]?.room === t.room && nearBox(flipped.triggers[i].box, reflectBox(t.box))),
    `§11.3 ${name}: every mirrored trigger is the reflection of its unmirrored counterpart, same room, same order`
  )
  ok(near(flipped.spawn.position.toArray(), reflect(plain.spawn.position.toArray())) &&
     Math.abs(flipped.spawn.yaw + plain.spawn.yaw) <= EPSILON,
     `§11.3 ${name}: spawn is reflected and still faces the front door`)
  for (const kind of ['anchors', 'interactables', 'hintTargets'] as const) {
    for (const [id, object] of Object.entries(plain[kind])) {
      const other = flipped[kind][id]
      const a = new THREE.Box3().setFromObject(object)
      ok(!!other && nearBox(new THREE.Box3().setFromObject(other), reflectBox(a)),
        `§11.3 ${name}: ${kind}.${id} occupies the reflection of where it was`)
    }
  }

  // Doorway widths and reachability are properties of the floor, and the floor is an
  // exact reflection — so they must come out the same, not merely both pass.
  const widths = (w: HouseWorld): string => w.doorways.map((d) => `${d.id}:${d.width}:${d.ok}`).join(' ')
  const reach = (w: HouseWorld): string => w.reachability.map((r) => `${r.room}:${r.reachable}:${r.openCells}:${r.cornersReached}`).join(' ')
  ok(widths(plain) === widths(flipped), `§11.3 ${name}: mirrored doorway widths equal the unmirrored ones`,
    `${widths(plain)}\n     ${widths(flipped)}`)
  ok(reach(plain) === reach(flipped), `§11.3 ${name}: mirrored reachability equals the unmirrored one`,
    `${reach(plain)}\n     ${reach(flipped)}`)

  // Photographs: the same plate, read by a viewer standing in front of it, in both.
  const plainPlates = platesOf(plain)
  const flippedPlates = platesOf(flipped)
  ok(plainPlates.size >= 3, `§11.3 ${name}: the frame anchors carry picture plates`, [...plainPlates.keys()].join(', '))
  console.log(`\n  ${name}: photograph orientation, viewer standing 1 m in front of each plate`)
  for (const [id, plate] of plainPlates) {
    const before = plateReading(plate)
    const after = plateReading(flippedPlates.get(id)!)
    const roomBefore = plain.roomOf(before.centre.clone().addScaledVector(before.normal, 0.5))
    const roomAfter = flipped.roomOf(after.centre.clone().addScaledVector(after.normal, 0.5))
    console.log(
      `    ${id.padEnd(15)} normal ${before.normal.toArray().map((v) => v.toFixed(2)).join(',')} → ` +
        `${after.normal.toArray().map((v) => v.toFixed(2)).join(',')} · faces ${roomBefore} → ${roomAfter} · ` +
        `u→right ${before.rightOk}/${after.rightOk} · v→up ${before.upOk}/${after.upOk}`
    )
    ok(before.rightOk && before.upOk, `§11.3 ${name}: the ${id} photograph reads the right way round unmirrored`)
    ok(after.rightOk && after.upOk, `§11.3 ${name}: the ${id} photograph reads the right way round mirrored — not a mirror image`)
    ok(near(after.normal.toArray(), reflect(before.normal.toArray())),
      `§11.3 ${name}: the mirrored ${id} faces the reflected direction`,
      `${before.normal.toArray()} → ${after.normal.toArray()}`)
    ok(roomBefore !== null && roomBefore === roomAfter, `§11.3 ${name}: the ${id} faces into the same room both ways round`,
      `${roomBefore} / ${roomAfter}`)
  }
}

// ---------------------------------------------------------------------------
// §11.7 — the `?template=<id>&mirror=1` dev override
// ---------------------------------------------------------------------------

{
  const none = templateFromLocation('')
  ok(none.template.id === 'hallway' && !none.mirror && none.problem === null,
    '§11.7 with no override the house is hallway, unmirrored')
  const flipped = templateFromLocation('?patient=raju&template=hallway&mirror=1')
  ok(flipped.template.id === 'hallway' && flipped.mirror && flipped.problem === null,
    '§11.7 ?template=hallway&mirror=1 selects the mirrored hallway')
  ok(!templateFromLocation('?mirror=true').mirror, '§11.7 only mirror=1 mirrors')
  for (const bad of ['nope', '__proto__', 'toString']) {
    const r = templateFromLocation(`?template=${bad}`)
    ok(r.template.id === 'hallway' && r.problem !== null,
      `§11.7 ?template=${bad} falls back to hallway and says why`, String(r.problem))
  }
}

console.log('')
if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
