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

export function formatRegelverkContext(matches: RegelverkMatch[]): string {
  return matches
    .map((match, i) => {
      const ref = match.paragraf_ref ? `, ${match.paragraf_ref}` : "";
      const valid = match.valid_from ? ` (giltig från ${match.valid_from})` : "";
      return `[${i + 1}] ${match.source}${ref}${valid}\n${match.content}`;
    })
    .join("\n\n---\n\n");
}
