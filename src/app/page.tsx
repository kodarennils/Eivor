import Link from "next/link";

const steps = [
  {
    title: "Beskriv projektet",
    text: "Berätta i egna ord vad du vill bygga eller ändra – ingen förkunskap krävs.",
  },
  {
    title: "Få en snabb bedömning",
    text: "Eivor analyserar ditt ärende och ger dig ett tydligt svar på om bygglov troligen krävs.",
  },
  {
    title: "Fyll i uppgifter",
    text: "Krävs bygglov guidar vi dig genom mått, förutsättningar och foton på fasaderna.",
  },
  {
    title: "Skicka in ärendet",
    text: "Eivor sammanställer allt som behövs inför ansökan till din kommun.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-24 sm:py-32">
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-accent">
          Bygglov, förenklat
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Ta reda på om du behöver bygglov – direkt.
        </h1>
        <p className="max-w-xl text-lg text-foreground/70">
          Eivor är en AI-tjänst som hjälper dig som ska bygga om, bygga till
          eller bygga nytt. Beskriv ditt projekt i chatten så får du en snabb
          bedömning, och hjälp att ta fram det som behövs för en
          bygglovsansökan.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-medium text-accent-foreground transition hover:opacity-90"
        >
          Beskriv ditt byggprojekt
          <span aria-hidden>→</span>
        </Link>
        <p className="text-sm text-foreground/50">
          Gratis och utan konto att komma igång med.
        </p>
      </section>

      <section className="border-t border-border bg-muted/50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Så fungerar det
          </h2>
          <ol className="mt-6 grid gap-8 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm text-foreground/70">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-border p-6">
          <p className="text-sm text-foreground/70">
            Eivors bedömning är preliminär och vägledande. Det slutgiltiga
            beslutet om bygglov fattas alltid av din kommuns
            bygglovsenhet.
          </p>
        </div>
      </section>
    </main>
  );
}
