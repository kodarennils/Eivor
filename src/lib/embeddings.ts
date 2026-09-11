// Query-time embedding via Voyage AI - must use the same model as the
// ingestion pipeline (scripts/ingest-regelverk.mjs) so vectors are
// comparable. input_type: "query" tells Voyage to apply the model's
// query-side instruction prefix internally.

const MODEL = "voyage-multilingual-2";

export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY saknas");

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: MODEL, input_type: "query" }),
  });

  if (!response.ok) {
    throw new Error(`Voyage AI-fel (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
