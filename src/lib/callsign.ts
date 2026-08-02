/** Normalize a callsign for storage and comparison (upper, strip spaces). */
export function normalizeCallsign(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Loose validation for amateur radio callsigns.
 * Accepts common US / international formats including portable prefixes (W1AW/4, VE3/W1AW).
 */
export function isValidCallsign(input: string): boolean {
  const cs = normalizeCallsign(input)
  if (!cs) return false
  // Optional prefix/suffix with slash, 3–12 chars overall alphanumeric + slash
  return /^[A-Z0-9]{1,3}\/?[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}(\/[A-Z0-9]{1,4})?$/.test(cs)
}

/**
 * Strip portable / prefix-suffix designators for database lookup.
 * Examples: W1AW/4 → W1AW, VE3/W1AW → W1AW, W1AW → W1AW
 */
export function baseCallsignForLookup(input: string): string {
  const cs = normalizeCallsign(input)
  if (!cs.includes('/')) return cs

  const parts = cs.split('/').filter(Boolean)
  const looksLikeCall = (p: string) => /^[A-Z]{1,3}[0-9][A-Z0-9]{0,5}$/.test(p)

  // Prefer the segment that looks like a full callsign
  const full = parts.find(looksLikeCall)
  if (full) return full

  // Fallback: longest segment
  return parts.reduce((a, b) => (b.length > a.length ? b : a), parts[0] ?? cs)
}
