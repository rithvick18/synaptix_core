/**
 * §10.3 — `ctx.allowedTokens` is built deterministically from caregiver-supplied
 * material only: tokenised `get_caregiver_text()`, plus names and relationships the
 * caregiver typed into form fields. Nothing derived from an image contributes tokens —
 * this module never sees an image, only strings, so that guarantee is structural rather
 * than a promise kept elsewhere.
 */

export interface CaregiverInputs {
  /** Free-form typed text: caregiver notes, event captions, and the like. */
  texts: string[]
  /** Typed form fields: display name, person names, relationships, and similar. */
  fields: string[]
}

/** Splits on anything that isn't a letter, digit or apostrophe. */
function words(s: string): string[] {
  return s
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.trim())
    .filter(Boolean)
}

/**
 * Builds the allow-list a proposal's patient-facing text is checked against (§10.3).
 * Both individual words and whole field/phrase values are added, so a multi-word place
 * or event name ("New Delhi", "Bihu 2019") is recognised as one token as well as by its
 * parts — a rule that only matched single words would force every caregiver phrase to
 * be split up to be usable.
 */
export function buildAllowedTokens(inputs: CaregiverInputs): Set<string> {
  const tokens = new Set<string>()

  const add = (raw: string): void => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) return
    tokens.add(trimmed)
    for (const w of words(trimmed)) tokens.add(w)
  }

  for (const text of inputs.texts) {
    add(text)
    // Caregiver text is often a full sentence or a comma-separated list of facts —
    // split it into fragments too, so "Ananya, my granddaughter, Bihu 2019" also
    // yields "my granddaughter" and "Bihu 2019" as standalone allowed phrases.
    for (const fragment of text.split(/[,.;]/)) add(fragment)
  }
  for (const field of inputs.fields) add(field)

  return tokens
}
