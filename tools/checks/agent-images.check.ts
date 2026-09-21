/**
 * Headless checks for Checkpoint F2's image pipeline (SPEC.md §10.5). Bundled with
 * esbuild and run under node, so `document`, `createImageBitmap` and canvas are stubbed
 * before `src/agent/images.ts` is imported — the same pattern `pack.check.ts` uses for
 * MemoryPack's `Image`/texture loading.
 *
 * The EXIF-strip proof here is structural: every derivative this pipeline returns is a
 * fresh, canvas-re-encoded `Blob` — never the input `Blob` and never anything derived by
 * copying its bytes. Combined with the documented fact that `canvas.toBlob` never writes
 * back metadata (EXIF, GPS included), that is the guarantee §10.5 step 1 asks for. It is
 * not a substitute for looking at a real GPS-tagged JPEG's derivative in a browser —
 * that manual check is listed in the report.
 */

import { receiveImage, ImagePipelineError } from '../../src/agent/images'

interface FakeSource {
  type: string
  size: number
  __width: number
  __height: number
  __decodeError?: boolean
}

function fakeUpload(width: number, height: number, opts: Partial<FakeSource> = {}): Blob {
  const bytes = opts.size !== undefined ? new Uint8Array(opts.size) : `ORIGINAL-BYTES-WITH-EXIF-GPS:${width}x${height}`
  const blob = new Blob([bytes], { type: opts.type ?? 'image/jpeg' }) as Blob & FakeSource
  Object.assign(blob, { __width: width, __height: height, __decodeError: opts.__decodeError })
  return blob
}

interface FakeCanvas {
  width: number
  height: number
  getContext(kind: '2d'): FakeCtx
  toBlob(cb: (b: Blob | null) => void, type: string, _quality: number): void
}

interface FakeCtx {
  fillStyle: string
  imageSmoothingQuality: string
  fillRect(...args: number[]): void
  drawImage(...args: unknown[]): void
}

;(globalThis as unknown as { document: unknown }).document = {
  createElement(tag: string): FakeCanvas | Record<string, never> {
    if (tag !== 'canvas') return {}
    const canvas: FakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        imageSmoothingQuality: 'low',
        fillRect() {},
        drawImage() {}
      }),
      toBlob(cb, type) {
        // A distinct, freshly-built blob — proof the original bytes are never forwarded.
        cb(new Blob([`CANVAS-REENCODE:${canvas.width}x${canvas.height}`], { type }))
      }
    }
    return canvas
  }
}

;(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async (
  file: Blob & FakeSource,
  _opts?: unknown
) => {
  if (file.__decodeError) throw new Error('simulated decode failure')
  return { width: file.__width, height: file.__height, close() { /* no-op */ } }
}

let checks = 0
const failures: string[] = []

function ok(condition: boolean, label: string): void {
  checks++
  if (!condition) failures.push(label)
}

function eq<T>(actual: T, expected: T, label: string): void {
  checks++
  if (actual !== expected) failures.push(`${label}\n     expected ${String(expected)}, got ${String(actual)}`)
}

async function text(blob: Blob): Promise<string> {
  return blob.text()
}

// ---------------------------------------------------------------------------
// 1. EXIF/GPS strip — every output is a fresh re-encode, never the original bytes
// ---------------------------------------------------------------------------

{
  const upload = fakeUpload(2000, 1000)
  const originalText = await text(upload)
  ok(originalText.includes('EXIF-GPS'), 'sanity: the fake upload carries the EXIF/GPS marker')

  const derivatives = await receiveImage(upload)
  for (const [name, blob] of [
    ['probe', derivatives.probe],
    ['texture', derivatives.texture],
    ['thumb', derivatives.thumb]
  ] as const) {
    const t = await text(blob)
    ok(!t.includes('EXIF-GPS'), `§10.5 ${name}: does not carry the original EXIF/GPS bytes`)
    ok(t.startsWith('CANVAS-REENCODE:'), `§10.5 ${name}: is a fresh canvas re-encode, not the original`)
    ok(blob !== upload, `§10.5 ${name}: is not object-identical to the uploaded blob`)
  }
}

// ---------------------------------------------------------------------------
// 2. Only probe is eligible to leave the machine — proven by the type it returns
// ---------------------------------------------------------------------------

{
  // receiveImage's return type only exposes probe/texture/thumb — there is no field
  // through which the original Blob could be handed back to a caller at all.
  const derivatives = await receiveImage(fakeUpload(800, 800))
  const keys = Object.keys(derivatives).sort()
  eq(keys.join(','), 'height,probe,texture,thumb,width'.split(',').sort().join(','), '§10.5 receiveImage exposes exactly probe/texture/thumb/width/height')
}

// ---------------------------------------------------------------------------
// 3. Sizing: probe/thumb capped, texture padded to power-of-two
// ---------------------------------------------------------------------------

{
  const wide = fakeUpload(4000, 1000) // 4:1 landscape
  const d = await receiveImage(wide)
  const dims = (s: string): [number, number] => {
    const m = /(\d+)x(\d+)$/.exec(s)!
    return [Number(m[1]), Number(m[2])]
  }
  const [pw, ph] = dims(await text(d.probe))
  ok(pw <= 1024 && ph <= 1024, '§10.5 probe: capped at 1024px on the longest side')
  eq(pw, 1024, '§10.5 probe: the long side hits the 1024 cap exactly')
  eq(ph, 256, '§10.5 probe: aspect ratio is preserved (4:1 → 1024:256)')

  const [thw, thh] = dims(await text(d.thumb))
  eq(thw, 256, '§10.5 thumb: capped at 256px on the longest side')
  eq(thh, 64, '§10.5 thumb: aspect ratio preserved (4:1 → 256:64)')
}

{
  // 8:3 — after capping to 1024, the short side (384) is not itself a power of two,
  // so this fixture actually exercises the padding step rather than getting it for
  // free from a coincidentally-already-pow2 size.
  const d = await receiveImage(fakeUpload(4000, 1500))
  const [tw, th] = (await text(d.texture)).match(/(\d+)x(\d+)$/)!.slice(1).map(Number)
  eq(tw, 1024, '§10.5 texture: width capped at 1024')
  eq(th, 512, '§10.5 texture: height (384 after capping) padded up to the next power of two')
  ok(Number.isInteger(Math.log2(tw)) && Number.isInteger(Math.log2(th)), '§10.5 texture: both dimensions are powers of two')
}

{
  // A small image is never upscaled.
  const small = fakeUpload(100, 50)
  const d = await receiveImage(small)
  const [pw, ph] = (await text(d.probe)).match(/(\d+)x(\d+)$/)!.slice(1).map(Number)
  eq(pw, 100, '§10.5 probe: never upscales a small source (width)')
  eq(ph, 50, '§10.5 probe: never upscales a small source (height)')
}

// ---------------------------------------------------------------------------
// 4. Validation — MIME, size, decode failure, dimension bounds
// ---------------------------------------------------------------------------

async function expectReject(blob: Blob, reason: string, label: string): Promise<void> {
  try {
    await receiveImage(blob)
    ok(false, `${label}: rejected`)
  } catch (e) {
    ok(e instanceof ImagePipelineError, `${label}: throws ImagePipelineError`)
    eq((e as InstanceType<typeof ImagePipelineError>).reason, reason, `${label}: reason is ${reason}`)
  }
}

await expectReject(fakeUpload(800, 800, { type: 'image/gif' }), 'unsupported-format', '§10.5 unsupported MIME')
await expectReject(fakeUpload(800, 800, { size: 20 * 1024 * 1024 }), 'too-large', '§10.5 over 15MB')
await expectReject(fakeUpload(800, 800, { __decodeError: true }), 'decode-failed', '§10.5 decode failure')
await expectReject(fakeUpload(20000, 20000), 'dimensions-out-of-bounds', '§10.5 absurd dimensions')

{
  // A well-formed jpeg/png/webp is accepted.
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const d = await receiveImage(fakeUpload(400, 400, { type }))
    ok(d.probe.size > 0, `§10.5 ${type}: accepted and produces a probe`)
  }
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED (${checks})`)
} else {
  console.log(`${failures.length} of ${checks} checks FAILED:\n`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exitCode = 1
}
