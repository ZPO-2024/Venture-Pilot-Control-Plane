import { prisma } from "@venture-pilot/db";
import { loadWorkerEnv } from "./env.js";
import { runSweepOnce } from "./sweep.js";

const env = loadWorkerEnv();

function log(message: string, extra?: Record<string, unknown>): void {
  if (env.LOG_LEVEL === "silent") return;
  console.log(`[worker] ${message}`, extra ?? "");
}

async function tick(): Promise<void> {
  try {
    const result = await runSweepOnce(prisma, {
      expiringSoonThresholdHours: env.EXPIRING_SOON_THRESHOLD_HOURS,
      exportRetentionDays: env.EXPORT_RETENTION_DAYS,
    });
    const total =
      result.expiredPilots.length +
      result.expiringSoonNoticesCreated.length +
      result.exportsRetentionExpired.length +
      result.destructionsExecuted.length +
      result.destructionsBlocked.length;
    if (total > 0) {
      log("sweep completed with actions", result as unknown as Record<string, unknown>);
    }
  } catch (err) {
    console.error("[worker] sweep failed", err);
  }
}

log(`starting sweep loop every ${env.WORKER_SWEEP_INTERVAL_SECONDS}s`);
void tick();
setInterval(() => void tick(), env.WORKER_SWEEP_INTERVAL_SECONDS * 1000);

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
