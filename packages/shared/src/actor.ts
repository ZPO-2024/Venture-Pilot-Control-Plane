export type ActorType = "admin" | "participant" | "system";

export interface Actor {
  type: ActorType;
  id: string;
  label?: string;
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: "system", label: "Background worker" };

export function actorToJson(actor: Actor): Record<string, unknown> {
  return { type: actor.type, id: actor.id, label: actor.label ?? null };
}
