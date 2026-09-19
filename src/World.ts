import * as THREE from 'three'

/**
 * SPEC.md §1 — the world contract. Every world implementation satisfies this,
 * and every required id in §1 must be present.
 */
export interface WorldSource {
  root: THREE.Object3D
  blockers: THREE.Box3[]
  triggers: { room: string; box: THREE.Box3 }[]
  anchors: Record<string, THREE.Object3D>
  interactables: Record<string, THREE.Object3D>
  hintTargets: Record<string, THREE.Object3D>
  spawn: { position: THREE.Vector3; yaw: number }
  roomOf(point: THREE.Vector3): string | null

  /**
   * Optional. Worlds with moving parts — swinging doors — advance them here, once per
   * frame. Worlds made only of static geometry omit it.
   *
   * Returns true if anything actually moved this frame. The loop uses that to refresh
   * shadow maps only when they can have changed; see Renderer.ts.
   */
  update?(dt: number): boolean
}

export const REQUIRED_ROOMS = ['livingRoom', 'kitchen'] as const
/**
 * `radio` and `wall-photo` joined the floor when the three levels landed: levels 2 and 3
 * are built from them, so a world that cannot supply them cannot run the packs this
 * repository ships. `livingArch` joined the hint targets for the same reason — "go to
 * the living room" has no door to point at.
 */
export const REQUIRED_INTERACTABLES = ['water-jug', 'radio', 'wall-photo'] as const
export const REQUIRED_HINT_TARGETS = [
  'kitchenDoor',
  'livingArch',
  'water-jug',
  'radio',
  'wall-photo'
] as const
export const REQUIRED_ANCHORS = ['livingRoomWall', 'bedsideFrame', 'audioSource'] as const

/**
 * Fails loudly at start-up rather than at mission load if a world is incomplete.
 * §5.2's pack rejection depends on these ids actually existing.
 */
export function assertWorldContract(world: WorldSource): void {
  const missing: string[] = []
  for (const id of REQUIRED_INTERACTABLES) if (!world.interactables[id]) missing.push(`interactable:${id}`)
  for (const id of REQUIRED_HINT_TARGETS) if (!world.hintTargets[id]) missing.push(`hintTarget:${id}`)
  for (const id of REQUIRED_ANCHORS) if (!world.anchors[id]) missing.push(`anchor:${id}`)
  const rooms = new Set(world.triggers.map((t) => t.room))
  for (const id of REQUIRED_ROOMS) if (!rooms.has(id)) missing.push(`room:${id}`)
  if (missing.length) throw new Error(`World contract violated, missing: ${missing.join(', ')}`)
}

/**
 * What an interactable carries. Stored in `userData` under one key so the §1 interface
 * stays a plain `Record<string, Object3D>` and Interaction.ts can resolve a mesh hit up
 * the parent chain to the owning object without knowing what kind of prop it is.
 */
export interface InteractableMeta {
  id: string
  /** Player-facing noun, e.g. "kitchen door". Ids are never shown to the player. */
  label: string
  /** Player-facing verb for the centre prompt. Dynamic so doors can say Open / Close. */
  verb: () => string
  /** Runs on E. Returns a short action name for the event log, or null if it did nothing. */
  activate?: () => string | null
  /**
   * Blockers belonging to this object itself. §5.2's occlusion loop must skip them —
   * a closed door is both the raycast target and a blocker, and would occlude itself.
   */
  ownBlockers?: THREE.Box3[]
}

const META_KEY = 'smritiMeta'

export function tagInteractable(object: THREE.Object3D, meta: InteractableMeta): THREE.Object3D {
  object.userData[META_KEY] = meta
  return object
}

export function readMeta(object: THREE.Object3D): InteractableMeta | null {
  const meta = object.userData[META_KEY]
  return meta && typeof meta.id === 'string' ? (meta as InteractableMeta) : null
}

/** Walk the parent chain to the tagged owner (§5.2). */
export function resolveMeta(hit: THREE.Object3D): { meta: InteractableMeta; object: THREE.Object3D } | null {
  let node: THREE.Object3D | null = hit
  while (node) {
    const meta = readMeta(node)
    if (meta) return { meta, object: node }
    node = node.parent
  }
  return null
}
