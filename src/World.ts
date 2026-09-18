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
}

export const REQUIRED_ROOMS = ['livingRoom', 'kitchen'] as const
export const REQUIRED_INTERACTABLES = ['water-jug'] as const
export const REQUIRED_HINT_TARGETS = ['kitchenDoor', 'water-jug'] as const
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

/** Tag an object so Interaction.ts can resolve a mesh hit up to its owner. */
export const INTERACTABLE_ID = 'smritiInteractableId'

export function tagInteractable(object: THREE.Object3D, id: string): THREE.Object3D {
  object.userData[INTERACTABLE_ID] = id
  return object
}
