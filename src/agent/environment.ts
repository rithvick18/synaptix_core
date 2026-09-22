import { ENVIRONMENT_REASONING, ENVIRONMENT_SYSTEM_PROMPT } from './prompts'
import type { ProviderAdapter, ProbeImage } from './provider'

export interface EnvironmentStyle {
  wall: string
  floor: string
  wood: string
  fabric: string
  accent: string
  floorType: 'wood' | 'tile' | 'carpet'
  light: 'warm' | 'neutral' | 'cool'
}
const colors = ['wall', 'floor', 'wood', 'fabric', 'accent'] as const
export function validateEnvironment(value: unknown): EnvironmentStyle {
  if (!value || typeof value !== 'object') throw new Error('The model did not return an environment.')
  const v = value as Record<string, unknown>
  for (const key of colors) if (typeof v[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(v[key] as string)) throw new Error(`Invalid ${key} colour in the model response. Retry with a clear room photograph.`)
  if (!['wood', 'tile', 'carpet'].includes(String(v.floorType)) || !['warm', 'neutral', 'cool'].includes(String(v.light))) throw new Error('Invalid floor or lighting in the model response.')
  return Object.fromEntries([...colors, 'floorType', 'light'].map(key => [key, v[key]])) as unknown as EnvironmentStyle
}

export async function describeEnvironment(provider: ProviderAdapter, images: ProbeImage[], notes: string): Promise<{ style: EnvironmentStyle; model: string }> {
  if (!images.length || images.length > 3) throw new Error('Choose one to three room photographs.')
  const result = await provider.run({
    systemPrompt: ENVIRONMENT_SYSTEM_PROMPT,
    // Offline this list becomes four required fields the model must fill in before the
    // grammar lets it reach `set_environment` — so it reads the light and names the
    // colours in words before it commits to a hex. §10.6's local 4B is exactly the size
    // of model that gets a palette wrong by answering first and looking afterwards.
    reasoningSteps: ENVIRONMENT_REASONING,
    tools: [{ name: 'set_environment', description: 'Styles the whole playable home from the room you were shown: five hex colours that have to work together as one palette, the floor material, and the lighting temperature. Called once per run.', parameters: {
      type: 'object', properties: {
        ...Object.fromEntries(colors.map(key => [key, { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }])),
        floorType: { type: 'string', enum: ['wood', 'tile', 'carpet'] },
        light: { type: 'string', enum: ['warm', 'neutral', 'cool'] }
      }, required: [...colors, 'floorType', 'light'], additionalProperties: false
    } }], caregiverText: notes.slice(0, 2000) || 'Match the room in these photographs.', probeImages: images
  })
  if (!result.ok) throw new Error(result.message)
  if (result.toolCalls.length !== 1 || result.toolCalls[0].tool !== 'set_environment') throw new Error('The model did not produce one environment. Try again.')
  return { style: validateEnvironment(result.toolCalls[0].args), model: result.model }
}
