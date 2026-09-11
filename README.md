# Eivor

AI-tjänst som hjälper privatpersoner i Sverige att bedöma om ett byggprojekt
kräver bygglov, och guidar dem genom ansökan. Byggd med Next.js (App Router)
och Supabase.

## Kom igång

```bash
npm install
cp .env.example .env.local   # fyll i nycklarna, se nedan
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

## Miljövariabler

Se `.env.example`. Behövs:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` – från
  Supabase-projektets API-inställningar.
- `SUPABASE_SERVICE_ROLE_KEY` – server-only, admin-nyckel. Används inte av
  appen själv ännu (all klientkod går via RLS), men behövs för
  administration/skript.
- `ANTHROPIC_API_KEY` – används av `/api/assess` för bygglovsbedömningen i
  chatten.
- `VOYAGE_API_KEY` – används av `scripts/ingest-regelverk.mjs` för att
  embedda regelverkstexter (och senare för att embedda frågor vid
  RAG-sökning). Skaffa en på [dashboard.voyageai.com](https://dashboard.voyageai.com).

## Supabase

Migrationer ligger i `supabase/migrations/` och körs manuellt via
SQL-editorn i Supabase-dashboarden (eller `supabase db push` om du länkat
projektet med CLI:n):

- `0001_enable_pgvector.sql` – aktiverar `pgvector`.
- `0002_core_tables.sql` – skapar `projects`, `project_answers`,
  `project_images` med RLS-policyer (varje användare ser bara sina egna
  rader) samt en privat storage-bucket `project-images` för fasadfoton.
- `0003_regelverk_chunks.sql` – skapar `regelverk_chunks` (embeddade
  utdrag ur PBL, Boverkets föreskrifter och vägledningstexter) för
  RAG-systemet. Publikt läsbar, skrivs bara av ingest-skriptet.
- `0004_match_regelverk_chunks.sql` – pgvector-sökfunktion som `/api/assess`
  använder för att hämta relevanta chunkar.
- `0005_project_detaljplan.sql` – lägger till `detaljplan_storage_path`/
  `detaljplan_text` på `projects`, samt en privat storage-bucket
  `project-documents` för uppladdade detaljplaner (PDF).

`project_answers.answers` är JSONB eftersom formulärets exakta fält
(`src/lib/project-fields.ts`) fortfarande kan ändras utan schemamigrering.

## RAG: regelverkskällor

Lägg källdokument (.rtf/.rtfd) i `data/regelverk/{lag,byggregler,vagledning}/`
och kör:

```bash
npm run ingest:regelverk
```

Skriptet (`scripts/ingest-regelverk.mjs`) konverterar varje dokument till
text via macOS `textutil` (macOS-only), chunkar lagtext/föreskrifter per
"N §"/"N kap." och vägledningstexter per stycke, embeddar varje chunk med
Voyage AI (`voyage-multilingual-2`), och skriver till `regelverk_chunks`.
Det är säkert att köra om – gamla chunkar för samma källa ersätts.

`/api/assess` klassificerar först ärendetyp (`src/lib/arendetyper.ts`,
Haiku), bygger en riktad sökfråga, hämtar relevanta chunkar via
`match_regelverk_chunks`, och skickar dem till Claude som
`REGELVERKSKONTEXT` med instruktion att bara citera det som faktiskt
finns där.

### Projekt-specifik detaljplan

På `/projekt` kan användaren valfritt ladda upp detaljplanen (PDF) för sin
fastighet. `/api/projekt/detaljplan` extraherar texten (`unpdf`) och sparar
den på projektets rad (`projects.detaljplan_text`) – inte i den delade
`regelverk_chunks`-tabellen. När `/api/assess` anropas med `projectId` för
ett ärende som har en uppladdad detaljplan läggs den texten till som extra
kontext ("DETALJPLAN FÖR FASTIGHETEN") utöver `REGELVERKSKONTEXT`, och kan
då väga tyngre än nationella standardregler (t.ex. lokal utökad lovplikt).
Saknas detaljplan avslutar Eivor istället sin bedömning med: "Denna
bedömning bygger på nationella regler – lokala detaljplanebestämmelser kan
tillkomma."

## Struktur

- `src/app/page.tsx` – landningssida.
- `src/app/chat/page.tsx` – öppen chatt där besökare beskriver sitt ärende
  och får en bygglovsbedömning, utan konto.
- `src/app/api/assess/route.ts` – anropar Claude för att bedöma om bygglov
  troligen krävs.
- `src/app/konto/` – kontoskapande och inloggning (Supabase Auth,
  e-post/lösenord).
- `src/app/auth/callback/route.ts` – hanterar bekräftelselänken i mailet.
- `src/app/projekt/page.tsx` – inloggad vy: strukturerat formulär,
  fasaduppladdning (norr/öster/söder/väster), valfri detaljplanuppladdning,
  och en "Uppdatera bedömning"-knapp för det aktiva ärendet.
- `src/app/api/projekt/detaljplan/route.ts` – tar emot PDF-uppladdning,
  extraherar text, sparar på projektets rad.
- `src/lib/regelverk.ts`, `src/lib/embeddings.ts`, `src/lib/arendetyper.ts` –
  RAG-sökning: query-embedding (Voyage), pgvector-anrop, ärendeklassificering.
- `src/lib/supabase/` – Supabase-klienter (browser/server).
- `src/lib/pending-assessment.ts` – bär över chattens beskrivning/bedömning
  till det nyskapade kontot via `sessionStorage`.
