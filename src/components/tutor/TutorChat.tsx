import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import { findGlossaryConcept } from "@/lib/glossary";

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

export function TutorChat() {
  const { scenario, mode, progress, isFinished } = useTraining();
  const step = scenario.steps.find((s) => s.id === progress.activeStepId) ?? scenario.steps[0];
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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const answerFor = (question: string): string => {
    const completed = scenario.steps.filter((s) => progress.statuses[s.id] === "COMPLETED").length;

    if (/was soll ich|wie weiter|nächste|weiter\?|jetzt machen|hänge/i.test(question)) {
      if (isFinished) return "Du hast das Modul abgeschlossen.";
      if (mode === "explore") return "Erkunde die Oberfläche frei. Klicke auf einen Bereich, den du noch nicht untersucht hast; die Erklärung erscheint im Guide.";
      if (!step) return "Für dieses Modul ist aktuell keine weitere Aufgabe offen.";
      return mode === "challenge" ? step.instruction : `${step.instruction} ${step.helpLevels[0]}`;
    }

    if (/warum/i.test(question)) {
      return step ? step.why : "Für dieses Modul ist aktuell keine weitere Aufgabe offen.";
    }

    if (/wo bin ich|fortschritt|status/i.test(question)) {
      if (mode === "explore") {
        return `Du bist in "${scenario.title}" und hast ${progress.exploredTargets.length} Oberflächenbereiche untersucht.`;
      }
      return `Du bist in "${scenario.title}"${step ? ` bei "${step.title}"` : " und hast das Modul abgeschlossen"}. ${completed} Schritte sind abgeschlossen.`;
    }

    const concept = findGlossaryConcept(question);
    if (concept) {
      const wantsDepth = /genau|detail|technisch|vertief|tiefer|ausführ/i.test(question);
      return wantsDepth ? `${concept.simple} ${concept.advanced}` : concept.simple;
    }

    return step
      ? `Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition. Bezogen auf die aktuelle Aufgabe: ${step.instruction}`
      : "Dazu gibt es im zentralen Begriffskatalog keine vorbereitete Definition.";
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setTimeout(() => setMessages((m) => [...m, { role: "tutor", text: answerFor(question) }]), 250);
  };

  return (
    <div className="flex max-h-[46%] min-h-[250px] flex-col border-t border-border">
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Bot className="h-4 w-4 text-accent" /> KI-Tutor
        {mode === "challenge" ? <span className="ml-auto normal-case font-normal">nur auf Anfrage</span> : null}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.length === 0 ? (
          <p className="py-3 text-[12px] leading-relaxed text-muted-foreground">
            In der Challenge gibt der Tutor keine automatische Hilfestellung. Stelle eine Frage, wenn du Unterstützung möchtest.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className="flex gap-2">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                m.role === "tutor" ? "bg-accent/15 text-accent" : "bg-white/10 text-foreground"
              }`}
            >
              {m.role === "tutor" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>
            <p
              className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                m.role === "tutor" ? "bg-card text-foreground" : "bg-accent/10 text-foreground"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
      {mode !== "challenge" ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Frage an den Tutor…"
          className="flex-1 rounded-md border border-border bg-editor px-3 py-2 text-[13px] text-foreground outline-none focus:border-ring"
        />
        <button
          onClick={() => send(input)}
          aria-label="Senden"
          className="rounded-md bg-accent px-2.5 py-2 text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
