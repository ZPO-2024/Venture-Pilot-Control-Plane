import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const FIXTURES_ROOT = path.join(REPO_ROOT, "fixtures");

export function resolveFixturePath(storageRef: string): string {
  return path.join(FIXTURES_ROOT, storageRef);
}

export function readFixtureJson(storageRef: string): unknown {
  const contents = readFileSync(resolveFixturePath(storageRef), "utf8");
  return JSON.parse(contents);
}

export function digestOfFixture(storageRef: string): string {
  const contents = readFileSync(resolveFixturePath(storageRef));
  return createHash("sha256").update(contents).digest("hex");
}
