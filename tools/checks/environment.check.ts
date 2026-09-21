import assert from 'node:assert/strict'
import * as THREE from 'three'
import { describeEnvironment, validateEnvironment } from '../../src/agent/environment'
import { LlamaCppProviderAdapter } from '../../src/agent/llamaCpp'
import { styleMaterial } from '../../src/EnvironmentMaterials'

const style = { wall: '#338855', floor: '#d9bb88', wood: '#664422', fabric: '#123456', accent: '#aa4422', floorType: 'wood', light: 'warm' }
const image = { assetId: 'room-0', mimeType: 'image/jpeg' as const, base64: 'cGhvdG8=' }
let sent: any
const provider = new LlamaCppProviderAdapter({ fetch: async (_url, init) => {
  sent = JSON.parse(String(init?.body))
  return new Response(JSON.stringify({ model: 'vision-test', choices: [{ message: { content: JSON.stringify({ calls: [{ tool: 'set_environment', args: style }] }) } }] }))
} })
const result = await describeEnvironment(provider, [image], 'Match this room')
assert.deepEqual(result.style, style)
assert.equal(sent.messages[1].content[0].image_url.url, 'data:image/jpeg;base64,cGhvdG8=')
assert.equal(sent.messages[1].content[1].text, 'Match this room')
assert.equal(sent.response_format.json_schema.schema.properties.calls.items.anyOf[0].properties.tool.const, 'set_environment')
assert.throws(() => validateEnvironment({ ...style, wall: 'javascript:bad' }))
assert.throws(() => validateEnvironment({ ...style, floorType: 'unknown' }))
assert.throws(() => validateEnvironment(null))
await assert.rejects(() => describeEnvironment(provider, [], ''))
await assert.rejects(() => describeEnvironment({ run: async () => ({ ok: true, model: 'bad', toolCalls: [] }) }, [image], ''))
await assert.rejects(() => describeEnvironment({ run: async () => ({ ok: false, reason: 'server-unreachable', message: 'Start local model' }) }, [image], ''), /Start local model/)
const material = new THREE.MeshStandardMaterial({ color: 'white', map: new THREE.Texture() })
styleMaterial(material, 'wall', result.style)
assert.equal(material.color.getHexString(), '338855')
assert.equal(material.map, null)
styleMaterial(material, 'fabric', result.style)
assert.equal(material.color.getHexString(), '123456')
const stored = structuredClone({ environment: result.style })
assert.deepEqual(validateEnvironment(stored.environment), style)
console.log('Environment checks passed: image request, validation, failures, material application, persistence shape.')
