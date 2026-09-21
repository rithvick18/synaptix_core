/**
 * A fake model for Checkpoint F1. It never calls a network; it replays a scripted
 * sequence of tool calls from a fixture, so the read → propose → firewall pipeline is
 * testable with no provider configured (§10.10 F1 acceptance).
 *
 * A real provider (F2) will drive the same tool functions from `tools.ts` through an
 * actual function-calling loop; this file exists so that loop's *shape* is exercised
 * now, without the loop itself.
 */
import {
  propose_find_step,
  propose_level,
  propose_navigate_step,
  propose_person,
  propose_photo_placement,
  propose_recall_step,
  request_caregiver_input,
  type ToolResult
} from './tools'

export type ScriptedToolName =
  | 'propose_photo_placement'
  | 'propose_person'
  | 'propose_navigate_step'
  | 'propose_find_step'
  | 'propose_recall_step'
  | 'propose_level'
  | 'request_caregiver_input'

export interface ScriptedCall {
  tool: ScriptedToolName
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
}

export interface StubModelScript {
  name: string
  calls: ScriptedCall[]
}

function dispatch(call: ScriptedCall): ToolResult {
  switch (call.tool) {
    case 'propose_photo_placement':
      return propose_photo_placement(call.args)
    case 'propose_person':
      return propose_person(call.args)
    case 'propose_navigate_step':
      return propose_navigate_step(call.args)
    case 'propose_find_step':
      return propose_find_step(call.args)
    case 'propose_recall_step':
      return propose_recall_step(call.args)
    case 'propose_level':
      return propose_level(call.args)
    case 'request_caregiver_input':
      return request_caregiver_input(call.args)
  }
}

/**
 * Replays a script's calls in order and returns everything it produced. Read tools are
 * deliberately not part of the script — F1 has no model deciding what to read, only a
 * fixed sequence of what it proposes.
 */
export class StubModel {
  constructor(private readonly script: StubModelScript) {}

  run(): ToolResult[] {
    return this.script.calls.map(dispatch)
  }
}
