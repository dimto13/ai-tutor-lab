import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, MessageCircle, Send, User } from "lucide-react";
import { findGlossaryConcept } from "@/lib/glossary";
import { answerDeterministically } from "@/tutor/deterministicTutor";
import { useTutorContext } from "@/tutor/tutorContext";
import { FeedbackCapture } from "@/components/feedback/FeedbackCapture";

interface Message {
  role: "tutor" | "user";
  text: string;
}

const SUGGESTIONS = [
  "Was soll ich jetzt machen?",
  "Warum mache ich das?",
  "Was ist ein Workspace?",
  "Unterschied Git und GitHub?",
];

export function TutorChat({ prominent = false }: { prominent?: boolean }) {
  const tutorContext = useTutorContext();
  const { mode } = tutorContext;
  const [open, setOpen] = useState(() => mode !== "guided");
  const [messages, setMessages] = useState<Message[]>(() =>
    mode === "challenge"
      ? []
      : [
          {
            role: "tutor",
            text: "Ich kenne dein aktuelles Modul und den Trainingskontext. Du kannst jederzeit eine konkrete Frage stellen.",
          },
        ],
  );
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(mode !== "guided");
  }, [mode, tutorContext.scenarioId]);

  useEffect(() => {
    if (!open) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages, open]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question) return;
    const answer = answerDeterministically(question, tutorContext, findGlossaryConcept);
    setInput("");
    setMessages((messages) => [
      ...messages,
      { role: "user", text: question },
      { role: "tutor", text: answer },
    ]);
  };

  if (!open) {
    return (
      <div
        data-platform-ui="tutor-chat"
        data-testid="tutor-chat-collapsed"
        data-tutor-prominent={prominent ? "true" : "false"}
        className={`platform-ui shrink-0 border-t p-2.5 ${
          prominent ? "border-warning/60 bg-warning/10" : "border-border bg-background"
        }`}
      >
        <button
          type="button"
          data-testid="tutor-chat-toggle"
          aria-expanded="false"
          aria-controls="tutor-chat-panel"
          onClick={() => setOpen(true)}
          className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium text-foreground transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            prominent
              ? "border-warning/60 bg-card hover:bg-muted"
              : "border-border bg-card/70 hover:border-ring hover:bg-card"
          }`}
        >
          <MessageCircle
            className={`h-4 w-4 shrink-0 ${prominent ? "text-warning" : "text-accent"}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block">Tutor fragen</span>
            {prominent ? (
              <span className="block text-[10px] font-normal text-muted-foreground">
                Zusätzliche Hilfe ist für diesen Schritt verfügbar.
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      id="tutor-chat-panel"
      data-platform-ui="tutor-chat"
      data-testid="tutor-chat-expanded"
      className="platform-ui flex max-h-[46%] min-h-[250px] flex-col border-t border-border"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Bot className="h-4 w-4 text-accent" aria-hidden="true" /> KI-Tutor
        <div className="ml-auto flex items-center gap-2">
          {mode === "challenge" ? (
            <span className="normal-case font-normal tracking-normal">nur auf Anfrage</span>
          ) : null}
          <FeedbackCapture source="tutor" compact />
          {mode === "guided" ? (
            <button
              type="button"
              aria-label="Tutor schließen"
              aria-expanded="true"
              aria-controls="tutor-chat-panel"
              onClick={() => setOpen(false)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium normal-case tracking-normal text-foreground transition-colors hover:border-ring hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Einklappen
            </button>
          ) : null}
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.length === 0 ? (
          <p className="py-3 text-[12px] leading-relaxed text-muted-foreground">
            In der Challenge gibt der Tutor keine automatische Hilfestellung. Stelle eine Frage,
            wenn du Unterstützung möchtest.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div key={index} className="flex gap-2">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                message.role === "tutor" ? "bg-accent/15 text-accent" : "bg-muted text-foreground"
              }`}
            >
              {message.role === "tutor" ? (
                <Bot className="h-3.5 w-3.5" />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            <p
              className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                message.role === "tutor"
                  ? "bg-card text-foreground"
                  : "bg-accent/10 text-foreground"
              }`}
            >
              {message.text}
            </p>
          </div>
        ))}
      </div>
      {mode !== "challenge" ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => send(suggestion)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground motion-reduce:transition-none"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send(input)}
          placeholder="Frage an den Tutor…"
          className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-[13px] text-foreground outline-none focus:border-ring"
        />
        <button
          onClick={() => send(input)}
          aria-label="Senden"
          className="rounded-md bg-accent px-2.5 py-2 text-accent-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
