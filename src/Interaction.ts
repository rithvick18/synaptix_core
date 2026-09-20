import * as THREE from 'three'
import { resolveMeta, type InteractableMeta, type WorldSource } from './World'

/**
 * SPEC.md §5.2 / §5.3 — centre raycast, 2.5 m limit, occlusion, highlight, prompt.
 */

const MAX_DISTANCE = 2.5
const HIGHLIGHT_COLOUR = 0xffc45e
// Strong enough to read on a white jug, weak enough not to flatten a door filling
// the screen when the player walks right up to it.
const HIGHLIGHT_INTENSITY = 0.55

export interface Focus {
  meta: InteractableMeta
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

  constructor(private world: WorldSource) {
    this.raycaster.far = MAX_DISTANCE
  }

  /** Returns the focused interactable, or null. Call once per frame from the loop. */
  update(camera: THREE.Camera): Focus | null {
    const next = this.pick(camera)
    if (next?.object !== this.focus?.object) {
      this.clearHighlight()
      if (next) this.applyHighlight(next.object)
      this.focus = next
    } else if (next) {
      // Same object, but its verb may have changed (a door that just opened).
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
    const { verb, label } = this.focus.meta
    return `<kbd>E</kbd> ${verb()} the ${label}`
  }

  /** Runs the focused object's action. Returns a short action name, or null. */
  activate(): { id: string; action: string } | null {
    if (!this.focus?.meta.activate) return null
    const action = this.focus.meta.activate()
    return action ? { id: this.focus.meta.id, action } : null
  }

  private pick(camera: THREE.Camera): Focus | null {
    this.raycaster.setFromCamera(this.centre, camera)
    const hits = this.raycaster.intersectObjects(Object.values(this.world.interactables), true)
    if (hits.length === 0) return null

    const nearest = hits[0]
    if (nearest.distance > MAX_DISTANCE) return null

    const resolved = resolveMeta(nearest.object)
    if (!resolved) return null

    // §5.2: occlusion is ray-vs-Box3, not `intersectObjects` — blockers are bounding
    // boxes, not scene meshes, so they are invisible to a mesh raycast.
    const targetDistance = nearest.distance
    const own = resolved.meta.ownBlockers
    for (const box of this.world.blockers) {
      // A closed door is both the target and a blocker; skipping its own box is what
      // stops it occluding itself.
      if (own && own.includes(box)) continue
      if (this.raycaster.ray.intersectBox(box, this.hitPoint)) {
        if (this.raycaster.ray.origin.distanceTo(this.hitPoint) < targetDistance) return null
      }
    }

    return { meta: resolved.meta, object: resolved.object }
  }

  /**
   * §5.3: clone the material for the highlighted object so props sharing a material do
   * not all light up. Originals are kept and restored verbatim on focus change.
   */
  private applyHighlight(object: THREE.Object3D): void {
    object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || mesh.name === 'anchor-plate') return // Highlight the frame, keeping the photograph colour-accurate.
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
