import type { Direction } from "@/lib/project-fields";

export type TekniskBeskrivning = {
  grundlaggning: string;
  stomme: string;
  ventilation: string;
  uppvarmning: string;
};

const EJ_ANGIVET = "Ej angivet";

// Deliberately no LLM call here: every field is either read directly from
// already-collected data or set to "Ej angivet" - never guessed - so
// there's nothing for a model to fabricate in the first place.
export function buildTekniskBeskrivning(
  answers: Record<string, unknown>,
  facadeAttributes: Partial<Record<Direction, { material: string; color: string }>>,
): TekniskBeskrivning {
  const grundlaggning =
    typeof answers.grundlaggning === "string" && answers.grundlaggning
      ? answers.grundlaggning
      : EJ_ANGIVET;

  const materials = Object.values(facadeAttributes)
    .filter((a): a is { material: string; color: string } => Boolean(a?.material))
    .map((a) => a.material);
  const uniqueMaterials = [...new Set(materials)];
  const stomme = uniqueMaterials.length > 0 ? uniqueMaterials.join(", ") : EJ_ANGIVET;

  // Not collected anywhere in the current interview flow - always "Ej
  // angivet" until that changes, rather than an invented plausible answer.
  const ventilation = EJ_ANGIVET;
  const uppvarmning = EJ_ANGIVET;

  return { grundlaggning, stomme, ventilation, uppvarmning };
}
