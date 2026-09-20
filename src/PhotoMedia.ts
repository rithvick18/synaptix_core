import type { Crop, LocalProfile, Photo } from './LocalProfile'
import { newId, photosOf } from './LocalProfile'

export function dimensions(width: number, height: number, cap: number): [number, number] {
  const scale = Math.min(1, cap / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}
export function cropRect(width: number, height: number, aspect: number, crop: Crop): [number, number, number, number] {
  const w = Math.min(width, height * aspect) / crop.zoom
  const h = w / aspect
  return [(width - w) * crop.x, (height - h) * crop.y, w, h]
}
async function encode(image: ImageBitmap, cap: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  ;[canvas.width, canvas.height] = dimensions(image.width, image.height, cap)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .94))
  canvas.width = canvas.height = 1
  if (!blob) throw new Error('Could not prepare this photograph. Please try another image.')
  return blob
}
export async function importPhoto(file: Blob, quality: number, maxTextureSize: number, previous?: Photo): Promise<Photo> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Unsupported format. Choose a JPEG, PNG or WebP image.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('This image could not be decoded. Choose a valid JPEG, PNG or WebP file.') }
  try {
    const cap = Math.min(quality, maxTextureSize)
    const runtime = await encode(bitmap, cap)
    const thumbnail = await encode(bitmap, 384)
    const [width, height] = dimensions(bitmap.width, bitmap.height, cap)
    return { id: previous?.id ?? newId(), original: file, runtime, thumbnail, width, height,
      crop: previous?.crop ?? { x: .5, y: .5, zoom: 1 } }
  } finally { bitmap.close() }
}

/** The owner keeps URLs alive until its PackMedia is disposed. Demo paths pass through. */
export class MediaResolver {
  private urls = new Map<string, string>()
  private photos = new Map<string, Photo>()
  constructor(profile?: LocalProfile) {
    if (profile) for (const photo of photosOf(profile)) this.photos.set(`local:${photo.id}`, photo)
  }
  resolve(path: string, thumbnail = false): string {
    if (!path.startsWith('local:')) {
      if (/^(https?:|data:|blob:)/i.test(path)) return path
      return new URL(path.replace(/^\/+/, ''), typeof document === 'undefined' ? 'http://localhost/' : document.baseURI).href
    }
    const key = `${path}:${thumbnail}`
    const photo = this.photos.get(path)
    if (!photo) return 'data:,' // ordinary load failure; never fetch private IDs
    if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(thumbnail ? photo.thumbnail : photo.runtime))
    return this.urls.get(key)!
  }
  async portrait(path: string): Promise<string> {
    const photo = this.photos.get(path)
    if (!photo) return this.resolve(path)
    const key = `${path}:portrait`
    if (this.urls.has(key)) return this.urls.get(key)!
    const image = await createImageBitmap(photo.thumbnail).catch(() => null)
    if (!image) return 'data:,'
    try {
      const rect = cropRect(image.width, image.height, 1, photo.crop)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = Math.max(1, Math.floor(rect[2]))
      canvas.getContext('2d')!.drawImage(image, ...rect, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .94))
      if (!blob) return 'data:,'
      const url = URL.createObjectURL(blob); this.urls.set(key, url); return url
    } catch { return 'data:,' } finally { image.close() }
  }
  crop(path: string): Crop | undefined { return this.photos.get(path)?.crop }
  dispose(): void { for (const url of this.urls.values()) URL.revokeObjectURL(url); this.urls.clear(); this.photos.clear() }
}
