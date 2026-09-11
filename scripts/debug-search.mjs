import { createClient } from "@supabase/supabase-js";
import { embedQuery } from "./lib/embed.mjs";

process.loadEnvFile(".env.local");

const query = process.argv[2];
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const embedding = await embedQuery(query);
const { data, error } = await supabase.rpc("match_regelverk_chunks", {
  query_embedding: embedding,
  match_count: 8,
});

if (error) throw error;

for (const [i, m] of data.entries()) {
  console.log(`\n=== [${i + 1}] ${m.source} ${m.paragraf_ref ?? ""} (similarity ${m.similarity.toFixed(3)}) ===`);
  console.log(m.content);
}
