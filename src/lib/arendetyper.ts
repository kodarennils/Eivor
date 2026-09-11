// Case-type classification used to target the RAG search at the right
// part of PBL/Boverkets material before running the actual embedding
// search - e.g. a tillbyggnad-question shouldn't retrieve attefallshus
// chunks just because they happen to share some vocabulary.

export const ARENDETYPER = [
  "attefallshus_komplementbyggnad",
  "tillbyggnad",
  "nybyggnad_huvudbyggnad",
  "fasadandring",
  "altan_plank_mur_staket",
  "ovrigt",
] as const;

export type Arendetyp = (typeof ARENDETYPER)[number];

export const ARENDETYP_LABEL: Record<Arendetyp, string> = {
  attefallshus_komplementbyggnad: "Attefallshus/komplementbyggnad",
  tillbyggnad: "Tillbyggnad",
  nybyggnad_huvudbyggnad: "Nybyggnad av huvudbyggnad",
  fasadandring: "Fasadändring",
  altan_plank_mur_staket: "Altan/plank/mur/staket",
  ovrigt: "Övrigt/oklart",
};

// Prepended to the case description before embedding, to bias retrieval
// toward the relevant section of the source material.
const SEARCH_HINT: Record<Arendetyp, string> = {
  attefallshus_komplementbyggnad:
    "attefallshus komplementbyggnad komplementbostadshus bygglovsbefriad bygglovsplikt avstånd till tomtgräns",
  tillbyggnad:
    "tillbyggnad av småhus bygglovsbefriad bygglovsplikt taknock volym avstånd till tomtgräns",
  nybyggnad_huvudbyggnad:
    "nybyggnad av en- eller tvåbostadshus bygglovsplikt inom detaljplan utanför detaljplan",
  fasadandring:
    "fasadändring ändring av tak eller fasad bygglovsplikt för en- och tvåbostadshus",
  altan_plank_mur_staket:
    "altan plank mur staket bygglovsbefriad höjd avstånd till tomtgräns",
  ovrigt: "",
};

export function buildSearchQuery(arendetyp: Arendetyp, caseDescription: string): string {
  const hint = SEARCH_HINT[arendetyp];
  return hint ? `${hint}\n\n${caseDescription}` : caseDescription;
}
