// Placeholder set of fields for the structured form. Exact fields still
// TBD (per the project brief) - stored as JSONB in project_answers.answers
// so refining this list later doesn't require a schema migration.

export type Room = { type: string; percentage: string };

export type ProjectAnswers = {
  projectType: string;
  description: string;
  widthMeters: string;
  depthMeters: string;
  areaSqm: string;
  heightMeters: string;
  distanceToBoundaryMeters: string;
  withinDetailedPlan: string;
  propertyDesignation: string;
  rooms: Room[];
  windowsPerDirection: Record<Direction, string>;
  mainEntranceDirection: string;
};

export const EMPTY_ANSWERS: ProjectAnswers = {
  projectType: "",
  description: "",
  widthMeters: "",
  depthMeters: "",
  areaSqm: "",
  heightMeters: "",
  distanceToBoundaryMeters: "",
  withinDetailedPlan: "",
  propertyDesignation: "",
  rooms: [],
  windowsPerDirection: { norr: "", öster: "", söder: "", väster: "" },
  mainEntranceDirection: "",
};

export const ROOM_TYPE_OPTIONS = [
  "Kök",
  "Vardagsrum",
  "Sovrum",
  "Badrum",
  "Hall",
  "Förråd",
  "Annat",
];

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
