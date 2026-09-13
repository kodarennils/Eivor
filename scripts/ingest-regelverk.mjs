// Reads every source document under data/regelverk/{lag,byggregler,vagledning},
// chunks it per paragraph/section, embeds each chunk locally, and upserts
// into the regelverk_chunks table in Supabase.
//
// Usage: node scripts/ingest-regelverk.mjs
//
// Relies on macOS's built-in `textutil` to convert .rtf/.rtfd to plain
// text, so this script is macOS-only. Re-running it is safe: existing
// chunks for a given source are replaced.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { embedPassages } from "./lib/embed.mjs";

process.loadEnvFile(".env.local");

const ROOT = "data/regelverk";
const TYPE_BY_DIR = {
  lag: "lag",
  byggregler: "föreskrift",
  vagledning: "vägledning",
};
const BATCH_SIZE = 64;

const MONTHS = {
  januari: "01", februari: "02", mars: "03", april: "04", maj: "05",
  juni: "06", juli: "07", augusti: "08", september: "09", oktober: "10",
  november: "11", december: "12",
};

function findDocuments(dir) {
  const docs = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const entryPath = path.join(dir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      if (entry.toLowerCase().endsWith(".rtfd")) {
        const txtPath = path.join(entryPath, "TXT.rtf");
        if (existsSync(txtPath)) {
          docs.push({ name: entry.replace(/\.rtfd$/i, "").trim(), filePath: txtPath });
        }
        continue;
      }
      docs.push(...findDocuments(entryPath));
      continue;
    }

    if (entry.toLowerCase().endsWith(".rtf")) {
      docs.push({ name: entry.replace(/\.rtf$/i, "").trim(), filePath: entryPath });
    }
  }
  return docs;
}

function extractText(filePath) {
  const raw = execFileSync("textutil", ["-convert", "txt", "-stdout", filePath], {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 50,
  });
  return raw
    .replace(/\r\n/g, "\n")
    // TOC dot-leaders, e.g. "Bygga nytt. . . . . . . . . . . . 5"
    .replace(/(?:\.\s){4,}\d*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractValidFrom(text) {
  const pattern =
    /(?:träder i kraft|gäller från och med|gäller fr\.o\.m\.)\s+(?:den\s+)?(\d{1,2})\s+(\w+)\s+(\d{4})/i;
  const match = text.match(pattern);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

// Matches a chapter+paragraph reference anywhere in a chunk's text, e.g.
// "9 kap. 4 §" or "4 kap. 12 a §" - used both to backfill vägledning
// chunks (which don't have their own "N kap." / "N §" markers) and as a
// fallback for legal-text chunks that mention a *different* section than
// the one they're anchored on (e.g. "se 4 kap. 21-25 §§" inside 1 kap.).
const KAP_PARAGRAF_PATTERN = /(\d{1,2})\s*kap\.?\s*(\d{1,3}\s?[a-z]?)\s*§/i;

export function extractParagrafRef(text) {
  const match = text.match(KAP_PARAGRAF_PATTERN);
  if (!match) return null;
  const [, kap, para] = match;
  return `${kap} kap. ${para.replace(/\s+/, " ").trim()} §`;
}

// Splits legal text into chunks anchored on "N §" / "N kap." markers. Each
// bare "N §" marker only carries its own paragraph number in the source
// text (the chapter is stated once, in a preceding "N kap." heading), so
// the current chapter is tracked across markers and combined with the
// paragraph number to produce a full "9 kap. 4 §"-style reference.
// Text before the first marker (title/preamble) becomes its own chunk.
function chunkLegalText(text) {
  const markerPattern = /^(\d+\s?kap\.|\d+\s?§)/gm;
  const markers = [...text.matchAll(markerPattern)];
  if (markers.length === 0) return chunkProseText(text);

  const chunks = [];
  const preamble = text.slice(0, markers[0].index).trim();
  if (preamble.length > 0) chunks.push({ content: preamble, paragrafRef: null });

  let currentKap = null;

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    if (content.length === 0) continue;

    const marker = markers[i][1].replace(/\s+/g, " ").trim();
    const kapMatch = marker.match(/^(\d+)\s?kap\.?$/);
    if (kapMatch) {
      currentKap = kapMatch[1];
      chunks.push({ content, paragrafRef: null });
      continue;
    }

    const paragrafMatch = marker.match(/^(\d+)\s?§$/);
    const ref =
      paragrafMatch && currentKap
        ? `${currentKap} kap. ${paragrafMatch[1]} §`
        : (extractParagrafRef(content) ?? marker);
    chunks.push({ content, paragrafRef: ref });
  }
  return chunks;
}

// Splits guidance/prose text into paragraphs, merging short ones together
// so chunks stay in a reasonable size range for embedding + retrieval.
// Boverkets vägledningstexter don't have their own "N §" markers, but
// often mention the law paragraph they're explaining inline (e.g. "Enligt
// 9 kap. 4 § PBL ...") - pull that out into paragraf_ref when present so
// citations can point at the real provision instead of staying generic.
function chunkProseText(text) {
  // Some source documents (PDF-derived brochures) have no blank-line
  // paragraph breaks at all - fall back to splitting on single newlines.
  const doubleNewlineCount = (text.match(/\n{2,}/g) ?? []).length;
  const splitPattern = doubleNewlineCount >= 3 ? /\n{2,}/ : /\n/;
  const paragraphs = text.split(splitPattern).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (buffer.length >= 800) {
      chunks.push({ content: buffer, paragrafRef: extractParagrafRef(buffer) });
      buffer = "";
    }
  }
  if (buffer) chunks.push({ content: buffer, paragrafRef: extractParagrafRef(buffer) });
  return chunks;
}

// Re-derives paragraf_ref for chunks already in the database, from their
// stored content, without re-chunking or re-embedding anything. Walks each
// source's chunks in order so bare "N §" markers in lag/föreskrift chunks
// can be combined with the most recently seen "N kap." heading, exactly
// like chunkLegalText does at ingestion time.
async function backfillParagrafRef(supabase) {
  // PostgREST caps a single select at 1000 rows - page through with
  // .range() so sources beyond the first page aren't silently dropped.
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("regelverk_chunks")
      .select("id, source, type, chunk_index, content, paragraf_ref")
      .order("source", { ascending: true })
      .order("chunk_index", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`hämtning: ${error.message}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  let currentSource = null;
  let currentKap = null;
  const updates = [];

  for (const row of rows) {
    if (row.source !== currentSource) {
      currentSource = row.source;
      currentKap = null;
    }

    let ref = row.paragraf_ref;
    const trimmed = row.content.trim();

    if (row.type === "lag" || row.type === "föreskrift") {
      const kapMatch = trimmed.match(/^(\d+)\s?kap\.?\b/);
      const paragrafMatch = trimmed.match(/^(\d+)\s?§/);
      if (kapMatch) {
        currentKap = kapMatch[1];
      } else if (paragrafMatch && currentKap) {
        ref = `${currentKap} kap. ${paragrafMatch[1]} §`;
      } else if (!ref) {
        ref = extractParagrafRef(row.content);
      }
    } else if (!ref) {
      ref = extractParagrafRef(row.content);
    }

    if (ref && ref !== row.paragraf_ref) {
      updates.push({ id: row.id, paragraf_ref: ref });
    }
  }

  console.log(`${updates.length} av ${rows.length} chunkar får en ny/kompletterad paragraf_ref`);

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("regelverk_chunks")
      .update({ paragraf_ref: update.paragraf_ref })
      .eq("id", update.id);
    if (updateError) {
      console.log(`  FEL vid uppdatering av ${update.id}: ${updateError.message}`);
    }
  }

  console.log("Klart.");
}

const DRY_RUN = process.argv.includes("--dry-run");
const BACKFILL = process.argv.includes("--backfill-paragraf-ref");

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!supabaseUrl || !serviceKey)) {
    console.error("Saknar NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY i .env.local");
    process.exit(1);
  }
  const supabase = DRY_RUN ? null : createClient(supabaseUrl, serviceKey);

  if (BACKFILL) {
    if (!supabase) throw new Error("--backfill-paragraf-ref kan inte köras med --dry-run");
    await backfillParagrafRef(supabase);
    return;
  }

  let totalChunks = 0;

  const seenNames = new Map(); // name -> filePath, to catch collisions across all folders

  for (const [dirName, type] of Object.entries(TYPE_BY_DIR)) {
    const dir = path.join(ROOT, dirName);
    if (!existsSync(dir)) continue;

    const documents = findDocuments(dir);
    console.log(`\n${dirName}/ (${type}): ${documents.length} dokument`);

    for (const doc of documents) {
      process.stdout.write(`  ${doc.name} … `);

      const previousPath = seenNames.get(doc.name);
      if (previousPath && previousPath !== doc.filePath) {
        console.log(
          `HOPPAR ÖVER: namnkollision med "${previousPath}" - skulle skriva över dess chunkar. Byt namn på en av filerna.`,
        );
        continue;
      }
      seenNames.set(doc.name, doc.filePath);

      let text;
      try {
        text = extractText(doc.filePath);
      } catch (err) {
        console.log(`FEL vid textutdrag: ${err.message}`);
        continue;
      }
      if (!text) {
        console.log("tom text, hoppar över");
        continue;
      }

      const validFrom = extractValidFrom(text);
      const chunks =
        type === "vägledning" ? chunkProseText(text) : chunkLegalText(text);

      if (chunks.length === 0) {
        console.log("inga chunkar, hoppar över");
        continue;
      }

      totalChunks += chunks.length;
      if (DRY_RUN) {
        console.log(`${chunks.length} chunkar${validFrom ? ` (giltig från ${validFrom})` : ""}`);
        continue;
      }

      const { count: existingCount } = await supabase
        .from("regelverk_chunks")
        .select("id", { count: "exact", head: true })
        .eq("source", doc.name);
      if (existingCount === chunks.length) {
        console.log(`redan klar (${existingCount} chunkar), hoppar över`);
        continue;
      }

      try {
        const { error: deleteError } = await supabase
          .from("regelverk_chunks")
          .delete()
          .eq("source", doc.name);
        if (deleteError) throw new Error(`rensning: ${deleteError.message}`);

        let inserted = 0;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          const embeddings = await embedPassages(batch.map((c) => c.content));

          const rows = batch.map((chunk, j) => ({
            source: doc.name,
            type,
            valid_from: validFrom,
            paragraf_ref: chunk.paragrafRef,
            chunk_index: i + j,
            content: chunk.content,
            embedding: embeddings[j],
          }));

          const { error: insertError } = await supabase.from("regelverk_chunks").insert(rows);
          if (insertError) throw new Error(`insert: ${insertError.message}`);
          inserted += rows.length;
        }

        console.log(`${inserted} chunkar${validFrom ? ` (giltig från ${validFrom})` : ""}`);
      } catch (err) {
        // One document's persistent failure (e.g. exhausted rate-limit
        // retries) shouldn't abort the whole run - move on, it's safe to
        // re-run the script later and pick up wherever this left off.
        console.log(`FEL, hoppar till nästa dokument: ${err.message}`);
      }
    }
  }

  console.log(`\nTotalt: ${totalChunks} chunkar`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
