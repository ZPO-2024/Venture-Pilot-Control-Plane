import type { ZodType, ZodTypeDef } from "zod";
import { PilotControlPlaneError } from "@venture-pilot/shared";

// Output and Input are kept as separate generics (rather than collapsing
// to one T) so a schema using .default(...) infers its *output* type here
// (defaulted fields required) instead of its *input* type (defaulted
// fields optional) -- with a single generic, TS unifies against the more
// permissive Input type and every defaulted field wrongly looks optional
// to every caller.
export function parseBody<Output, Input = Output>(schema: ZodType<Output, ZodTypeDef, Input>, body: unknown): Output {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new PilotControlPlaneError(
      "validation_error",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  }
  return result.data;
}
