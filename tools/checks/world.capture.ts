/**
 * SPEC.md §11.6 — captures the regression snapshot of the hallway house.
 *
 *     node tools/checks/run.mjs --capture
 *
 * Not a check: it writes `__snapshots__/hallway.world.json` and asserts nothing. The
 * committed snapshot is the baseline G1's refactor was compared against — first
 * captured, in a commit of its own, from the pre-refactor `createProceduralHouse()`.
 * Re-running this is a deliberate act — a hallway geometry change that bumps
 * `templateVersion` (§11.8) — never a way to make a failing comparison pass.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildHouse } from '../../src/proceduralHouse'
import { TEMPLATES } from '../../src/templates'
import { SNAPSHOT_PATH, snapshotWorld } from './worldSnapshot'

const ROOT = process.env.MEMORIA_ROOT ?? process.cwd()

const world = buildHouse(TEMPLATES.hallway, { mirror: false })
const snapshot = {
  meta: {
    template: 'hallway',
    templateVersion: world.templateVersion,
    mirror: false,
    source: 'buildHouse(hallway, { mirror: false })',
    note: 'Built under node with no textures (the §1.1 offline path). Compared by tools/checks/world.check.ts at epsilon 1e-6.'
  },
  world: snapshotWorld({ world, openings: world.openings, doorways: world.doorways, reachability: world.reachability })
}

const out = path.join(ROOT, SNAPSHOT_PATH)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(snapshot, null, 1) + '\n')
const w = snapshot.world as Record<string, unknown[] | Record<string, unknown>>
console.log(
  `wrote ${SNAPSHOT_PATH}: ${(w.blockers as unknown[]).length} blockers, ` +
    `${(w.triggers as unknown[]).length} triggers, ${(w.scene as unknown[]).length} scene nodes`
)
