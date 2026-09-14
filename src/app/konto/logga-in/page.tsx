import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-3.5 rounded-[2px] bg-accent" aria-hidden />
      <span className="text-xl font-semibold tracking-tight">Eivor</span>
    </span>
  );
}

export default function LoggaInPage() {
  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr_auto]">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Eivor, till startsidan">
          <Wordmark />
        </Link>
        <Link
          href="/konto"
          className="border border-border px-4 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Skapa konto
        </Link>
      </header>

      <section className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-[350px]">
          <h1 className="text-center text-3xl font-medium tracking-tight">
            Logga in på Eivor
          </h1>

          <div className="mt-10">
            <AuthForm mode="login" />
          </div>

          <p className="mt-6 text-center text-sm text-foreground/70">
            Har du inget konto?{" "}
            <Link href="/konto" className="font-medium text-accent hover:underline">
              Skapa konto
            </Link>
          </p>
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
