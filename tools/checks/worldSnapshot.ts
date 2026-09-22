/**
 * SPEC.md §11.6 — the regression snapshot of a built world.
 *
 * One serializer, used both to capture the snapshot and to compare against it, so the
 * two can never disagree about what "the same world" means. Everything is read from
 * what the build actually produced — the `WorldSource`, the scene graph under its root,
 * the audits — never from the layout data that went in, because the data is exactly
 * what G1 moves around.
 *
 * Captured:
 *   - every blocker `Box3`, in order
 *   - every trigger, room plus box, in order (declaration order resolves `roomOf`)
 *   - every anchor, interactable and hint target: world position, world rotation, and
 *     world-space bounds
 *   - spawn position and yaw
 *   - the openings (`OPENINGS`), normalised to `kind: 'door' | 'arch'`
 *   - each door's hinge position, closed yaw and closed blocker
 *   - the doorway and reachability audit results
 *   - every drawable node in the scene: geometry, material, world matrix — so "the
 *     unmirrored house must not change visually" is compared, not asserted
 */
import * as THREE from 'three'
import type { WorldSource } from '../../src/World'

export interface SnapshotOpening {
  id: string
  label: string
  kind: 'door' | 'arch'
  axis: 'x' | 'z'
  at: number
  from: number
  to: number
  height: number
  thickness: number
  hinge: 'from' | 'to'
  swing: 1 | -1
}

export interface SnapshotInput {
  world: WorldSource
  openings: readonly SnapshotOpening[]
  doorways: readonly { id: string; width: number; ok: boolean }[]
  reachability: readonly { room: string; reachable: number; openCells: number; cornersReached: number }[]
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

const box = (b: THREE.Box3): Json => ({ min: b.min.toArray(), max: b.max.toArray() })

/**
 * Quaternions are double covers: q and -q are the same rotation. Pin one by making the
 * largest-magnitude component positive — not `w`, which is ~1e-17 at a yaw of ±π and
 * would let the same rotation serialise with either sign.
 */
function canonicalQuaternion(q: THREE.Quaternion): number[] {
  const v = [q.x, q.y, q.z, q.w]
  const lead = v.reduce((best, c) => (Math.abs(c) > Math.abs(best) ? c : best), 0)
  return v.map((c) => (lead < 0 ? -c : c) + 0) // `+ 0` turns -0 into 0
}

function placement(object: THREE.Object3D): Json {
  object.updateWorldMatrix(true, true)
  return {
    name: object.name,
    position: object.getWorldPosition(new THREE.Vector3()).toArray(),
    quaternion: canonicalQuaternion(object.getWorldQuaternion(new THREE.Quaternion())),
    bounds: box(new THREE.Box3().setFromObject(object))
  }
}

function placements(record: Record<string, THREE.Object3D>): Json {
  const out: Record<string, Json> = {}
  for (const id of Object.keys(record).sort()) out[id] = placement(record[id])
  return out
}

/** JSON-safe copy of geometry parameters (Lathe points are Vector2s). */
function plain(value: unknown): Json {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'object') {
    const out: Record<string, Json> = {}
    for (const key of Object.keys(value as object).sort()) out[key] = plain((value as Record<string, unknown>)[key])
    return out
  }
  return String(value)
}

function material(m: THREE.Material): Json {
  const withColour = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color }
  return {
    type: m.type,
    color: withColour.color ? withColour.color.getHex() : null,
    emissive: withColour.emissive ? withColour.emissive.getHex() : null,
    opacity: m.opacity,
    transparent: m.transparent,
    side: m.side
  }
}

function scene(root: THREE.Object3D): Json {
  root.updateWorldMatrix(true, true)
  const out: Json[] = []
  const path = (node: THREE.Object3D): string => {
    const names: string[] = []
    for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) {
      const index = n.parent ? n.parent.children.indexOf(n) : 0
      names.unshift(`${n.name || n.type}#${index}`)
    }
    return names.join('/')
  }
  root.traverse((node) => {
    const drawable = node as THREE.Mesh
    const light = node as THREE.Light
    if (drawable.isMesh || (node as THREE.LineSegments).isLine) {
      const geometry = drawable.geometry as THREE.BufferGeometry & { parameters?: unknown }
      geometry.computeBoundingBox()
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material]
      out.push({
        path: path(node),
        type: node.type,
        visible: node.visible,
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
        geometry: {
          type: geometry.type,
          parameters: plain(geometry.parameters ?? null),
          bounds: box(geometry.boundingBox!)
        },
        materials: materials.map(material),
        matrixWorld: node.matrixWorld.toArray()
      })
    } else if (light.isLight) {
      out.push({
        path: path(node),
        type: node.type,
        color: light.color.getHex(),
        intensity: light.intensity,
        castShadow: node.castShadow,
        matrixWorld: node.matrixWorld.toArray()
      })
    }
  })
  return out
}

export function snapshotWorld(input: SnapshotInput): Json {
  const { world } = input
  const doors: Record<string, Json> = {}
  for (const o of input.openings) {
    if (o.kind !== 'door') continue
    const pivot = world.interactables[o.id]
    const meta = pivot?.userData.memoriaMeta as { ownBlockers?: THREE.Box3[] } | undefined
    doors[o.id] = {
      hinge: pivot ? pivot.getWorldPosition(new THREE.Vector3()).toArray() : null,
      yaw: pivot ? pivot.rotation.y : null,
      closedBlocker: meta?.ownBlockers?.[0] ? box(meta.ownBlockers[0]) : null
    }
  }
  return {
    blockers: world.blockers.map(box),
    triggers: world.triggers.map((t) => ({ room: t.room, box: box(t.box) })),
    anchors: placements(world.anchors),
    interactables: placements(world.interactables),
    hintTargets: placements(world.hintTargets),
    spawn: { position: world.spawn.position.toArray(), yaw: world.spawn.yaw },
    openings: input.openings.map((o) => plain({ ...o })),
    doors,
    audits: { doorways: plain(input.doorways), reachability: plain(input.reachability) },
    scene: scene(world.root)
  }
}

/**
 * Every difference between two snapshots, as a list of paths. Numbers compare within
 * `epsilon`; everything else — strings, booleans, array lengths, key sets — exactly.
 */
export function diffSnapshots(a: unknown, b: unknown, epsilon: number, at = '$'): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= epsilon ? [] : [`${at}: ${a} ≠ ${b}`]
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${at}: length ${a.length} ≠ ${b.length}`]
    return a.flatMap((v, i) => diffSnapshots(v, b[i], epsilon, `${at}[${i}]`))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    const out: string[] = []
    for (const k of ka) if (!kb.includes(k)) out.push(`${at}.${k}: only in the first`)
    for (const k of kb) if (!ka.includes(k)) out.push(`${at}.${k}: only in the second`)
    for (const k of ka) {
      if (kb.includes(k)) {
        out.push(...diffSnapshots((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], epsilon, `${at}.${k}`))
      }
    }
    return out
  }
  return a === b ? [] : [`${at}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`]
}

export const SNAPSHOT_PATH = 'tools/checks/__snapshots__/hallway.world.json'

/**
 * Stubs three's texture loader to fail at once. Under node there is no network and no
 * `Image`; failing immediately is exactly §1.1's offline path — flat materials — and
 * keeps the build from waiting out the 8 s download timeout.
 */
export function stubTextureLoader(): void {
  THREE.TextureLoader.prototype.load = function (
    _url: string,
    _onLoad?: unknown,
    _onProgress?: unknown,
    onError?: (e: unknown) => void
  ): THREE.Texture {
    setTimeout(() => onError?.(new Error('no network under node')), 0)
    return new THREE.Texture()
  } as never
}
