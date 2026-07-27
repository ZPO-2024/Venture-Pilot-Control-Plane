import { z } from "zod";

const EnvSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
  WORKER_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  EXPIRING_SOON_THRESHOLD_HOURS: z.coerce.number().int().positive().default(48),
  EXPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid worker environment configuration: ${result.error.message}`);
  }
  return result.data;
}
