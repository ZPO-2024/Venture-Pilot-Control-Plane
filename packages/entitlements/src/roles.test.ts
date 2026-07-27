import { describe, expect, it } from "vitest";
import { assertRolePermitted, isRolePermitted } from "./roles.js";
import { RoleNotPermittedError } from "@venture-pilot/shared";

describe("role permissions", () => {
  it("observer can view and give feedback but not request extension/export", () => {
    expect(isRolePermitted("observer", "view_product")).toBe(true);
    expect(isRolePermitted("observer", "submit_feedback")).toBe(true);
    expect(isRolePermitted("observer", "request_extension")).toBe(false);
    expect(isRolePermitted("observer", "request_export")).toBe(false);
  });

  it("evaluator can request extension but not export", () => {
    expect(isRolePermitted("evaluator", "request_extension")).toBe(true);
    expect(isRolePermitted("evaluator", "request_export")).toBe(false);
  });

  it("primary_contact can do everything an evaluator can, plus request export", () => {
    expect(isRolePermitted("primary_contact", "request_extension")).toBe(true);
    expect(isRolePermitted("primary_contact", "request_export")).toBe(true);
  });

  it("assertRolePermitted throws RoleNotPermittedError for a denied action", () => {
    expect(() => assertRolePermitted("observer", "request_export")).toThrow(RoleNotPermittedError);
  });

  it("assertRolePermitted does not throw for a permitted action", () => {
    expect(() => assertRolePermitted("primary_contact", "request_export")).not.toThrow();
  });
});
