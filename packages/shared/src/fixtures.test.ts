import { describe, expect, it } from "vitest";
import { digestOfFixture, readFixtureJson } from "./fixtures.js";

describe("fixtures", () => {
  for (const storageRef of [
    "document-concierge/dataset.json",
    "forgeflow/dataset.json",
    "generic-web-application/dataset.json",
  ]) {
    it(`${storageRef} parses as JSON and is labeled synthetic`, () => {
      const data = readFixtureJson(storageRef) as { synthetic?: boolean };
      expect(data.synthetic).toBe(true);
    });

    it(`${storageRef} produces a stable digest`, () => {
      expect(digestOfFixture(storageRef)).toEqual(digestOfFixture(storageRef));
    });
  }
});
