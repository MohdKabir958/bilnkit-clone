/** Log only operator-safe database diagnostics, never Prisma's raw message or URL. */
export function databaseReadinessDiagnostic(error: unknown, databaseUrl?: string) {
  const value = error && typeof error === 'object' ? error as {code?: unknown; errorCode?: unknown} : {};
  const code = [value.code, value.errorCode].find((v): v is string => typeof v === 'string' && /^P\d{4}$/.test(v)) ?? 'UNKNOWN';
  let host = 'unavailable';
  try {
    const url = new URL(databaseUrl ?? '');
    if (['postgres:', 'postgresql:'].includes(url.protocol)) host = url.hostname;
  } catch { /* malformed URLs must not be echoed into logs */ }
  const hints: Record<string, string> = {
    P1000: 'Database credentials rejected. Copy the current Neon credentials into DATABASE_URL.',
    P1001: 'Database host unreachable. Check the Neon hostname, active endpoint and network access.',
    P1002: 'Database connection timed out. Check endpoint availability and connection timeout.',
    P1011: 'Database TLS failed. Check the Neon TLS connection settings.',
    P1013: 'Database URL is invalid. Copy the complete URL directly from Neon.',
    P2024: 'Database connection pool timed out. Check pool limits and database availability.',
  };
  return {code, host, hint:hints[code] ?? 'Database query failed. Check the server database configuration and Prisma engine setup.'};
}
