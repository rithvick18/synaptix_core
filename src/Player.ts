import * as THREE from 'three'
import { PLAYER_BODY_MAX_Y, PLAYER_BODY_MIN_Y, PLAYER_RADIUS } from './layout'
import type { State } from './State'

/**
 * SPEC.md §2/§5.1 — first-person controller.
 *
 * Fixed 1.6 m eye height, no gravity (§2, explicitly OUT). Collision is an AABB swept
 * one axis at a time against `world.blockers` only — trigger volumes are never solid.
 */

const EYE_HEIGHT = 1.6
const RADIUS = PLAYER_RADIUS
const BODY_MIN_Y = PLAYER_BODY_MIN_Y
const BODY_MAX_Y = PLAYER_BODY_MAX_Y
const SPEED = 2.6
const PITCH_LIMIT = Math.PI / 2 - 0.02
const LOOK_SENSITIVITY = 0.0022

export class Player {
  readonly position = new THREE.Vector3()
  yaw = 0
  pitch = 0

  private keys = new Set<string>()
  private body = new THREE.Box3()
  private probe = new THREE.Vector3()

  /** Fired when the pointer leaves lock without `state.markExpectingUnlock()` (§5.1). */
  onUnexpectedUnlock: (() => void) | null = null

  constructor(
    private camera: THREE.PerspectiveCamera,
    private domElement: HTMLElement,
    private state: State,
    private blockers: THREE.Box3[]
  ) {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.domElement.addEventListener('click', this.onClick)
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.domElement
  }

  requestLock(): void {
    if (this.isLocked) return
    // Chrome rejects a re-lock made too soon after a deliberate exit, and returns a
    // promise to say so. Pointer lock is recoverable — the next click asks again — so
    // the rejection is swallowed rather than surfaced as an unhandled rejection.
    const result = this.domElement.requestPointerLock() as unknown
    if (result instanceof Promise) result.catch(() => {})
  }

  releaseLock(): void {
    if (this.isLocked) {
      this.state.markExpectingUnlock()
      document.exitPointerLock()
    }
  }

  /** §5.6 uses this for restart; Checkpoint A uses it once, at spawn. */
  teleport(position: THREE.Vector3, yaw: number): void {
    this.position.copy(position)
    this.position.y = EYE_HEIGHT
    this.yaw = yaw
    this.pitch = 0
    this.clearInput()
    this.syncCamera()
  }

  /**
   * Forgets every key currently held. A key held down across a level switch would
   * otherwise keep moving the player through the first seconds of the new attempt,
   * because `keyup` for it never arrives while the overlay has the pointer.
   */
  clearInput(): void {
    this.keys.clear()
  }

  /**
   * Points the camera at a world position. Used by the reachability probe rather than
   * by the game: the player aims with the mouse, and nothing in a session moves their
   * view for them.
   */
  aimAt(target: THREE.Vector3): void {
    const dx = target.x - this.position.x
    const dy = target.y - this.position.y
    const dz = target.z - this.position.z
    // Camera forward at yaw is (-sin, 0, -cos), so this is the yaw that faces `target`.
    this.yaw = Math.atan2(-dx, -dz)
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(dy, Math.hypot(dx, dz))))
    this.syncCamera()
  }

  update(dt: number): void {
    if (this.state.movementEnabled && this.isLocked) {
      let forward = 0
      let strafe = 0
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1

      if (forward !== 0 || strafe !== 0) {
        const len = Math.hypot(forward, strafe)
        forward /= len
        strafe /= len
        const sin = Math.sin(this.yaw)
        const cos = Math.cos(this.yaw)
        // Camera forward at yaw is (-sin, 0, -cos); right is (cos, 0, -sin).
        const dx = (-sin * forward + cos * strafe) * SPEED * dt
        const dz = (-cos * forward - sin * strafe) * SPEED * dt
        this.moveAxis('x', dx)
        this.moveAxis('z', dz)
      }
    }
    // No gravity: height is asserted every frame rather than integrated.
    this.position.y = EYE_HEIGHT
    this.syncCamera()
  }

  /** Axis-separated so sliding along a wall works instead of sticking. */
  private moveAxis(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return
    const original = this.position[axis]
    this.position[axis] = original + delta
    if (this.collides(this.position)) this.position[axis] = original
  }

  /** Public so collision can be probed from the console without moving the player. */
  collidesAt(x: number, z: number): boolean {
    this.body.min.set(x - RADIUS, BODY_MIN_Y, z - RADIUS)
    this.body.max.set(x + RADIUS, BODY_MAX_Y, z + RADIUS)
    for (const b of this.blockers) if (this.body.intersectsBox(b)) return true
    return false
  }

  private collides(p: THREE.Vector3): boolean {
    this.body.min.set(p.x - RADIUS, BODY_MIN_Y, p.z - RADIUS)
    this.body.max.set(p.x + RADIUS, BODY_MAX_Y, p.z + RADIUS)
    for (const b of this.blockers) if (this.body.intersectsBox(b)) return true
    return false
  }

  /** The point handed to `world.roomOf` — feet, not eye. */
  groundPoint(target = this.probe): THREE.Vector3 {
    return target.set(this.position.x, 0.1, this.position.z)
  }

  private syncCamera(): void {
    this.camera.position.copy(this.position)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  private onClick = (): void => {
    if (this.state.pointerLockWanted) this.requestLock()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isLocked || !this.state.movementEnabled) return
    this.yaw -= e.movementX * LOOK_SENSITIVITY
    this.pitch -= e.movementY * LOOK_SENSITIVITY
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch))
  }

  private onPointerLockChange = (): void => {
    if (this.isLocked) return
    this.keys.clear()
    // §5.1: one deliberate release is swallowed; anything else is a pause.
    if (this.state.consumeExpectedUnlock()) return
    this.onUnexpectedUnlock?.()
  }
}
