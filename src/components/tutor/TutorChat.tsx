import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";
import { useTraining } from "@/state/trainingStore";

interface Message {
  role: "tutor" | "user";
  text: string;
}

const KNOWLEDGE: { match: RegExp; answer: string }[] = [
  {
    match: /repository|repo\b/i,
    answer:
      "Ein Repository ist ein Projektordner, dessen Änderungen Git vollständig aufzeichnet. Du kannst jederzeit sehen, wer was wann geändert hat, und zu älteren Zuständen zurückkehren.",
  },
  {
    match: /git add|vormerk|staging|stage/i,
    answer:
      "git add merkt Änderungen für den nächsten Commit vor (Staging). So entscheidest du bewusst, welche Dateien in einen Speicherpunkt gehören – und welche noch nicht.",
  },
  {
    match: /unterschied.*(git|github)|git.*github/i,
    answer:
      "Git ist das Versionsverwaltungs-Werkzeug auf deinem Rechner. GitHub ist eine Plattform, die Git-Repositories online hostet und Zusammenarbeit ergänzt (Pull Requests, Reviews, Automatisierung).",
  },
  {
    match: /copilot/i,
    answer:
      "GitHub Copilot schlägt Code aus deiner Beschreibung in natürlicher Sprache vor. Du bleibst verantwortlich: Vorschlag lesen, prüfen, anpassen. In diesem POC ist Copilot simuliert.",
  },
  {
    match: /commit/i,
    answer:
      "Ein Commit ist ein benannter Speicherpunkt der vorgemerkten Änderungen. Die Nachricht nach -m beschreibt kurz, was geändert wurde.",
  },
  {
    match: /terminal|shell|kommandozeile/i,
    answer:
      "Das Terminal führt Textbefehle aus. Sehr viele Entwickler-Werkzeuge – darunter Git – werden dort gesteuert, weil das schnell und automatisierbar ist.",
  },
  {
    match: /python|print/i,
    answer:
      'print(...) gibt Text aus. print("Hello AI Training") schreibt also genau diesen Satz in die Ausgabe – ein einfacher Test, dass alles funktioniert.',
  },
];

const SUGGESTIONS = [
  "Was soll ich jetzt machen?",
  "Warum mache ich das?",
  "Was ist ein Repository?",
  "Unterschied Git und GitHub?",
];

export function TutorChat() {
  const { scenario, progress, isFinished } = useTraining();
  const step = scenario.steps.find((s) => s.id === progress.activeStepId);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "tutor",
      text: "Hallo! Ich bin dein KI-Tutor. Ich kenne dein aktuelles Modul und deinen Schritt – frag mich jederzeit.",
    },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const answerFor = (question: string): string => {
    const completed = scenario.steps.filter((s) => progress.statuses[s.id] === "COMPLETED").length;
    if (/was soll ich|wie weiter|nächste|weiter\?|jetzt machen|hänge/i.test(question)) {
      if (isFinished || !step)
        return "Du hast alle Schritte abgeschlossen – das Modul ist fertig. 🎉";
      return `${step.instruction} ${step.helpLevels[0]}`;
    }
    if (/warum/i.test(question)) {
      return step
        ? step.why
        : "Du hast das Modul abgeschlossen – es gibt keinen offenen Schritt mehr.";
    }
    if (/wo bin ich|fortschritt|status/i.test(question)) {
      return `Du bist in "${scenario.title}", Schritt ${completed + (step ? 1 : 0)} von ${scenario.steps.length}${
        step ? `: ${step.title}` : " – abgeschlossen"
      }.`;
    }
    const hit = KNOWLEDGE.find((k) => k.match.test(question));
    if (hit) return hit.answer;
    return step
      ? `Dazu habe ich im POC keine vorbereitete Antwort. Bezogen auf deinen aktuellen Schritt "${step.title}": ${step.instruction}`
      : "Dazu habe ich im POC keine vorbereitete Antwort.";
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setTimeout(() => setMessages((m) => [...m, { role: "tutor", text: answerFor(question) }]), 350);
  };

  return (
    <div className="flex max-h-[46%] min-h-[280px] flex-col border-t border-border">
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Bot className="h-4 w-4 text-accent" /> KI-Tutor
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.map((m, i) => (
          <div key={i} className="flex gap-2">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                m.role === "tutor" ? "bg-accent/15 text-accent" : "bg-white/10 text-foreground"
              }`}
            >
              {m.role === "tutor" ? (
                <Bot className="h-3.5 w-3.5" />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
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
