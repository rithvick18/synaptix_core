#!/usr/bin/env node
/**
 * Runs the headless checks in `tools/checks/*.check.ts`.
 *
 * These were scratch files until the game grew three levels; they are in the repository
 * now because they are the only way to verify the level machinery without a person
 * clicking through it, and a check nobody else can run is not a check.
 *
 * No test framework. esbuild is already present as a Vite dependency, so each check is
 * bundled to one ESM file and run under node. The source files stub `document`, `Image`
 * and three's loaders before importing anything real, which is why they must be bundled
 * rather than loaded through a TypeScript runner: the stubs have to be in place before
 * the module graph is evaluated.
 *
 *   npm run check              # both suites
 *   npm run check -- pack      # just the ones whose name contains "pack"
 *   node tools/checks/run.mjs --capture   # runs `*.capture.ts` instead: writes the
 *                                         # §11.6 world snapshot, asserts nothing
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const suffix = process.argv.includes('--capture') ? '.capture.ts' : '.check.ts'

const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild')
const three = path.join(root, 'node_modules', 'three', 'build', 'three.module.js')
// `three` is aliased to one file, so its add-ons need their own entry: without it
// `three/examples/jsm/...` would resolve under `three.module.js/`.
const threeExamples = path.join(root, 'node_modules', 'three', 'examples')

const checks = readdirSync(here)
  .filter((f) => f.endsWith(suffix))
  .filter((f) => filter.length === 0 || filter.some((needle) => f.includes(needle)))
  .sort()

if (checks.length === 0) {
  console.error(`No checks matched ${filter.join(', ') || '(everything)'}`)
  process.exit(1)
}

// Typecheck first, against the real source. esbuild strips types without looking at
// them, so a harness that has drifted from the interfaces it exercises would otherwise
// bundle and run and quietly assert the wrong thing.
const types = spawnSync(
  path.join(root, 'node_modules', '.bin', 'tsc'),
  ['-p', here, '--noEmit'],
  { stdio: 'inherit' }
)
if (types.status !== 0) {
  console.error('\nThe checks do not typecheck against src/. Nothing was run.')
  process.exit(1)
}

const out = mkdtempSync(path.join(tmpdir(), 'memoria-checks-'))
let failed = 0

try {
  for (const check of checks) {
    const bundle = path.join(out, `${check.replace(/\.ts$/, '')}.mjs`)
    // The entry point lives outside src/, so `three` is not on its resolution path.
    const build = spawnSync(
      esbuild,
      [
        path.join(here, check),
        '--bundle',
        '--format=esm',
        '--platform=node',
        '--log-level=warning',
        `--alias:three/examples=${threeExamples}`,
        `--alias:three=${three}`,
        `--outfile=${bundle}`
      ],
      { stdio: 'inherit' }
    )
    if (build.status !== 0) {
      console.error(`\n${check}: BUNDLE FAILED`)
      failed++
      continue
    }

    console.log(`\n── ${check} ${'─'.repeat(Math.max(0, 56 - check.length))}`)
    const run = spawnSync(process.execPath, [bundle], {
      stdio: 'inherit',
      env: { ...process.env, MEMORIA_ROOT: root }
    })
    if (run.status !== 0) failed++
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}

console.log('')
if (failed > 0) {
  console.log(`${failed} of ${checks.length} check suite(s) FAILED`)
  process.exit(1)
}
console.log(`${checks.length} check suite(s) passed`)
