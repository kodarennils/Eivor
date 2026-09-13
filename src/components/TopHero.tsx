import Image from "next/image";

// Real, freely-licensed Unsplash photos - the original Lovable export's
// hero strip is a bundled jpg of unknown provenance/license, so this
// re-sources the same "husfoton + ritning + byggarbetsplats i en rad"
// style with verified stock photos instead of reusing that file.
const HERO_IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?q=80&w=800&auto=format&fit=crop",
    alt: "Hus på landet i skymning",
  },
  {
    src: "https://images.unsplash.com/photo-1541976590-713941681591?q=80&w=800&auto=format&fit=crop",
    alt: "Modern flerbostadshusfasad",
  },
  {
    src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=800&auto=format&fit=crop",
    alt: "Byggarbetare på en byggarbetsplats",
  },
  {
    src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=800&auto=format&fit=crop",
    alt: "Arkitekt som ritar en byggritning",
  },
  {
    src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
    alt: "Modernt hus med stora fönster",
  },
];

export function TopHero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-20 pb-16 sm:pt-28">
      <span className="inline-block border border-foreground/30 px-3 py-1 text-xs font-medium">
        Fungerar i hela Sverige
      </span>
      <h1 className="mt-8 max-w-4xl text-5xl leading-[1.05] font-medium tracking-tight text-accent sm:text-7xl lg:text-8xl">
        Bygglov, hanterat från start till mål
      </h1>
      <p className="mt-6 max-w-md text-lg text-foreground/70">
        Vad du får bygga, vad som krävs, och snabbaste vägen till godkännande
        – från en AI som faktiskt sätter sig in i ditt ärende, inte ett
        formulär.
      </p>

      <div className="mt-14 flex items-end gap-2 sm:gap-3">
        {HERO_IMAGES.map((image, i) => (
          <div
            key={image.src}
            className={`relative flex-1 overflow-hidden bg-muted ${
              i % 2 === 0 ? "aspect-[3/4]" : "aspect-[3/5]"
            }`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="20vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
