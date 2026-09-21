/**
 * §10.2 / §10.7 — constrained decoding for a small local model.
 *
 * A 3B model asked politely for JSON will, often enough to matter, return prose, a
 * half-closed brace, or a tool name it invented. llama.cpp can enforce a grammar at
 * sampling time instead: tokens that cannot continue a valid parse are masked out, so
 * malformed output is not rejected after the fact — it is unrepresentable. That is what
 * makes a sub-7B model usable for this job at all.
 *
 * The grammar is generated from `AGENT_TOOL_SCHEMA` rather than written by hand, so it
 * cannot drift from the tool contracts. It also inherits that array's most important
 * property: `commitProposal` and `rejectProposal` are not in it, so they are not in the
 * grammar, so the model cannot emit them even as a string. §10.7's point exactly — the
 * mitigation is structural, not a sentence in a system prompt.
 *
 * Read tools are deliberately absent too. A multi-turn read/propose loop is where small
 * models fall apart, so the caller resolves every read tool up front and puts the answers
 * in the prompt (see `llamaCpp.ts`); the model's only job is to emit proposals. The
 * firewall (§10.3) still judges every one of them — a grammar constrains shape, never
 * truth.
 */
import { AGENT_TOOL_SCHEMA, type JsonSchemaTool } from './tools'

interface SchemaNode {
  type?: string
  properties?: Record<string, SchemaNode>
  required?: string[]
  items?: SchemaNode
  enum?: string[]
}

/** GBNF string literal: wraps in quotes and escapes what GBNF treats specially. */
function literal(text: string): string {
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** A literal JSON object key, quotes included — `name` becomes `"\"name\""`. */
function jsonKey(name: string): string {
  return literal(`"${name}"`)
}

function kebab(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function asNode(value: unknown): SchemaNode {
  return (typeof value === 'object' && value !== null ? value : {}) as SchemaNode
}

/**
 * Returns a GBNF expression for one schema node, registering named rules for nested
 * objects so the output stays readable rather than one enormous inlined line.
 */
function valueExpression(node: SchemaNode, baseName: string, rules: Map<string, string>): string {
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return '( ' + node.enum.map((v) => literal(`"${v}"`)).join(' | ') + ' )'
  }
  switch (node.type) {
    case 'number':
    case 'integer':
      return 'number'
    case 'array': {
      const item = valueExpression(asNode(node.items), `${baseName}-item`, rules)
      return `"[" ws ( ${item} ( ws "," ws ${item} )* )? ws "]"`
    }
    case 'object':
      return objectRule(node, baseName, rules)
    case 'string':
    default:
      return 'string'
  }
}

/** Registers a rule for an object node and returns the rule's name. */
function objectRule(node: SchemaNode, baseName: string, rules: Map<string, string>): string {
  const properties = node.properties ?? {}
  const required = new Set(node.required ?? [])
  const names = Object.keys(properties)
  const requiredNames = names.filter((n) => required.has(n))
  const optionalNames = names.filter((n) => !required.has(n))

  if (names.length === 0) {
    rules.set(baseName, '"{" ws "}"')
    return baseName
  }

  const parts: string[] = ['"{" ws']

  requiredNames.forEach((name, index) => {
    if (index > 0) parts.push('"," ws')
    const value = valueExpression(asNode(properties[name]), `${baseName}-${kebab(name)}`, rules)
    parts.push(`${jsonKey(name)} ws ":" ws ${value} ws`)
  })

  // An optional property is emitted with its leading comma inside the optional group, so
  // omitting it cannot leave a dangling separator. When there is no required property to
  // follow, the group carries no comma at all.
  optionalNames.forEach((name, index) => {
    const value = valueExpression(asNode(properties[name]), `${baseName}-${kebab(name)}`, rules)
    const needsComma = requiredNames.length > 0 || index > 0
    const inner = `${needsComma ? '"," ws ' : ''}${jsonKey(name)} ws ":" ws ${value} ws`
    parts.push(`( ${inner} )?`)
  })

  parts.push('"}"')
  rules.set(baseName, parts.join(' '))
  return baseName
}

/**
 * The tools a model may actually emit. Read tools are resolved before the call, so the
 * model never asks for them; everything else in §10.2 that produces a proposal — plus the
 * escape hatch, which must stay reachable or the model has no way to decline to guess —
 * is here.
 */
export function proposalTools(tools: JsonSchemaTool[] = AGENT_TOOL_SCHEMA): JsonSchemaTool[] {
  return tools.filter((t) => t.name.startsWith('propose_') || t.name === 'request_caregiver_input')
}

/**
 * Builds a GBNF grammar constraining output to a JSON array of `{ tool, args }` calls,
 * where `tool` is one of the proposal tools and `args` matches that tool's schema.
 */
export function buildProposalGrammar(tools: JsonSchemaTool[] = AGENT_TOOL_SCHEMA): string {
  const usable = proposalTools(tools)
  if (usable.length === 0) throw new Error('buildProposalGrammar: no proposal tools to constrain')

  const rules = new Map<string, string>()
  const callNames: string[] = []

  for (const tool of usable) {
    const base = kebab(tool.name)
    const argsRule = objectRule(asNode(tool.parameters), `${base}-args`, rules)
    const callName = `call-${base}`
    rules.set(
      callName,
      `"{" ws ${jsonKey('tool')} ws ":" ws ${literal(`"${tool.name}"`)} ws "," ws ` +
        `${jsonKey('args')} ws ":" ws ${argsRule} ws "}"`
    )
    callNames.push(callName)
  }

  const lines: string[] = []
  lines.push('root ::= ws "[" ws ( call ( ws "," ws call )* )? ws "]" ws')
  lines.push(`call ::= ${callNames.join(' | ')}`)
  for (const [name, body] of rules) lines.push(`${name} ::= ${body}`)
  lines.push('string ::= "\\"" char* "\\""')
  lines.push('char ::= [^"\\\\] | "\\\\" ( ["\\\\/bfnrt] | "u" hex hex hex hex )')
  lines.push('hex ::= [0-9a-fA-F]')
  lines.push('number ::= "-"? ( "0" | [1-9] [0-9]* ) ( "." [0-9]+ )?')
  lines.push('ws ::= [ \\t\\n]*')
  return lines.join('\n')
}

export interface ParsedCall {
  tool: string
  args: Record<string, unknown>
}

/**
 * Reads back what the grammar produced. Grammar-constrained output should always parse,
 * but this never assumes so: a server running without grammar support, or an older build
 * that ignores the field, returns free text, and that has to degrade to a typed failure
 * rather than throw. Returns `null` when the text is not a usable array of calls.
 */
export function parseProposalCalls(text: string, tools: JsonSchemaTool[] = AGENT_TOOL_SCHEMA): ParsedCall[] | null {
  const allowed = new Set(proposalTools(tools).map((t) => t.name))
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const calls: ParsedCall[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return null
    const record = entry as Record<string, unknown>
    if (typeof record.tool !== 'string' || !allowed.has(record.tool)) return null
    if (typeof record.args !== 'object' || record.args === null || Array.isArray(record.args)) return null
    calls.push({ tool: record.tool, args: record.args as Record<string, unknown> })
  }
  return calls
}
