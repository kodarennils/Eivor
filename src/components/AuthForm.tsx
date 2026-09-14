"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/icons";

type Mode = "signup" | "login";
type LoginStep = "email" | "password" | "reset-request" | "reset-sent";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<LoginStep>("email");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(translateAuthError(error.message));
      setIsGoogleLoading(false);
    }
  }

  // Step 1 of login: just move to the password step - no network call yet.
  function handleContinueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setStep("password");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    try {
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
        router.push("/dashboard");
        router.refresh();
      } else {
        setCheckInbox(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(translateAuthError(error.message));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/konto/aterstall-losenord`,
      });
      if (error) {
        setError(translateAuthError(error.message));
        return;
      }
      setStep("reset-sent");
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

  if (mode === "login" && step === "reset-sent") {
    return (
      <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        Vi har skickat en återställningslänk till <strong>{email}</strong>. Klicka
        på länken i mailet för att välja ett nytt lösenord.
      </div>
    );
  }

  if (mode === "login" && step === "reset-request") {
    return (
      <div className="flex flex-col gap-3">
        <form onSubmit={handleResetRequest} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            aria-label="E-postadress"
            placeholder="E-postadress"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-border bg-background px-4 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {isLoading ? "Skickar…" : "Skicka återställningslänk"}
          </button>
        </form>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep("password");
          }}
          className="self-start text-sm text-foreground/50 hover:text-foreground/80"
        >
          ← Tillbaka
        </button>
      </div>
    );
  }

  if (mode === "login" && step === "password") {
    return (
      <div className="flex flex-col gap-3">
        <form onSubmit={handleLoginWithPassword} className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setPassword("");
                setError(null);
              }}
              className="shrink-0 text-xs font-medium text-accent hover:underline"
            >
              Ändra
            </button>
          </div>
          <input
            type="password"
            required
            autoComplete="current-password"
            autoFocus
            aria-label="Lösenord"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-background px-4 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {isLoading ? "Loggar in…" : "Logga in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep("reset-request");
          }}
          className="self-start text-sm text-accent hover:underline"
        >
          Glömt lösenord?
        </button>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  // mode === "signup", or mode === "login" && step === "email"
  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={mode === "signup" ? handleSignup : handleContinueWithEmail}
        className="flex flex-col gap-3"
      >
        <input
          type="email"
          required
          autoComplete="email"
          aria-label="E-postadress"
          placeholder="E-postadress"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-4 text-sm outline-none focus:border-accent"
        />
        {mode === "signup" && (
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-label="Lösenord"
            placeholder="Lösenord (minst 8 tecken)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-background px-4 text-sm outline-none focus:border-accent"
          />
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {isLoading ? "Ett ögonblick…" : mode === "signup" ? "Skapa konto" : "Fortsätt med e-post"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="my-1 h-px bg-border" />

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium hover:border-foreground/40 disabled:opacity-40"
      >
        <GoogleIcon className="h-4 w-4" />
        {isGoogleLoading
          ? "Ett ögonblick…"
          : mode === "signup"
            ? "Skapa konto med Google"
            : "Fortsätt med Google"}
      </button>
    </div>
  );
}

function translateAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    // Covers two real cases without telling them apart (that would need a
    // server lookup exposing whether an email is registered - an
    // enumeration risk not worth taking for a friendlier message): a
    // genuinely wrong password, or an account that was originally created
    // via Google and so has no password set at all.
    return "Fel e-postadress eller lösenord. Om kontot skapades med Google, logga in med Google-knappen ovan - eller ange ett lösenord via \"Glömt lösenord?\".";
  }
  if (message.includes("already registered") || message.includes("already exists")) {
    return "Det finns redan ett konto med den e-postadressen. Prova att logga in istället.";
  }
  if (message.includes("Password should be at least")) {
    return "Lösenordet måste vara minst 8 tecken.";
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "För många försök. Vänta en stund och försök igen.";
  }
  return "Något gick fel. Försök igen.";
}
