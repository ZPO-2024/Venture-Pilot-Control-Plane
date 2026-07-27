// Pino `redact` paths, wired into apps/api's Fastify logger at bootstrap.
// Anything matching these paths is replaced with "[Redacted]" before a log
// line is ever written — raw tokens must never reach stdout/log storage.
export const PINO_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.rawToken",
  "req.body.token",
  "req.params.token",
  "req.params.rawToken",
  "res.headers['set-cookie']",
  '*.rawToken',
  '*.rawSessionToken',
  '*.tokenHash',
];
