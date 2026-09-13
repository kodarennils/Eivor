"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/icons";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleLoading(true);
    const supabase = createClient();

    // Full-page redirect to Google, then back to /auth/callback, which
    // exchanges the code for a session and lands on /projekt - the same
    // destination as a successful magic-link sign-in.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(translateAuthError(error.message));
      setIsGoogleLoading(false);
    }
  }

  // Passwordless: the same call signs an existing user in or creates a new
  // account, so there's no separate "login" vs "signup" submit handler -
  // Supabase's email OTP flow already treats both cases identically.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setIsLoading(false);
    if (error) {
      setError(translateAuthError(error.message));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        Vi har skickat en inloggningslänk till <strong>{email}</strong>. Klicka
        på länken i mailet för att logga in.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          {isLoading ? "Skickar…" : "Fortsätt med e-post"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="my-4 h-px bg-border" />

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium hover:border-foreground/40 disabled:opacity-40"
      >
        <GoogleIcon className="h-4 w-4" />
        {isGoogleLoading ? "Ett ögonblick…" : "Fortsätt med Google"}
      </button>
    </div>
  );
}

function translateAuthError(message: string): string {
  if (message.toLowerCase().includes("rate limit")) {
    return "För många försök. Vänta en stund och försök igen.";
  }
  return "Något gick fel. Försök igen.";
}
