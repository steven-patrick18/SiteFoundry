/**
 * Strip anything secret-shaped from a string before it is logged or written
 * to deploy_events.command_summary (§4 hard rules, §13 checklist).
 */
const PATTERNS: Array<[RegExp, string]> = [
  // PEM blocks (private keys, certificates)
  [
    /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
    '[REDACTED_PEM]',
  ],
  // bearer headers (before key=value so the token itself is what gets redacted)
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
  // key=value style secrets
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|authorization)\b(\s*[:=]\s*)\S+/gi,
    '$1$2[REDACTED]',
  ],
  // long base64/hex runs (likely key material)
  [/\b[A-Za-z0-9+/=]{40,}\b/g, '[REDACTED_BLOB]'],
];

export function sanitizeForLog(input: string): string {
  let out = input;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Last N chars of SSH output, sanitized — for deploy_events.output_tail. */
export function outputTail(output: string, max = 500): string {
  const sanitized = sanitizeForLog(output);
  return sanitized.length > max ? sanitized.slice(-max) : sanitized;
}
