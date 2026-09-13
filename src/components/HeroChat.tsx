"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseAssistantMessage, VERDICT_LABEL, VERDICT_STYLE } from "@/lib/verdict";
import { savePendingAssessment } from "@/lib/pending-assessment";
import { ArrowUpIcon } from "@/components/icons";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function HeroChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const latestAssessment = (() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return undefined;
    return parseAssistantMessage(lastAssistant.content);
  })();
  const latestVerdict = latestAssessment?.verdict;

  function handleContinueToAccount() {
    if (!latestVerdict) return;
    const description = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");
    savePendingAssessment({
      description,
      verdict: latestVerdict,
      summary: latestAssessment?.summary,
    });
  }

  async function submitConversation(nextMessages: Message[]) {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Något gick fel.");
        return;
      }

      setMessages([...nextMessages, { role: "assistant", content: data.message }]);
    } catch {
      setError("Kunde inte nå servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setIsLoading(false);
    }
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    submitConversation(nextMessages);
  }

  function reset() {
    setMessages([]);
    setInput("");
    setError(null);
  }

  const inputRow = (
    <form
      onSubmit={sendMessage}
      className="mx-auto flex w-full max-w-3xl items-stretch border border-foreground/30 bg-background transition-colors focus-within:border-foreground"
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={started ? "Skriv ditt svar här…" : "Beskriv ditt byggprojekt…"}
        disabled={isLoading}
        autoFocus
        className="flex-1 bg-transparent px-5 py-4 text-base outline-none disabled:opacity-50 sm:text-lg"
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        aria-label="Skicka"
        className="flex shrink-0 items-center justify-center bg-accent px-6 text-accent-foreground transition-colors hover:bg-foreground disabled:opacity-30"
      >
        <ArrowUpIcon className="h-5 w-5" />
      </button>
    </form>
  );

  if (!started) {
    return (
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl font-medium tracking-tight text-balance sm:text-5xl">
          Vad vill du bygga?
        </h2>
        <div className="mx-auto mt-10 w-full">{inputRow}</div>
        <p className="mt-4 text-sm text-foreground/50">
          Gratis och utan konto att komma igång med.
        </p>
      </section>
    );
  }

  // Once the conversation starts, the section fills at least the full
  // viewport height (min-h-screen) so the chat reads as a fullscreen view
  // rather than a small box floating above empty page space - the message
  // list scrolls internally (flex-1 overflow-y-auto) while the input stays
  // pinned to the bottom of that viewport-height column.
  return (
    <section className="flex min-h-screen w-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6">
        <div className="flex items-center justify-between pt-6">
          <button
            type="button"
            onClick={reset}
            className="text-sm text-foreground/50 hover:text-foreground/80"
          >
            ← Ny fråga
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-6">
          {messages.map((message, i) => {
            const parsed =
              message.role === "assistant"
                ? parseAssistantMessage(message.content)
                : { text: message.content };

            return (
              <div
                key={i}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {parsed.text}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-muted px-4 py-3 text-sm text-foreground/50">
                Eivor tänker…
              </div>
            </div>
          )}

          {error && (
            <p className="border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div ref={scrollRef} />
        </div>

        {latestVerdict && (
          <div
            className={`mb-4 border px-4 py-3 text-sm font-medium ${VERDICT_STYLE[latestVerdict]}`}
          >
            {VERDICT_LABEL[latestVerdict]}
            {latestVerdict === "kräver_bygglov" && (
              <div className="mt-3">
                <Link
                  href="/konto"
                  onClick={handleContinueToAccount}
                  className="inline-flex items-center gap-1 bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-foreground"
                >
                  Skapa konto och gå vidare →
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="pb-6">{inputRow}</div>
      </div>
    </section>
  );
}
