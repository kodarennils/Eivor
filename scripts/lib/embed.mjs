// Voyage AI embedding wrapper - used by the ingestion script now, and
// reusable later for embedding a user's question at RAG query time.
// Anthropic's recommended embedding provider for RAG with Claude.
//
// Paces requests lightly and retries with backoff on 429s, since ingestion
// runs unattended. Once a payment method is on file, Voyage's standard
// tier limits are high enough that this is mostly just politeness -
// the retry/backoff logic is what actually protects against a transient
// 429 (e.g. right after adding billing, while the higher limits propagate).

const MODEL = "voyage-multilingual-2";
export const EMBEDDING_DIMENSIONS = 1024;
const BATCH_LIMIT = 128; // Voyage's per-request input limit
const MIN_REQUEST_INTERVAL_MS = 1_000;
const RATE_LIMIT_BACKOFF_MS = 20_000;
const MAX_RETRIES = 8;

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
}

async function embedBatch(batch, inputType) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY saknas i .env.local");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    lastRequestAt = Date.now();

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: batch, model: MODEL, input_type: inputType }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.data.map((item) => item.embedding);
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 + 1000
        : RATE_LIMIT_BACKOFF_MS;
      console.log(`    (rate limited, väntar ${Math.round(waitMs / 1000)}s...)`);
      await sleep(waitMs);
      continue;
    }

    const body = await response.text();
    throw new Error(`Voyage AI-fel (${response.status}): ${body}`);
  }

  throw new Error("Voyage AI: för många 429-svar, ger upp.");
}

async function embed(texts, inputType) {
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);
    results.push(...(await embedBatch(batch, inputType)));
  }
  return results;
}

export async function embedPassages(texts) {
  return embed(texts, "document");
}

export async function embedQuery(text) {
  const [embedding] = await embed([text], "query");
  return embedding;
}
