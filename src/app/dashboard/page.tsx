"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { takePendingAssessment } from "@/lib/pending-assessment";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { DashboardSidebar } from "@/components/DashboardSidebar";

type ProjectRow = {
  id: string;
  updated_at: string;
  assessment_verdict: string | null;
  // project_answers.project_id is unique, so PostgREST embeds this as a
  // single object (or null) rather than an array.
  project_answers: { answers: Record<string, unknown> | null; updated_at: string } | null;
};

type Case = {
  id: string;
  projectType: string;
  address: string | null;
  hasAssessment: boolean;
  lastActivity: string;
};

function toCase(row: ProjectRow): Case {
  const answers = row.project_answers?.answers ?? {};
  const answersUpdatedAt = row.project_answers?.updated_at;
  const lastActivity =
    answersUpdatedAt && answersUpdatedAt > row.updated_at ? answersUpdatedAt : row.updated_at;

  return {
    id: row.id,
    projectType: (answers.projectType as string) || "Ärende",
    address: (answers.propertyDesignation as string) || null,
    hasAssessment: Boolean(row.assessment_verdict),
    lastActivity,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [cases, setCases] = useState<Case[] | null>(null);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.replace("/konto/logga-in");
        return;
      }
      if (cancelled) return;
      setUser(currentUser);

      // If the visitor just came from a landing-page chat with a verdict
      // already in hand, skip the dashboard entirely and drop them
      // straight into that new case - matching the original single-case
      // flow rather than making them click through an empty grid.
      const pending = takePendingAssessment();
      if (pending) {
        const { data: created, error: createError } = await supabase
          .from("projects")
          .insert({
            user_id: currentUser.id,
            initial_description: pending.description,
            assessment_verdict: pending.verdict,
            assessment_summary: pending.summary ?? null,
          })
          .select("id")
          .single();

        if (!cancelled && !createError && created) {
          router.replace(`/projekt/${created.id}`);
          return;
        }
        // Fall through to the normal dashboard if creation failed - the
        // pending assessment is already consumed either way.
      }

      const { data, error: fetchError } = await supabase
        .from("projects")
        .select("id, updated_at, assessment_verdict, project_answers(answers, updated_at)")
        .eq("user_id", currentUser.id);

      if (cancelled) return;
      if (fetchError) {
        setError("Kunde inte hämta dina ärenden. Försök ladda om sidan.");
        setCases([]);
        return;
      }

      const rows = (data ?? []) as unknown as ProjectRow[];
      const nextCases = rows
        .map(toCase)
        .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
      setCases(nextCases);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNewCase() {
    if (!user || isCreating) return;
    setIsCreating(true);
    setError(null);

    const { data: created, error: createError } = await supabase
      .from("projects")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (createError || !created) {
      setError("Kunde inte skapa ett nytt ärende. Försök igen.");
      setIsCreating(false);
      return;
    }
    router.push(`/projekt/${created.id}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const filteredCases = useMemo(() => {
    if (!cases) return null;
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) => c.projectType.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q),
    );
  }, [cases, query]);

  if (!user || cases === null) {
    return (
      <main className="flex h-dvh items-center justify-center px-4">
        <p className="text-sm text-foreground/50">Laddar…</p>
      </main>
    );
  }

  return (
    <div className="flex h-dvh">
      <DashboardSidebar user={user} onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto bg-muted">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ärenden</h1>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-foreground/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök på typ av åtgärd eller fastighetsbeteckning…"
                className="h-11 w-full rounded-xl border border-gray-300 bg-background pr-4 pl-10 text-sm outline-none focus:border-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={handleNewCase}
              disabled={isCreating}
              className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground disabled:opacity-40"
            >
              <PlusIcon className="size-4" />
              {isCreating ? "Skapar…" : "Nytt ärende"}
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {cases.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-lg font-medium">Inga ärenden ännu</p>
              <p className="max-w-sm text-sm text-foreground/60">
                Starta ditt första ärende så hjälper Eivor dig ta reda på om det kräver
                bygglov och bygger upp underlaget åt dig samtidigt.
              </p>
              <button
                type="button"
                onClick={handleNewCase}
                disabled={isCreating}
                className="mt-2 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-6 text-sm font-medium text-accent-foreground disabled:opacity-40"
              >
                <PlusIcon className="size-4" />
                {isCreating ? "Skapar…" : "Starta nytt ärende"}
              </button>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCases?.map((c) => (
                <Link
                  key={c.id}
                  href={`/projekt/${c.id}`}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5 transition-colors hover:border-accent"
                >
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-foreground/40 uppercase">
                      {c.projectType}
                    </p>
                    <p className="mt-1 truncate text-base font-medium">
                      {c.address || "Ingen adress angiven"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        c.hasAssessment
                          ? "bg-accent-soft text-accent"
                          : "bg-muted text-foreground/60"
                      }`}
                    >
                      {c.hasAssessment ? "Bedömning klar" : "Pågående"}
                    </span>
                  </div>

                  <p className="text-xs text-foreground/50">
                    Uppdaterad {new Date(c.lastActivity).toLocaleDateString("sv-SE")}
                  </p>

                  <span className="mt-auto self-start rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
                    Fortsätt
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
