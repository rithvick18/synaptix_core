/**
 * §10.5 — the image pipeline, deterministic and local, run before any model call.
 *
 * The EXIF strip is structural, not a scrubbing step bolted on afterwards: every output
 * of `receiveImage` is a canvas re-encode. `createImageBitmap` with
 * `imageOrientation: 'from-image'` reads and applies EXIF orientation once, at decode
 * time; `canvas.toBlob` then writes a fresh JPEG with no metadata segments at all —
 * browsers do not carry EXIF (GPS included) through a canvas round-trip. The caller
 * never receives the original `Blob` back from this module, so there is no path by
 * which the untouched original — EXIF intact — could be mistaken for a derivative and
 * sent anywhere. Rule 4: only `probe` is ever eligible to leave the machine — enforced
 * in `provider.ts`, which is typed to accept a `probe: Blob` and nothing else.
 */

export type ImagePipelineErrorReason = 'unsupported-format' | 'too-large' | 'decode-failed' | 'dimensions-out-of-bounds'

export class ImagePipelineError extends Error {
  constructor(
    public readonly reason: ImagePipelineErrorReason,
    message: string
  ) {
    super(message)
    this.name = 'ImagePipelineError'
  }
}

export interface ImageDerivatives {
  /** ≤1024px on the longest side. The only derivative a provider adapter may transmit. */
  probe: Blob
  /** ≤1024px, padded to power-of-two dimensions — used in-world as a texture. */
  texture: Blob
  /** 256px, for the caregiver review UI. */
  thumb: Blob
  width: number
  height: number
}

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 15 * 1024 * 1024
const MAX_DIMENSION = 8192
const PROBE_MAX = 1024
const TEXTURE_MAX = 1024
const THUMB_MAX = 256

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function dimensionsFor(width: number, height: number, cap: number): [number, number] {
  const scale = Math.min(1, cap / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

/** Draws the bitmap onto a fresh canvas at most `cap` px on the longest side and
 *  re-encodes it — the EXIF-stripping step, reused for every derivative. */
async function encode(image: ImageBitmap, cap: number, padToPowerOfTwo = false): Promise<Blob> {
  const [w, h] = dimensionsFor(image.width, image.height, cap)
  const canvas = document.createElement('canvas')
  canvas.width = padToPowerOfTwo ? nextPowerOfTwo(w) : w
  canvas.height = padToPowerOfTwo ? nextPowerOfTwo(h) : h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImagePipelineError('decode-failed', 'Could not prepare this photograph.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
  canvas.width = canvas.height = 1
  if (!blob) throw new ImagePipelineError('decode-failed', 'Could not prepare this photograph.')
  return blob
}

/**
 * Receives one caregiver upload and produces the three local derivatives (§10.5 steps
 * 1–4). Validates MIME and size before ever decoding, and dimensions after decode
 * (§10.5 step 2). Never returns or retains the original `Blob`.
 */
export async function receiveImage(file: Blob): Promise<ImageDerivatives> {
  if (!ACCEPTED_MIME.includes(file.type)) {
    throw new ImagePipelineError('unsupported-format', 'Unsupported format. Choose a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_BYTES) {
    throw new ImagePipelineError('too-large', 'This image is larger than the 15 MB limit.')
  }

  let bitmap: ImageBitmap
  try {
    // EXIF orientation is read and applied here, once — nothing downstream ever sees
    // the raw EXIF block, GPS included.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ImagePipelineError('decode-failed', 'This image could not be decoded. Choose a valid JPEG, PNG or WebP file.')
  }

  try {
    if (bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION) {
      throw new ImagePipelineError('dimensions-out-of-bounds', 'This image is larger than this pipeline supports.')
    }
    const [probe, texture, thumb] = await Promise.all([
      encode(bitmap, PROBE_MAX),
      encode(bitmap, TEXTURE_MAX, true),
      encode(bitmap, THUMB_MAX)
    ])
    return { probe, texture, thumb, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}
