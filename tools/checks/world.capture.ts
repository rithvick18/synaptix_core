/**
 * SPEC.md §11.6 — captures the regression snapshot of the hallway house.
 *
 *     node tools/checks/run.mjs --capture
 *
 * Not a check: it writes `__snapshots__/hallway.world.json` and asserts nothing. The
 * committed snapshot is the baseline G1's refactor is compared against, so re-running
 * this is a deliberate act — a hallway geometry change that bumps `templateVersion`
 * (§11.8) — never a way to make a failing comparison pass.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { SNAPSHOT_PATH, snapshotWorld, stubTextureLoader } from './worldSnapshot'

stubTextureLoader()

const { OPENINGS } = await import('../../src/layout')
const { createProceduralHouse } = await import('../../src/proceduralHouse')

const ROOT = process.env.MEMORIA_ROOT ?? process.cwd()

const { world, report } = await createProceduralHouse()
const snapshot = {
  meta: {
    template: 'hallway',
    mirror: false,
    source: 'createProceduralHouse() before the G1 template refactor',
    note: 'Built under node with no textures (the §1.1 offline path). Compared by tools/checks/world.check.ts at epsilon 1e-6.'
  },
  world: snapshotWorld({
    world,
    openings: OPENINGS.map((o) => ({
      id: o.id, label: o.label, kind: o.arch ? 'arch' : 'door', axis: o.axis, at: o.at,
      from: o.from, to: o.to, height: o.height, thickness: o.thickness, hinge: o.hinge, swing: o.swing
    })),
    doorways: report.doorways,
    reachability: report.reachability
  })
}

const out = path.join(ROOT, SNAPSHOT_PATH)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(snapshot, null, 1) + '\n')
const w = snapshot.world as Record<string, unknown[] | Record<string, unknown>>
console.log(
  `wrote ${SNAPSHOT_PATH}: ${(w.blockers as unknown[]).length} blockers, ` +
    `${(w.triggers as unknown[]).length} triggers, ${(w.scene as unknown[]).length} scene nodes`
)
