/**
 * §10.6 — the audit log. A record that a call happened, not of what was in it: the
 * `AuditEntry` type below has no field wide enough to carry image content or caregiver
 * text, so there is nothing here for a careless call site to accidentally serialise.
 * `agent-audit.jsonl` is a local dev artifact and is git-ignored (`.gitignore`).
 */

export interface AuditEntry {
  timestamp: string
  tool: string
  assetId?: string
  byteCount?: number
  modelId: string
  promptVersion: string
  outcome: 'ok' | 'error'
}

export interface AuditSink {
  write(line: string): void
}

/** §10.6's fallback for a run with no configured sink: "Proposals may be logged to
 *  console" (F2 scope — the review UI, and any richer surface, is Checkpoint F3). */
export const consoleAuditSink: AuditSink = {
  write(line) {
    console.log('[agent-audit]', line)
  }
}

export class AuditLog {
  constructor(private readonly sink: AuditSink) {}

  record(entry: AuditEntry): void {
    this.sink.write(JSON.stringify(entry))
  }
}

// The JSONL file sink lives in `auditNode.ts`. It needs `node:fs`, and this module is
// now reachable from the browser bundle (the setup screen records to it), so keeping the
// two apart is what stops a Node-only import from being pulled into a browser chunk.
