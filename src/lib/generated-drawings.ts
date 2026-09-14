import type { Direction } from "@/lib/project-fields";
import type { KontrollplanPunkt } from "@/app/api/projekt/kontrollplan/route";
import type { TekniskBeskrivning } from "@/lib/teknisk-beskrivning";

// The bundle produced by one "Generera ritningar" action. Shared here so
// both the chat (ProjectInterviewChat, which triggers generation) and
// the document panel (ProjectDocument, which now renders the result -
// the chat itself never renders a drawing inline anymore) agree on the
// shape without either importing from the other.
export type GeneratedDrawings = {
  plan: string;
  elevations: Record<Direction, string>;
  section: string;
  floorPlan: string;
  situationsplan: string | null;
  kontrollplan: KontrollplanPunkt[];
  kontrollplanError: string | null;
  tekniskBeskrivning: TekniskBeskrivning;
};
