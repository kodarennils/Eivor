"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseAssistantMessage, VERDICT_LABEL, VERDICT_STYLE } from "@/lib/verdict";
import { savePendingAssessment } from "@/lib/pending-assessment";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const GREETING: Message[] = [
  {
    role: "assistant",
    content:
      "Hej! Jag är Eivor. Berätta kort vad du vill bygga eller ändra, så hjälper jag dig ta reda på om det troligen kräver bygglov.",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(GREETING);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const latestAssessment = (() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground/80">
          ← Tillbaka
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Beskriv ditt byggprojekt</h1>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto">
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
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
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
            <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground/50">
              Eivor tänker…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div ref={scrollRef} />
      </div>

      {latestVerdict && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${VERDICT_STYLE[latestVerdict]}`}
        >
          {VERDICT_LABEL[latestVerdict]}
          {latestVerdict === "kräver_bygglov" && (
            <div className="mt-3">
              <Link
                href="/konto"
                onClick={handleContinueToAccount}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                Skapa konto och gå vidare →
              </Link>
            </div>
          )}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv ditt svar här…"
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          Skicka
        </button>
      </form>
    </main>
  );
}
