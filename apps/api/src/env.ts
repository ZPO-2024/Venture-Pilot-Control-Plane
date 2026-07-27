import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_TOKEN: z.string().min(8),
  TOKEN_PEPPER: z.string().min(16),
  DEFAULT_TRIAL_DURATION_DAYS: z.coerce.number().int().positive().default(7),
  EXPIRING_SOON_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
  EXPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  DESTRUCTION_GRACE_DAYS: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_REDEMPTION_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_REDEMPTION_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_ADMIN_AUTH_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_ADMIN_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
