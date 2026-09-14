"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { DashboardSidebar } from "@/components/DashboardSidebar";

export default function InstallningarPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (cancelled) return;
      if (!currentUser) {
        router.replace("/konto/logga-in");
        return;
      }
      setUser(currentUser);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    setIsSavingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) {
      setPasswordError(
        error.message.includes("Password should be at least")
          ? "Lösenordet måste vara minst 8 tecken."
          : "Kunde inte spara lösenordet. Försök igen.",
      );
      return;
    }
    setNewPassword("");
    setPasswordSaved(true);
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch("/api/konto/radera", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Kunde inte radera kontot. Försök igen.");
        setIsDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      router.replace("/");
    } catch {
      setDeleteError("Kunde inte nå servern. Försök igen.");
      setIsDeleting(false);
    }
  }

  if (!user) {
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
        <div className="mx-auto max-w-2xl px-6 py-10 sm:px-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Kontoinställningar</h1>

          <section className="mt-8 rounded-xl border border-border bg-background p-6">
            <h2 className="text-sm font-semibold">E-post</h2>
            <p className="mt-2 text-sm text-foreground/70">{user.email}</p>
          </section>

          <section className="mt-6 rounded-xl border border-border bg-background p-6">
            <h2 className="text-sm font-semibold">Byt lösenord</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Fungerar även om du inte har ett lösenord sedan tidigare (t.ex. om kontot
              skapades med Google).
            </p>
            <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Nytt lösenord (minst 8 tecken)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={isSavingPassword}
                className="h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground disabled:opacity-40"
              >
                {isSavingPassword ? "Sparar…" : "Spara lösenord"}
              </button>
            </form>
            {passwordSaved && (
              <p className="mt-3 text-sm text-accent">Lösenordet är sparat.</p>
            )}
            {passwordError && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {passwordError}
              </p>
            )}
          </section>

          <section className="mt-6 rounded-xl border border-red-200 bg-background p-6">
            <h2 className="text-sm font-semibold text-red-700">Radera konto</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Detta raderar ditt konto permanent, tillsammans med alla dina ärenden,
              uppladdade foton och dokument. Det går inte att ångra.
            </p>

            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="mt-4 h-11 rounded-xl border border-red-300 px-5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Radera konto
              </button>
            ) : (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  Är du helt säker? Alla dina ärenden, foton och dokument försvinner
                  permanent.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="h-10 rounded-xl bg-red-700 px-4 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {isDeleting ? "Raderar…" : "Ja, radera mitt konto permanent"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={isDeleting}
                    className="h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {deleteError && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
