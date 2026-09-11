import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoggaInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div>
        <h1 className="text-2xl font-semibold">Logga in</h1>
      </div>

      <AuthForm mode="login" />

      <p className="text-sm text-foreground/70">
        Inget konto ännu?{" "}
        <Link href="/konto" className="text-accent hover:underline">
          Skapa konto
        </Link>
      </p>
    </main>
  );
}
