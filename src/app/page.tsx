import Link from "next/link";
import Image from "next/image";
import { TopHero } from "@/components/TopHero";
import { HeroChat } from "@/components/HeroChat";
import { DescribeIcon, AssessmentIcon, FormIcon, SubmitIcon } from "@/components/icons";

const NAV_LINKS = [{ href: "#hur-det-fungerar", label: "Så funkar det" }];

const EXAMPLE_PROJECTS = [
  {
    label: "Attefallshus",
    src: "https://images.unsplash.com/photo-1767318984222-907e0560d5a5?q=80&w=800&auto=format&fit=crop",
  },
  {
    label: "Tillbyggnad",
    src: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=800&auto=format&fit=crop",
  },
  {
    label: "Plank",
    src: "https://images.unsplash.com/photo-1593285247650-cd7bb44adcfd?q=80&w=800&auto=format&fit=crop",
  },
  {
    label: "Fasadändring",
    src: "https://images.unsplash.com/photo-1570132156016-f33ce84b1d9f?q=80&w=800&auto=format&fit=crop",
  },
];

const STEPS = [
  {
    title: "Beskriv",
    text: "Berätta i egna ord vad du vill bygga eller ändra – ingen förkunskap krävs.",
    icon: DescribeIcon,
  },
  {
    title: "Få en bedömning",
    text: "Eivor analyserar ditt ärende och ger dig ett tydligt svar på om bygglov troligen krävs.",
    icon: AssessmentIcon,
  },
  {
    title: "Fyll i uppgifter",
    text: "Ange mått och ladda upp fasadfoton – vi guidar dig genom precis det som behövs.",
    icon: FormIcon,
  },
  {
    title: "Få en färdig ansökan",
    text: "Eivor sammanställer ritningar och uppgifter till en komplett bygglovsansökan.",
    icon: SubmitIcon,
  },
];

// Real figures about Eivor's knowledge base and coverage — no fabricated
// customer logos or usage stats, unlike the reference design this grid style
// was borrowed from.
const QUICK_FACTS = [
  {
    span: "col-span-2",
    big: "290",
    small: "Svenska kommuner – PBL och BBR gäller lika i hela landet",
  },
  { label: "Attefallshus" },
  { label: "Tillbyggnad" },
  { label: "Nybyggnad" },
  {
    span: "col-span-2",
    big: "76",
    small: "Lagtexter och vägledningar från Boverket i kunskapsbasen",
  },
  { label: "Fasadändring" },
  { label: "Altan / plank / mur / staket" },
];

const ASSURANCES = [
  {
    icon: AssessmentIcon,
    title: "Grundat i PBL & BBR",
    text: "Varje bedömning stäms av mot Plan- och bygglagen och Boverkets byggregler – inte gissningar.",
  },
  {
    icon: DescribeIcon,
    title: "Skräddarsytt per ärendetyp",
    text: "Eivor känner igen attefallshus, tillbyggnad, nybyggnad, fasadändring och plank/mur/staket och söker rätt regelverk för just ditt fall.",
  },
  {
    icon: FormIcon,
    title: "Du behåller kontrollen",
    text: "Inget skickas in utan att du har sett och godkänt varje uppgift och ritning.",
  },
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <span className="inline-block size-3.5 rounded-[2px] bg-accent" aria-hidden />
      <span className="text-xl font-semibold tracking-tight">Eivor</span>
    </span>
  );
}

export default function Home() {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" aria-label="Eivor, till startsidan">
            <Wordmark />
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-foreground/70 md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-foreground">
                {link.label}
              </a>
            ))}
            <a href="#" className="hover:text-foreground">
              Priser
            </a>
            <a href="#" className="hover:text-foreground">
              Om oss
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/konto/logga-in"
              className="hidden text-sm font-medium text-foreground/70 hover:text-foreground sm:inline"
            >
              Logga in
            </Link>
            <Link
              href="/konto"
              className="bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-foreground"
            >
              Kom igång
            </Link>
          </div>
        </div>
      </header>

      <main>
        <TopHero />

        <div className="border-t border-border">
          <HeroChat />
        </div>

        <section className="mx-auto max-w-6xl px-6 pt-8 pb-20">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {EXAMPLE_PROJECTS.map((project) => (
              <div
                key={project.label}
                className="group relative aspect-[4/3] overflow-hidden bg-muted"
              >
                <Image
                  src={project.src}
                  alt={project.label}
                  fill
                  sizes="(min-width: 640px) 25vw, 50vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                <span className="absolute bottom-3 left-4 text-sm font-semibold text-white">
                  {project.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-sm text-foreground/50">Vad Eivor bygger på</p>
            <div className="mt-8 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              {QUICK_FACTS.map((fact, i) =>
                "label" in fact ? (
                  <div
                    key={fact.label}
                    className="flex items-center justify-center bg-background px-6 py-8 text-center text-sm font-medium"
                  >
                    {fact.label}
                  </div>
                ) : (
                  <div
                    key={i}
                    className={`${fact.span} flex flex-col justify-end bg-background p-6`}
                  >
                    <span className="text-3xl font-medium tracking-tight text-accent sm:text-4xl">
                      {fact.big}
                    </span>
                    <span className="mt-2 text-sm text-foreground/60">{fact.small}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section id="hur-det-fungerar" className="border-t border-border py-24">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-sm text-foreground/50">Så funkar det</p>
            <h2 className="mt-4 max-w-xl text-3xl font-medium tracking-tight sm:text-4xl">
              Från idé till komplett ansökan
            </h2>
            <ol className="mt-16 grid gap-14 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-medium tracking-tight text-accent">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <step.icon className="h-6 w-6 text-accent" />
                  </div>
                  <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-px bg-border sm:grid-cols-3">
              {ASSURANCES.map((a) => (
                <div key={a.title} className="bg-background p-8">
                  <a.icon className="h-6 w-6 text-accent" />
                  <h3 className="mt-5 font-semibold tracking-tight">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16">
          <div className="border border-border p-6">
            <p className="text-sm text-foreground/70">
              Eivors bedömning är preliminär och vägledande. Det slutgiltiga
              beslutet om bygglov fattas alltid av din kommuns
              bygglovsenhet.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-6 pt-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h4 className="text-sm text-background/50">Ärendetyper</h4>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>Attefallshus</li>
                <li>Tillbyggnad</li>
                <li>Nybyggnad</li>
                <li>Fasadändring</li>
                <li>Altan / plank / mur / staket</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm text-background/50">Kom igång</h4>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>
                  <Link href="/chat" className="hover:underline">
                    Beskriv ditt projekt
                  </Link>
                </li>
                <li>
                  <Link href="/konto/logga-in" className="hover:underline">
                    Logga in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm text-background/50">Regelverk</h4>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>Plan- och bygglagen (PBL)</li>
                <li>Boverkets byggregler (BBR)</li>
                <li>Boverkets vägledningar</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm text-background/50">Företaget</h4>
              <ul className="mt-4 space-y-2.5 text-sm font-medium">
                <li>
                  <a href="#" className="hover:underline">
                    Integritetspolicy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:underline">
                    Kontakt
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex justify-center overflow-hidden">
            <span className="select-none text-[20vw] leading-none font-semibold tracking-tight text-background/90 lg:text-[14rem]">
              Eivor
            </span>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-background/20 py-6 text-xs text-background/60 sm:flex-row">
            <span>© {new Date().getFullYear()} Eivor · Alla rättigheter förbehållna</span>
          </div>
        </div>
      </footer>
    </>
  );
}
