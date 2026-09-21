/**
 * §10.6's audit log, written to `agent-audit.jsonl` (git-ignored). Node-only: it is kept
 * out of `audit.ts` because that module is reachable from the browser bundle, and a
 * `node:fs` import sitting in it would be externalised into a browser chunk.
 *
 * Nothing in `src/` imports this. It exists for local dev tooling that wants the audit
 * trail on disk rather than in a console.
 */
import type { AuditSink } from './audit'

export async function nodeJsonlFileSink(path: string): Promise<AuditSink> {
  const fs = await import('node:fs')
  return {
    write(line: string) {
      fs.appendFileSync(path, `${line}\n`, 'utf8')
    }
  }
}
