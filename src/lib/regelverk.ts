import { createClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/embeddings";

export type RegelverkMatch = {
  id: string;
  source: string;
  type: "lag" | "föreskrift" | "vägledning";
  valid_from: string | null;
  paragraf_ref: string | null;
  content: string;
  similarity: number;
};

// regelverk_chunks is publicly readable (see its RLS policy), so the anon
// key is enough here - no user session or service role needed.
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function searchRegelverk(
  query: string,
  matchCount = 8,
): Promise<RegelverkMatch[]> {
  const embedding = await embedQuery(query);

  const { data, error } = await getClient().rpc("match_regelverk_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
  });

  if (error) throw new Error(`Regelverkssökning misslyckades: ${error.message}`);
  return data ?? [];
}

// The "source" column is the raw document/file name, which for lagtext
// carries a filesystem-safe "(2010-900)" instead of the real SFS notation
// "(2010:900)" - restore the colon for anything user- or model-facing.
function friendlySourceName(match: RegelverkMatch): string {
  if (match.type !== "lag") return match.source;
  return match.source.replace(/\((\d{4})-(\d+)\)\s*$/, "($1:$2)").trim();
}

// A paragraf_ref on a "vägledning" chunk was extracted from a law
// paragraph mentioned inline in Boverket's prose (see extractParagrafRef
// in scripts/ingest-regelverk.mjs) - it's a reference to the law being
// explained, not to a section of the guidance article itself, so the
// citation must name the law (PBL, or PBF when the excerpt says so),
// never the vägledning article's own title.
function referencedLawName(match: RegelverkMatch): string {
  return /byggförordning/i.test(match.content)
    ? "Plan- och byggförordning"
    : "Plan- och bygglag";
}

// The exact parenthetical a citation should use for this excerpt - a
// specific paragraph when we have one, otherwise the named source. There
// are no real page numbers for the vägledning material (it's scraped from
// Boverket's PBL kunskapsbanken web handbook, not a paginated PDF), so the
// fallback is "Boverket, <dokumentnamn>" rather than a fabricated "s. X".
export function citationFor(match: RegelverkMatch): string {
  if (match.paragraf_ref) {
    const lawName =
      match.type === "vägledning" ? referencedLawName(match) : friendlySourceName(match);
    return `${lawName} ${match.paragraf_ref}`;
  }
  return match.type === "vägledning" ? `Boverket, ${match.source}` : friendlySourceName(match);
}

export function formatRegelverkContext(matches: RegelverkMatch[]): string {
  return matches
    .map((match) => {
      const valid = match.valid_from ? ` (giltig från ${match.valid_from})` : "";
      return `CITAT ATT ANVÄNDA: (${citationFor(match)})${valid}\n${match.content}`;
    })
    .join("\n\n---\n\n");
}
