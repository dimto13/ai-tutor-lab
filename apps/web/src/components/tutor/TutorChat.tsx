import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, MessageCircle, Send, User, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { findGlossaryConcept } from "@/lib/glossary";
import { getRuntimeTargetLabel } from "@/runtime/referenceCatalog";
import { requestTutorAttention } from "@/components/overlay/tutorAttention";
import { persistBetaFeedback, retryBetaFeedback } from "@/lib/betaFeedbackSubmission";
import {
  acknowledgeFeedbackNotice,
  hasAcknowledgedFeedbackNotice,
  type FeedbackRecord,
} from "@/lib/feedbackStore";
import {
  replyDeterministically,
  type TutorFeedbackOffer,
  type TutorReply,
} from "@/tutor/deterministicTutor";
import { askTutorLlm } from "@/tutor/llm/tutorLlm.functions";
import { TUTOR_HISTORY_MAX_TURNS, type TutorConversationTurn } from "@/tutor/llm/tutorGuardrails";
import { preferServerTutor } from "@/tutor/serverTutorAnswer";
import { useTutorContext } from "@/tutor/tutorContext";
import { FeedbackCapture } from "@/components/feedback/FeedbackCapture";
import { useFeedbackContext, viewportClass } from "@/components/feedback/useFeedbackContext";

type OfferDelivery = { status: "sending" } | { status: "failed"; record: FeedbackRecord | null };

interface ChatOffer extends TutorFeedbackOffer {
  /** The learner's own message, which is sent as it is or opens as the dialog draft. */
  sourceText: string;
  sourceId: number;
  resolved: boolean;
  /** Direct delivery from the chat, so the learner never has to describe the problem again. */
  delivery?: OfferDelivery;
}

interface Message {
  id: number;
  role: "tutor" | "user";
  text: string;
  /** Greetings and the tutor's own offers are not part of the conversation the model sees. */
  inHistory: boolean;
  offer?: ChatOffer;
}

const GREETING =
  "Ich kenne dein aktuelles Modul und den Trainingskontext. Du kannst jederzeit eine konkrete Frage stellen.";

const OFFER_LABELS: Record<
  TutorFeedbackOffer["kind"],
  { send: string; clarifiedSend: string; answer: string }
> = {
  problem: {
    send: "Ja, an das Team senden",
    clarifiedSend: "Als Problem melden",
    answer: "Nein, ich brauche Hilfe zur Aufgabe",
  },
  ux: {
    send: "Feedback senden",
    clarifiedSend: "Feedback senden",
    answer: "Nein, das war eine Frage",
  },
  improvement: {
    send: "Vorschlag senden",
    clarifiedSend: "Als Vorschlag melden",
    answer: "Nein, das war eine Frage",
  },
  general: {
    send: "Feedback senden",
    clarifiedSend: "Feedback senden",
    answer: "Nein, das war eine Frage",
  },
};

function conversationHistory(messages: Message[]): TutorConversationTurn[] {
  return messages
    .filter((message) => message.inHistory)
    .slice(-TUTOR_HISTORY_MAX_TURNS)
    .map((message) => ({ role: message.role, text: message.text.slice(0, 2_000) }));
}

const SUGGESTIONS = [
  "Was soll ich jetzt machen?",
  "Warum mache ich das?",
  "Was ist ein Workspace?",
  "Unterschied Git und GitHub?",
];

export function TutorChat({ prominent = false }: { prominent?: boolean }) {
  const auth = useAuth();
  const { t } = useLanguage();
  const tutorContext = useTutorContext();
  const feedbackContext = useFeedbackContext("tutor");
  const { mode } = tutorContext;
  const [open, setOpen] = useState(() => mode !== "guided");
  const [messages, setMessages] = useState<Message[]>(() =>
    mode === "challenge" ? [] : [{ id: 0, role: "tutor", text: GREETING, inHistory: false }],
  );
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(hasAcknowledgedFeedbackNotice);
  const listRef = useRef<HTMLDivElement>(null);
  const collapsedToggleRef = useRef<HTMLButtonElement>(null);
  const restoreToggleFocusRef = useRef(false);
  const nextMessageIdRef = useRef(1);
  const nextMessageId = () => nextMessageIdRef.current++;

  useEffect(() => {
    setOpen(mode !== "guided");
    restoreToggleFocusRef.current = false;
  }, [mode, tutorContext.scenario.id]);

  useEffect(() => {
    if (!open && restoreToggleFocusRef.current) {
      restoreToggleFocusRef.current = false;
      collapsedToggleRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages, open]);

  const closePanel = () => {
    restoreToggleFocusRef.current = true;
    setOpen(false);
  };

  const appendTutorMessage = (text: string, offer?: ChatOffer, inHistory = !offer) => {
    const id = nextMessageId();
    setMessages((messages) => [
      ...messages,
      { id, role: "tutor", text, inHistory, ...(offer ? { offer } : {}) },
    ]);
  };

  /** Only answered messages reach the model, so a report does not use up the history (#576). */
  const setInHistory = (messageId: number, inHistory: boolean) => {
    setMessages((messages) =>
      messages.map((message) => (message.id === messageId ? { ...message, inHistory } : message)),
    );
  };

  const patchOffer = (messageId: number, patch: Partial<ChatOffer>) => {
    setMessages((messages) =>
      messages.map((message) =>
        message.id === messageId && message.offer
          ? { ...message, offer: { ...message.offer, ...patch } }
          : message,
      ),
    );
  };

  const resolveOffer = (messageId: number) => patchOffer(messageId, { resolved: true });

  /** Asks the server tutor, falling back to the deterministic reply whenever it is unavailable. */
  const answer = async (
    question: string,
    sourceId: number,
    fallback: TutorReply,
    history: TutorConversationTurn[],
    allowFeedback: boolean,
  ) => {
    setPending(true);
    try {
      let text = fallback.text;
      // Without a model answer, the deterministic reply keeps its own follow-up offer.
      let offer: TutorFeedbackOffer | undefined = fallback.fallbackOffer;
      const accessToken = auth.session?.accessToken ?? null;
      if (accessToken) {
        const serverAnswer = await preferServerTutor(fallback.text, () =>
          askTutorLlm({
            data: {
              scenarioId: tutorContext.scenario.id,
              mode: tutorContext.mode,
              currentStepId: tutorContext.currentStep?.id ?? null,
              question,
              accessToken,
              ...(history.length > 0 ? { history } : {}),
            },
          }),
        );
        text = serverAnswer.answer;
        if (!serverAnswer.fallback) {
          offer =
            serverAnswer.kind === "feedback" ? { kind: "problem", clarify: false } : undefined;
        }
        if (serverAnswer.uiTargetRefs.length > 0) {
          requestTutorAttention(
            serverAnswer.uiTargetRefs,
            serverAnswer.uiTargetRefs.map((ref) => getRuntimeTargetLabel(ref) ?? ref).join(", "),
          );
        }
      }

      if (offer && allowFeedback) {
        setInHistory(sourceId, false);
        appendTutorMessage(text, { ...offer, sourceText: question, sourceId, resolved: false });
      } else {
        appendTutorMessage(text);
      }
    } finally {
      setPending(false);
    }
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    setInput("");
    const history = conversationHistory(messages);
    const sourceId = nextMessageId();
    const reply = replyDeterministically(question, tutorContext, findGlossaryConcept);
    // A new message moves on: older offers would otherwise answer an old message later.
    setMessages((messages) => [
      ...messages.map((message) =>
        message.offer && !message.offer.resolved
          ? { ...message, offer: { ...message.offer, resolved: true } }
          : message,
      ),
      { id: sourceId, role: "user", text: question, inHistory: !reply.offer },
    ]);

    if (reply.offer) {
      // A report or an ambiguous message needs no model call: the learner decides first (#147).
      appendTutorMessage(reply.text, {
        ...reply.offer,
        sourceText: question,
        sourceId,
        resolved: false,
      });
      return;
    }
    await answer(question, sourceId, reply, history, true);
  };

  /** The learner rejected the feedback reading, so the original message is answered as a question. */
  const answerInstead = async (message: Message) => {
    const offer = message.offer;
    if (!offer || pending) return;
    resolveOffer(message.id);
    setInHistory(offer.sourceId, true);
    const sourceIndex = messages.findIndex((candidate) => candidate.id === offer.sourceId);
    const history = conversationHistory(
      sourceIndex >= 0 ? messages.slice(0, sourceIndex) : messages,
    );
    const fallback = replyDeterministically(offer.sourceText, tutorContext, findGlossaryConcept, {
      intent: offer.kind === "problem" ? "next_step" : "question",
      confidence: "high",
    });
    await answer(offer.sourceText, offer.sourceId, fallback, history, false);
  };

  const reportSubmitted = (message: Message) => {
    resolveOffer(message.id);
    appendTutorMessage(
      "Danke! Deine Meldung ist beim Team angekommen. Dein Trainingsfortschritt bleibt unverändert.",
      undefined,
      false,
    );
  };

  /** Sends the learner's message as it is, with the structured training context (#147). */
  const sendReport = async (message: Message) => {
    const offer = message.offer;
    if (!offer || offer.resolved || offer.delivery?.status === "sending") return;
    const failedRecord = offer.delivery?.status === "failed" ? offer.delivery.record : null;
    patchOffer(message.id, { delivery: { status: "sending" } });
    const result = failedRecord
      ? await retryBetaFeedback(failedRecord)
      : await persistBetaFeedback(
          "tutor",
          offer.sourceText,
          {
            ...feedbackContext,
            runtime: { ...feedbackContext.runtime, viewportClass: viewportClass() },
          },
          { kind: offer.kind },
        );
    if (!result.ok) {
      patchOffer(message.id, { delivery: { status: "failed", record: result.record } });
      return;
    }
    acknowledgeFeedbackNotice();
    setNoticeAcknowledged(true);
    reportSubmitted(message);
  };

  // An open offer becomes the draft of the header shortcut, so that path needs no retyping either.
  const openOfferMessage = [...messages]
    .reverse()
    .find((message) => message.offer && !message.offer.resolved);
  const problemShortcut = (
    <FeedbackCapture
      source="tutor"
      triggerLabel="Ich habe ein Problem"
      compact
      flow="problem"
      {...(openOfferMessage?.offer
        ? {
            initialText: openOfferMessage.offer.sourceText,
            onSubmitted: () => reportSubmitted(openOfferMessage),
          }
        : {})}
    />
  );

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
        <div className="flex min-w-0 items-center gap-2">
          <button
            ref={collapsedToggleRef}
            type="button"
            data-testid="tutor-chat-toggle"
            aria-label="Tutor fragen"
            aria-expanded="false"
            aria-controls="tutor-chat-panel"
            aria-describedby={prominent ? "tutor-chat-help-hint" : undefined}
            onClick={() => setOpen(true)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium text-foreground transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                <span
                  id="tutor-chat-help-hint"
                  className="block text-[10px] font-normal text-muted-foreground"
                >
                  Zusätzliche Hilfe ist für diesen Schritt verfügbar.
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          {problemShortcut}
        </div>
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
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
          <Bot className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> KI-Tutor
        </span>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {mode === "challenge" ? (
            <span className="shrink-0 whitespace-nowrap normal-case font-normal tracking-normal">
              nur auf Anfrage
            </span>
          ) : null}
          <span className="shrink-0 whitespace-nowrap">{problemShortcut}</span>
          <button
            type="button"
            data-testid="tutor-chat-close"
            aria-label="Tutor schließen"
            aria-expanded="true"
            aria-controls="tutor-chat-panel"
            onClick={closePanel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:border-ring hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={listRef}
        role="region"
        aria-label={t("tutorHistory")}
        tabIndex={0}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {messages.length === 0 ? (
          <p className="py-3 text-[12px] leading-relaxed text-muted-foreground">
            In der Challenge gibt der Tutor keine automatische Hilfestellung. Stelle eine Frage,
            wenn du Unterstützung möchtest.
          </p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className="flex gap-2">
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
            <div className="min-w-0">
              <p
                data-feedback-redact={message.role === "user" ? "true" : undefined}
                className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                  message.role === "tutor"
                    ? "bg-card text-foreground"
                    : "bg-accent/10 text-foreground"
                }`}
              >
                {message.text}
              </p>
              {message.offer && !message.offer.resolved ? (
                <TutorOfferActions
                  offer={message.offer}
                  disabled={pending}
                  noticeAcknowledged={noticeAcknowledged}
                  onSend={() => void sendReport(message)}
                  onAnswer={() => void answerInstead(message)}
                  onSubmitted={() => reportSubmitted(message)}
                />
              ) : null}
            </div>
          </div>
        ))}
        {pending ? (
          <p role="status" className="text-[12px] text-muted-foreground">
            Tutor verarbeitet die Frage…
          </p>
        ) : null}
      </div>
      {mode !== "challenge" ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={pending}
              onClick={() => void send(suggestion)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          disabled={pending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send(input);
          }}
          placeholder="Frage an den Tutor…"
          className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-[13px] text-foreground outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => void send(input)}
          aria-label="Senden"
          className="rounded-md bg-accent px-2.5 py-2 text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TutorOfferActions({
  offer,
  disabled,
  noticeAcknowledged,
  onSend,
  onAnswer,
  onSubmitted,
}: {
  offer: ChatOffer;
  disabled: boolean;
  noticeAcknowledged: boolean;
  onSend: () => void;
  onAnswer: () => void;
  onSubmitted: () => void;
}) {
  const labels = OFFER_LABELS[offer.kind];
  const sending = offer.delivery?.status === "sending";
  const failed = offer.delivery?.status === "failed";
  const sendButton = (
    <button
      type="button"
      disabled={disabled || sending}
      onClick={onSend}
      className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {sending
        ? "Wird gesendet …"
        : failed
          ? "Erneut senden"
          : offer.clarify
            ? labels.clarifiedSend
            : labels.send}
    </button>
  );
  // Hidden while sending, so the same report cannot go out twice.
  const edit = sending ? null : (
    <FeedbackCapture
      source="tutor"
      flow={offer.kind === "general" ? "general" : "problem"}
      triggerLabel="Vorher bearbeiten"
      compact
      initialText={offer.sourceText}
      initialKind={offer.kind}
      onSubmitted={onSubmitted}
    />
  );
  const answerButton = (
    <button
      type="button"
      disabled={disabled || sending}
      onClick={onAnswer}
      className="inline-flex items-center rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {offer.clarify
        ? offer.kind === "problem"
          ? "Hilfe zur Aufgabe"
          : "Frage beantworten"
        : labels.answer}
    </button>
  );
  return (
    <div data-testid="tutor-feedback-offer" className="mt-1.5">
      <div className="flex flex-wrap gap-1.5">
        {offer.clarify ? (
          <>
            {answerButton}
            {sendButton}
            {edit}
          </>
        ) : (
          <>
            {sendButton}
            {edit}
            {answerButton}
          </>
        )}
      </div>
      {failed ? (
        <p role="alert" className="mt-1.5 text-[11px] leading-relaxed text-warning">
          Deine Meldung ist lokal gesichert, konnte aber noch nicht an das Team gesendet werden.
          Versuche es bitte erneut.
        </p>
      ) : null}
      {!noticeAcknowledged ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Gesendet werden deine Nachricht und der Trainingskontext (Szenario, Schritt, Modus) an die
          geschützte Beta-Inbox. Bitte keine personenbezogenen oder vertraulichen Inhalte.
        </p>
      ) : null}
    </div>
  );
}
