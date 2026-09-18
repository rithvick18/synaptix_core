import * as THREE from 'three'
import { INTERACTABLE_ID, type WorldSource } from './World'

/**
 * SPEC.md §5.2 / §5.3 — centre raycast, 2.5 m limit, occlusion, highlight, prompt.
 */

const MAX_DISTANCE = 2.5
const HIGHLIGHT_COLOUR = 0xffc45e
const HIGHLIGHT_INTENSITY = 0.85

interface Focus {
  id: string
  object: THREE.Object3D
}

/** One entry per mesh whose material was swapped for a highlighted clone (§5.3). */
interface SwappedMaterial {
  mesh: THREE.Mesh
  original: THREE.Material | THREE.Material[]
  clones: THREE.Material[]
}

export class Interaction {
  focus: Focus | null = null

  private raycaster = new THREE.Raycaster()
  private centre = new THREE.Vector2(0, 0)
  private hitPoint = new THREE.Vector3()
  private swapped: SwappedMaterial[] = []
  private targets: THREE.Object3D[]

  /** Human-readable labels for the centre prompt; ids are not player-facing text. */
  private labels: Record<string, string> = { 'water-jug': 'water jug' }

  constructor(private world: WorldSource) {
    this.targets = Object.values(world.interactables)
    this.raycaster.far = MAX_DISTANCE
  }

  /**
   * Returns the focused interactable, or null. Call once per frame from the loop.
   */
  update(camera: THREE.Camera): Focus | null {
    const next = this.pick(camera)
    if (next?.object !== this.focus?.object) {
      this.clearHighlight()
      if (next) this.applyHighlight(next.object)
      this.focus = next
    }
    return this.focus
  }

  /** Drop focus and restore materials — used when leaving `exploring`. */
  clear(): void {
    if (!this.focus) return
    this.clearHighlight()
    this.focus = null
  }

  promptText(): string | null {
    if (!this.focus) return null
    const label = this.labels[this.focus.id] ?? this.focus.id
    return `<kbd>E</kbd> Look at the ${label}`
  }

  private pick(camera: THREE.Camera): Focus | null {
    this.raycaster.setFromCamera(this.centre, camera)
    const hits = this.raycaster.intersectObjects(this.targets, true)
    if (hits.length === 0) return null

    const nearest = hits[0]
    if (nearest.distance > MAX_DISTANCE) return null

    const id = this.resolveId(nearest.object)
    if (!id) return null

    // §5.2: occlusion is ray-vs-Box3, not `intersectObjects` — blockers are bounding
    // boxes, not scene meshes, so they are invisible to a mesh raycast.
    const targetDistance = nearest.distance
    for (const box of this.world.blockers) {
      if (this.raycaster.ray.intersectBox(box, this.hitPoint)) {
        if (this.raycaster.ray.origin.distanceTo(this.hitPoint) < targetDistance) return null
      }
    }

    return { id, object: this.objectFor(nearest.object) ?? nearest.object }
  }

  /** Walk the parent chain to the tagged owner (§5.2). */
  private resolveId(hit: THREE.Object3D): string | null {
    let node: THREE.Object3D | null = hit
    while (node) {
      const id = node.userData[INTERACTABLE_ID]
      if (typeof id === 'string') return id
      node = node.parent
    }
    return null
  }

  private objectFor(hit: THREE.Object3D): THREE.Object3D | null {
    let node: THREE.Object3D | null = hit
    while (node) {
      if (typeof node.userData[INTERACTABLE_ID] === 'string') return node
      node = node.parent
    }
    return null
  }

  /**
   * §5.3: clone the material for the highlighted object so props sharing a material do
   * not all light up. Originals are kept and restored verbatim on focus change.
   */
  private applyHighlight(object: THREE.Object3D): void {
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const original = mesh.material
      const list = Array.isArray(original) ? original : [original]
      const clones = list.map((m) => {
        const clone = m.clone() as THREE.Material & {
          emissive?: THREE.Color
          emissiveIntensity?: number
          color?: THREE.Color
        }
        if (clone.emissive) {
          clone.emissive.setHex(HIGHLIGHT_COLOUR)
          clone.emissiveIntensity = HIGHLIGHT_INTENSITY
        } else if (clone.color) {
          clone.color.lerp(new THREE.Color(HIGHLIGHT_COLOUR), 0.35)
        }
        return clone
      })
      mesh.material = Array.isArray(original) ? clones : clones[0]
      this.swapped.push({ mesh, original, clones })
    })
  }

  private clearHighlight(): void {
    for (const entry of this.swapped) {
      entry.mesh.material = entry.original
      for (const c of entry.clones) c.dispose()
    }
    this.swapped.length = 0
  }
}
