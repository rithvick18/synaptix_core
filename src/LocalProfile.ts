import type { EnvironmentStyle } from './agent/environment'
import type { MemoryPack, RecallStep } from './Missions'

export interface Crop { x: number; y: number; zoom: number }
export interface Photo {
  id: string
  original: Blob
  runtime: Blob
  thumbnail: Blob
  width: number
  height: number
  crop: Crop
}
export interface LocalPerson { id: string; name: string; relationship: string; photo?: Photo }
export interface Question {
  id: string
  level: 0 | 2
  contentId: string
  type: 'person' | 'text'
  question: string
  choices: { id: string; label: string }[]
  answer: string
  repeat: string
  guide: string
}
export interface LocalProfile {
  version: 1
  id: string
  name: string
  quality: 2048 | 4096
  skipRecall: boolean
  wallId: string
  eventId: string
  wall?: Photo
  event?: Photo
  caption: string
  environment?: EnvironmentStyle
  environmentModel?: string
  people: LocalPerson[]
  questions: Question[]
}
export const newId = (): string => crypto.randomUUID()
export function newProfile(): LocalProfile {
  return { version: 1, id: newId(), name: '', quality: 2048, skipRecall: true,
    wallId: newId(), eventId: newId(), caption: '', people: [], questions: [] }
}
export function profileErrors(p: LocalProfile): string[] {
  const errors: string[] = []
  if (!p.name.trim()) errors.push('Enter a profile display name.')
  for (const person of p.people) {
    if (!person.name.trim() || !person.relationship.trim()) errors.push('Every portrait needs a person name and relationship entered by you.')
  }
  if (p.event && !p.caption.trim()) errors.push('Enter a caption for the event photograph.')
  if (!p.skipRecall) {
    for (const level of [0, 2]) if (!p.questions.some(q => q.level === level)) errors.push(`Add a question for Level ${level + 1}, or choose Skip personalised recall.`)
    const content = new Set([p.wallId, p.eventId, ...p.people.map(v => v.id)])
    for (const [i, q] of p.questions.entries()) {
      const labels = q.type === 'person' ? q.choices.map(c => p.people.find(v => v.id === c.id)?.name ?? '') : q.choices.map(c => c.label)
      if (!q.question.trim() || !q.repeat.trim() || !q.guide.trim()) errors.push(`Question ${i + 1}: enter the question and both hints.`)
      if (!content.has(q.contentId)) errors.push(`Question ${i + 1}: choose its photograph or person.`)
      if (q.choices.length < 2 || labels.some(v => !v.trim()) || new Set(labels.map(v => v.trim().toLowerCase())).size !== labels.length || new Set(q.choices.map(c => c.id)).size !== q.choices.length) errors.push(`Question ${i + 1}: supply at least two distinct, non-empty choices.`)
      if (!q.choices.some(c => c.id === q.answer)) errors.push(`Question ${i + 1}: select a correct answer from the choices.`)
    }
  }
  return errors
}

/** Copies only the house tasks. No demo people, media, recall prose or answers survive. */
export function profilePack(p: LocalProfile, template: MemoryPack): MemoryPack {
  const errors = profileErrors(p)
  if (errors.length) throw new Error(errors.join('\n'))
  const ref = (photo?: Photo): string | undefined => photo ? `local:${photo.id}` : undefined
  const anchors: Record<string, string> = {}
  if (p.wall) anchors.livingRoomWall = ref(p.wall)!
  if (p.event) anchors.eventFrame = ref(p.event)!
  if (p.people[0]?.photo) anchors.bedsideFrame = ref(p.people[0].photo)!
  return {
    patient: { name: p.name },
    people: p.people.map(person => ({ id: person.id, name: person.name, relationship: person.relationship, photo: ref(person.photo) })),
    anchors,
    missions: template.missions.map((mission, index) => ({
      ...mission,
      description: p.skipRecall ? 'Walk and find familiar objects. Personalised recall is skipped.' : 'Walk and find familiar objects, with caregiver-entered recall where supplied.',
      steps: [ ...mission.steps.filter(s => s.type !== 'recall'),
        ...(!p.skipRecall ? p.questions.filter(q => q.level === index).map((q): RecallStep => ({
          type: 'recall', choiceType: q.type, question: q.question,
          memory: q.contentId === p.wallId ? { photo: ref(p.wall), caption: '' }
            : q.contentId === p.eventId ? { photo: ref(p.event), caption: p.caption }
            : { photo: ref(p.people.find(person => person.id === q.contentId)?.photo), caption: '' },
          choices: q.choices.map(c => c.id), answer: q.answer,
          options: q.type === 'text' ? q.choices.map(c => ({ ...c })) : undefined,
          reducedChoices: [q.answer, q.choices.find(c => c.id !== q.answer)!.id],
          hints: { repeat: q.repeat, highlight: 'reduce', guide: q.guide }
        })) : []) ]
    }))
  }
}
export function photosOf(p: LocalProfile): Photo[] {
  return [p.wall, p.event, ...p.people.map(v => v.photo)].filter((v): v is Photo => !!v)
}

// A transaction replaces the complete profile and selection together. An abort leaves
// the previous version intact, including originals. No localStorage or base64 media.
const DB = 'smriti-caregiver-v1'
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('profiles')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Storage is blocked by another tab. Close other Memoria tabs and retry.'))
  })
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (v: T) => void) => void): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profiles', mode)
    let value: T
    tx.oncomplete = () => { db.close(); resolve(value) }
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Browser storage failed.')) }
    try { work(tx.objectStore('profiles'), v => { value = v }) } catch (error) { try { tx.abort() } catch { /* already aborted */ } db.close(); reject(error) }
  })
}
export const profileStore = {
  read: (): Promise<{ profile?: LocalProfile; selected?: string }> => transaction('readonly', (store, result) => {
    const p = store.get('local'), s = store.get('selected')
    s.onsuccess = () => result({ profile: p.result, selected: s.result })
  }),
  save: (profile: LocalProfile): Promise<void> => transaction('readwrite', store => {
    store.put(profile, 'local'); store.put(profile.id, 'selected')
  }),
  select: (id: string): Promise<void> => transaction('readwrite', store => { store.put(id, 'selected') }),
  delete: (): Promise<void> => transaction('readwrite', store => { store.delete('local'); store.put('mira', 'selected') })
}
