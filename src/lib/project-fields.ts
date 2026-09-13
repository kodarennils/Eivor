// Answers are collected conversationally (see lib/interview.ts) and stored
// as JSONB in project_answers.answers, keyed by the field names below -
// kept schema-less so refining the set of fields never needs a migration.

export type Room = { type: string; percentage: string };

export const PROJECT_TYPE_OPTIONS = [
  "Tillbyggnad",
  "Nybyggnad",
  "Attefallshus",
  "Fasadändring",
  "Altan eller uterum",
  "Annat",
];

export const YES_NO_UNKNOWN_OPTIONS = ["Ja", "Nej", "Vet inte"];

export const DIRECTIONS = ["norr", "öster", "söder", "väster"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABEL: Record<Direction, string> = {
  norr: "Norr",
  öster: "Öster",
  söder: "Söder",
  väster: "Väster",
};

// Supabase Storage rejects non-ASCII bytes in object keys (InvalidKey), so
// öster/söder/väster can't be used directly in a storage path even though
// they're fine as the "direction" column value in Postgres. Use this slug
// wherever a direction becomes part of a storage path.
export const DIRECTION_STORAGE_SLUG: Record<Direction, string> = {
  norr: "norr",
  öster: "oster",
  söder: "soder",
  väster: "vaster",
};
