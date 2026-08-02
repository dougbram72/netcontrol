export function normalizeCallsign(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}
