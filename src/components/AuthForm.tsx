"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signup" | "login";

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        if (data.session) {
          router.push("/projekt");
          router.refresh();
        } else {
          setCheckInbox(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(translateAuthError(error.message));
          return;
        }
        router.push("/projekt");
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (checkInbox) {
    return (
      <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        Vi har skickat ett bekräftelsemail till <strong>{email}</strong>. Klicka
        på länken i mailet för att aktivera kontot.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          E-post
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Lösenord
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
      >
        {isLoading ? "Ett ögonblick…" : mode === "signup" ? "Skapa konto" : "Logga in"}
      </button>
    </form>
  );
}

function translateAuthError(message: string): string {
  if (message.includes("already registered") || message.includes("already exists")) {
    return "Det finns redan ett konto med den e-postadressen. Prova att logga in istället.";
  }
  if (message.includes("Invalid login credentials")) {
    return "Fel e-postadress eller lösenord.";
  }
  if (message.includes("Password should be at least")) {
    return "Lösenordet måste vara minst 8 tecken.";
  }
  return "Något gick fel. Försök igen.";
}
