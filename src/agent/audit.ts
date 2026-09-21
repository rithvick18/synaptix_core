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

/**
 * A JSONL file sink for local dev tooling (never imported by `main.ts`, so it never
 * reaches the browser bundle). Uses `node:fs`, which is why this function — and only
 * this function — is Node-only.
 */
export async function nodeJsonlFileSink(path: string): Promise<AuditSink> {
  const fs = await import('node:fs')
  return {
    write(line: string) {
      fs.appendFileSync(path, `${line}\n`, 'utf8')
    }
  }
}
