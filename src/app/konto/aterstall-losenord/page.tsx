"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Status = "exchanging" | "ready" | "error" | "done";

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-3.5 rounded-[2px] bg-accent" aria-hidden />
      <span className="text-xl font-semibold tracking-tight">Eivor</span>
    </span>
  );
}

export default function AterstallLosenordPage() {
  const [status, setStatus] = useState<Status>("exchanging");
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read the recovery code straight off the URL rather than the
    // next/navigation hook, so this page doesn't need a Suspense
    // boundary for what's already an entirely client-rendered flow.
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setStatus("error");
      return;
    }
    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setStatus(error ? "error" : "ready");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });
    setIsSaving(false);
    if (error) {
      setError(
        error.message.includes("Password should be at least")
          ? "Lösenordet måste vara minst 8 tecken."
          : "Kunde inte spara lösenordet. Försök igen.",
      );
      return;
    }
    setStatus("done");
  }

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr_auto]">
      <header className="flex items-center px-6 py-5">
        <Link href="/" aria-label="Eivor, till startsidan">
          <Wordmark />
        </Link>
      </header>

      <section className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-[350px]">
          {status === "exchanging" && (
            <p className="text-center text-sm text-foreground/50">Verifierar länken…</p>
          )}

          {status === "error" && (
            <>
              <h1 className="text-center text-2xl font-medium tracking-tight">
                Länken fungerar inte
              </h1>
              <p className="mt-3 text-center text-sm text-foreground/70">
                Länken kan ha gått ut eller redan använts. Begär en ny återställningslänk.
              </p>
              <Link
                href="/konto/logga-in"
                className="mt-6 block text-center text-sm font-medium text-accent hover:underline"
              >
                Tillbaka till inloggning
              </Link>
            </>
          )}

          {status === "ready" && (
            <>
              <h1 className="text-center text-3xl font-medium tracking-tight">
                Välj ett nytt lösenord
              </h1>
              <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3">
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  aria-label="Nytt lösenord"
                  placeholder="Nytt lösenord (minst 8 tecken)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-lg border border-border bg-background px-4 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
                >
                  {isSaving ? "Sparar…" : "Spara nytt lösenord"}
                </button>
              </form>
              {error && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </>
          )}

          {status === "done" && (
            <>
              <h1 className="text-center text-2xl font-medium tracking-tight">
                Lösenordet är sparat
              </h1>
              <Link
                href="/dashboard"
                className="mt-6 block text-center text-sm font-medium text-accent hover:underline"
              >
                Fortsätt till ditt ärende →
              </Link>
            </>
          )}
        </div>
      </section>

      <footer className="flex justify-center gap-6 px-6 py-7 text-xs text-foreground/50">
        <a href="#" className="hover:text-foreground">
          Villkor
        </a>
        <a href="#" className="hover:text-foreground">
          Integritetspolicy
        </a>
      </footer>
    </main>
  );
}
