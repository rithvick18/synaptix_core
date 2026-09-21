import { environmentEditor } from '../src/EnvironmentEditor'
import { styleMaterial } from '../src/EnvironmentMaterials'
import * as THREE from 'three'
import { newProfile, newId, profileStore, profileErrors, profilePack, type Question } from '../src/LocalProfile'
import { importPhoto, dimensions, cropRect, MediaResolver } from '../src/PhotoMedia'

export async function run(): Promise<{ checks: string[]; id: string }> {
  const checks: string[] = []
  const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); checks.push(label) }
  const fails = async (work: () => Promise<unknown>, message: string) => {
    try { await work() } catch (e) { ok(String(e).includes(message), message); return }
    throw new Error(`Expected rejection: ${message}`)
  }
  const image = async (width: number, height: number, type = 'image/png') => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#be763e'; ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#fff'; ctx.fillRect(width / 4, height / 4, width / 2, height / 2)
    return (await new Promise<Blob>(r => canvas.toBlob(b => r(b!), type)))
  }
  const jpeg = new Uint8Array(await (await image(40, 30, 'image/jpeg')).arrayBuffer())
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0])
  const rotated = await importPhoto(new Blob([jpeg.slice(0,2), exif, jpeg.slice(2)], { type: 'image/jpeg' }), 2048, 4096)
  ok(rotated.width === 30 && rotated.height === 40, 'EXIF orientation applied to derivatives')
  const original = await image(3000, 1500)
  let photo = await importPhoto(original, 2048, 8192)
  ok(photo.width === 2048 && photo.height === 1024, '2048 derivative preserves aspect')
  ok(photo.original === original && original.size > 0, 'original Blob retained unchanged')
  const thumb = await createImageBitmap(photo.thumbnail); ok(thumb.width === 384 && thumb.height === 192, 'UI thumbnail separately sized'); thumb.close()
  ok(dimensions(80, 40, 2048).join() === '80,40', 'small images never upscale')
  const high = await importPhoto(await image(4200, 2100), 4096, 8192)
  ok(high.width === 4096, 'high quality 4096 cap')
  const device = await importPhoto(original, 4096, 1024)
  ok(device.width === 1024, 'device texture cap wins')
  await fails(() => importPhoto(new Blob(['x'], { type: 'image/gif' }), 2048, 4096), 'Unsupported format')
  await fails(() => importPhoto(new Blob(['not an image'], { type: 'image/png' }), 2048, 4096), 'could not be decoded')
  for (const type of ['image/jpeg', 'image/webp']) ok((await importPhoto(await image(40, 30, type), 2048, 4096)).width === 40, `${type} accepted`)
  photo.crop = { x: .2, y: .8, zoom: 1.5 }
  const replacement = await importPhoto(await image(120, 180), 2048, 4096, photo)
  ok(replacement.id === photo.id && replacement.crop.x === .2 && replacement.original !== photo.original, 'replacement preserves stable photo ID and separate crop')
  const rect = cropRect(120, 180, .95 / .7, replacement.crop)
  ok(Math.abs(rect[2] / rect[3] - .95 / .7) < .00001 && rect[0] >= 0 && rect[1] >= 0, 'crop fits correct destination without stretching')
  const p = newProfile(); p.name = 'Browser fixture'; p.wall = replacement
  const realFetch = window.fetch
  let generationTask: Promise<void> = Promise.resolve()
  const editor = environmentEditor(p, action => { generationTask = action(); return generationTask })
  const style = { wall: '#228844', floor: '#bb9977', wood: '#665544', fabric: '#445566', accent: '#aa4422', floorType: 'tile', light: 'cool' }
  try {
    window.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      ok(request.messages[1].content[0].image_url.url.startsWith('data:image/jpeg;base64,'), 'room upload is re-encoded before inference')
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ calls: [{ tool: 'set_environment', args: style }] }) } }] }))
    }
    const input = editor.querySelector<HTMLInputElement>('input[type=file]')!
    const transfer = new DataTransfer(); transfer.items.add(new File([await image(160, 100)], 'room.png', { type: 'image/png' }))
    input.files = transfer.files; input.dispatchEvent(new Event('change'))
    editor.querySelector<HTMLButtonElement>('[data-generate]')!.click(); await generationTask
    ok(p.environment?.wall === style.wall, 'Generate applies vision response to profile')
    const mat = new THREE.MeshStandardMaterial()
    styleMaterial(mat, 'tileFloor', p.environment!)
    ok(mat.map instanceof THREE.CanvasTexture && mat.color.getHexString() === 'bb9977', 'generated floor pattern and colour reach real Three material')
    mat.map?.dispose(); mat.dispose()
  } finally { window.fetch = realFetch }

  ok(profileErrors(p).length === 0, 'image-only profile valid with explicit skip')
  p.skipRecall = false
  ok(profileErrors(p).length === 2, 'recall requires questions in levels one and three')
  const question = (level: 0 | 2): Question => {
    const choices = [{ id: newId(), label: 'A' }, { id: newId(), label: 'B' }, { id: newId(), label: 'C' }]
    return { id: newId(), level, type: 'text', contentId: p.wallId, question: 'Caregiver question?', choices, answer: choices[0].id, repeat: 'Caregiver repeat', guide: 'Caregiver guide' }
  }
  p.questions = [question(0), question(2)]
  ok(profileErrors(p).length === 0, 'explicit questions valid')
  p.questions[0].answer = 'missing'; ok(profileErrors(p).some(v => v.includes('correct answer')), 'invalid answer rejected')
  p.questions[0].answer = p.questions[0].choices[0].id
  p.questions[0].choices[1].label = ' a '; ok(profileErrors(p).some(v => v.includes('distinct')), 'duplicate choices rejected')
  p.questions[0].choices[1].label = 'B'; p.questions[0].guide = ''; ok(profileErrors(p).some(v => v.includes('both hints')), 'missing hints rejected')
  p.questions[0].guide = 'Caregiver guide'
  const template = await (await fetch('/packs/mira/pack.json')).json()
  const pack = profilePack(p, template)
  ok(pack.missions.length === 3 && !pack.demo && pack.people.length === 0, 'personal pack removes all fictional people and demo notice')
  ok(!JSON.stringify(pack).includes('Bihu') && !JSON.stringify(pack).includes('ananya'), 'no demo recall content reused')
  p.skipRecall = true
  ok(profilePack(p, template).missions.every(m => m.steps.every(s => s.type !== 'recall')), 'explicit skip removes all recall, retaining three levels')
  const resolver = new MediaResolver(p)
  const url = resolver.resolve(`local:${replacement.id}`)
  ok(url.startsWith('blob:') && (await fetch(url)).ok, 'shared media layer resolves local Blob')
  ok(resolver.resolve('/packs/mira/bihu.jpg').endsWith('/packs/mira/bihu.jpg'), 'shared media layer resolves demo path')
  resolver.dispose()
  let revoked = false; try { await fetch(url) } catch { revoked = true }; ok(revoked, 'object URL revoked on dispose')
  await profileStore.save(p)
  let restored = await profileStore.read()
  ok(restored.selected === p.id && restored.profile?.wall?.original instanceof Blob && restored.profile.wall.crop.x === .2, 'IndexedDB restores selection original and crop')
  ok(restored.profile?.environment?.wall === style.wall, 'IndexedDB restores generated environment')
  // Force a real transaction abort after queuing writes; old commit must survive.
  const put = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) { const request = put.apply(this, args); this.transaction.abort(); return request }
  let failed = false
  try { await profileStore.save({ ...p, name: 'Must not persist' }) } catch { failed = true } finally { IDBObjectStore.prototype.put = put }
  restored = await profileStore.read()
  ok(failed && restored.profile?.name === p.name, 'aborted save preserves last successful profile')
  await profileStore.select('raju'); restored = await profileStore.read()
  ok(restored.selected === 'raju' && restored.profile?.id === p.id, 'switch to demo retains local profile')
  await profileStore.save(p)
  return { checks, id: p.id }
}
