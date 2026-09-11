import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function KontoPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div>
        <h1 className="text-2xl font-semibold">Skapa konto</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Spara ditt ärende och fortsätt fylla i uppgifter om projektet.
        </p>
      </div>

      <AuthForm mode="signup" />

      <p className="text-sm text-foreground/70">
        Har du redan ett konto?{" "}
        <Link href="/konto/logga-in" className="text-accent hover:underline">
          Logga in
        </Link>
      </p>
    </main>
  );
}
