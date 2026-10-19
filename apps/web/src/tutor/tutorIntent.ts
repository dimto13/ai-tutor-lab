import { findPlatformTopic, type PlatformTopic } from "./platformKnowledge.ts";
import { normalizeTutorText, wholeWords } from "./tutorText.ts";

/**
 * What a learner wants from the tutor (#147). The tutor decides this before it answers, so a
 * platform problem never falls into a glossary answer (#548).
 */
export type TutorIntent =
  | "next_step"
  | "rationale"
  | "progress"
  | "definition"
  | "platform"
  | "problem_report"
  | "feature_request"
  | "feedback"
  | "smalltalk"
  | "question"
  | "unclear";

/** Intents the tutor offers to record as feedback instead of answering them as a learning question. */
export type TutorFeedbackIntent = "problem_report" | "feature_request" | "feedback";

export interface TutorIntentDecision {
  intent: TutorIntent;
  /** "low" never acts on a guess: the tutor asks back instead (#147). */
  confidence: "high" | "low";
  /** For "unclear": the feedback reading the message also allows. */
  feedbackCandidate?: TutorFeedbackIntent;
  /** For "feedback": whether the message criticises the usability. */
  usability?: boolean;
  /** For "definition": the term the learner asks about. */
  subject?: string;
  /** For "platform": the matching entry of the platform knowledge. */
  platformTopic?: PlatformTopic;
}

export interface TutorIntentOptions {
  /** Whether the whole message is a known glossary term, such as a bare "Workspace". */
  isKnownTerm?: (text: string) => boolean;
}

interface Signal {
  matcher: RegExp;
  weight: 1 | 2;
}

const signals = (weight: 1 | 2, sources: string[]): Signal[] =>
  sources.map((source) => ({ matcher: wholeWords(source), weight }));

const PROBLEM_SIGNALS = [
  ...signals(2, [
    "funktioniert (?:\\S+ ){0,3}nicht",
    "(?:geht|klappt) (?:\\S+ ){0,2}nicht",
    "bugs?",
    "fehlerhaft",
    "kaputt",
    "abgestürzt",
    "stürzt (?:\\S+ )?ab",
    "absturz",
    "friert (?:\\S+ )?ein",
    "eingefroren",
    "hängt sich (?:\\S+ )?auf",
    "(?:seite|app|plattform|simulator|anzeige|bildschirm|fenster|editor|terminal|button|knopf|eingabe) hängt",
    "lädt (?:\\S+ ){0,2}nicht",
    "reagiert (?:\\S+ ){0,2}nicht",
    "(?:wird|werden|wurde|wurden) (?:\\S+ ){0,3}nicht (?:\\S+ ){0,2}(?:angezeigt|gespeichert|erkannt|übernommen|akzeptiert|angenommen|gezählt|gewertet)",
    "(?:falsch|nicht richtig|nicht korrekt) (?:\\S+ ){0,2}(?:angezeigt|gewertet|bewertet|erkannt|deklariert|markiert|eingestuft)",
    "als (?:falsch|nicht richtig|nicht korrekt|fehlerhaft|fehler)",
    "zählt (?:\\S+ )?nicht",
    "obwohl ich",
    "(?:muss|müsste|sollte|soll|müsst) (?:\\S+ ){0,4}(?:korrigiert|repariert|behoben|gefixt|geändert) werden",
    "nichts passiert",
    "passiert (?:\\S+ )?nichts",
    "verschwunden",
    "(?:weiße|leere|schwarze) seite",
    "sinnfrei",
    "sinnlos",
    "unlogisch",
    "katastrophe",
    "ärgerlich",
    "nervt",
    "nervig",
    "das ist (?:doch )?falsch",
    "stimmt (?:doch |hier |da )?nicht",
    "ich habe ein problem",
    "fehler in der plattform",
    "versteh(?:t|st) mich (?:\\S+ ){0,2}nicht",
    "unfair",
    "(?:genauso|genau so|so) gemacht wie (?:\\S+ ){0,2}(?:beschrieben|verlangt|gefordert|angegeben|erklärt)",
    "(?:alles|es|das|die aufgabe) (?:\\S+ ){0,2}richtig gemacht",
  ]),
  ...signals(1, ["seltsam", "komisch", "merkwürdig", "fehler", "problem", "falsch", "irgendwie"]),
];

const FEATURE_SIGNALS = [
  ...signals(2, [
    "(?:es )?wäre (?:\\S+ ){0,2}(?:gut|schön|toll|super|hilfreich|praktisch|besser|cool|klasse|sinnvoll|prima|genial)",
    "würde mir (?:\\S+ ){0,2}wünschen",
    "ich wünsche mir",
    "wünschenswert",
    "(?:ich hätte|hätte ich) (?:\\S+ )?gerne?",
    "fänd(?:e)? (?:es |ich )?(?:\\S+ )?(?:gut|schön|toll|besser|hilfreich|sinnvoll)",
    "verbesserungsvorschlag",
    "(?:mein|ein) (?:vorschlag|wunsch)",
    "ich schlage vor",
    "könnt(?:et)? ihr",
    "bitte (?:\\S+ ){0,3}(?:ergänzen|einbauen|hinzufügen|ermöglichen|anbieten)",
    "warum gibt es (?:hier )?(?:kein|keine|keinen)",
    "es fehlt (?:\\S+ ){0,3}(?:funktion|möglichkeit|option|button|knopf|erklärung|übersicht)",
    "man sollte (?:\\S+ ){0,3}(?:können|einbauen|ergänzen|anbieten)",
    "wäre es möglich",
    "schade dass",
    "könnte man (?:\\S+ ){0,5}(?:machen|einbauen|ergänzen|hinzufügen|anbieten|zeigen|haben)",
  ]),
  ...signals(1, ["man könnte", "fehlt"]),
];

const USABILITY_FEEDBACK = [
  "verwirrend",
  "unübersichtlich",
  "unverständlich",
  "nicht verständlich",
  "schwer zu verstehen",
  "zu viel text",
  "unklar formuliert",
  "(?:aufgabe|erklärung|anleitung|beschreibung|anweisung|übung|text) (?:ist|war) (?:\\S+ )?unklar",
  "überfordert",
  "zu (?:klein|groß)",
];

const FEEDBACK_SIGNALS = [
  ...signals(2, [
    "gefällt mir",
    "macht (?:\\S+ )?spaß",
    "(?:super|gut|toll|klasse|prima) gemacht",
    "großartig",
    "genial",
    "gelungen",
    "langweilig",
    "zu (?:schwer|schwierig|leicht|einfach|lang|kurz|viel|schnell|langsam)",
    "hat mir (?:\\S+ ){0,2}geholfen",
    "hilft mir (?:\\S+ ){0,2}nicht",
    "bringt mir (?:\\S+ )?nichts",
    "bin begeistert",
    "(?:gut|toll|super|klasse|prima|verständlich|schön|schlecht|kompliziert) erklärt",
    ...USABILITY_FEEDBACK,
  ]),
  ...signals(1, [
    "gut",
    "toll",
    "super",
    "prima",
    "cool",
    "schön",
    "hilfreich",
    "schlecht",
    "klasse",
  ]),
];

const USABILITY_MATCHERS = USABILITY_FEEDBACK.map(wholeWords);

const STUCK = [
  "was soll ich",
  "wie (?:geht es |gehts )?weiter",
  "was (?:muss|kann|soll) ich (?:\\S+ ){0,3}(?:tun|machen)",
  "nächsten? schritt",
  "jetzt machen",
  "ich hänge",
  "hänge (?:\\S+ )?fest",
  "komme (?:\\S+ )?nicht (?:mehr )?weiter",
  "weiß nicht (?:mehr )?weiter",
  "weiss nicht weiter",
  "was ist (?:jetzt |hier )?(?:meine|die) (?:aktuelle |nächste )?aufgabe",
  "was ist zu tun",
  "brauche (?:\\S+ ){0,2}hilfe",
  "hilf mir",
  "was (?:jetzt|nun)",
].map(wholeWords);
const BARE_HELP = /^hilfe$/u;

// "Wieso ist das Highlight weg?" is no question about the purpose of the step.
const RATIONALE = [
  "(?:warum|wieso|weshalb|wozu) (?:\\S+ ){0,2}(?:mache|machen|muss|müssen|soll|sollen|sollte|tue|tun|brauche|lerne|übe|üben)",
  "(?:warum|wieso|weshalb|wozu) (?:ist|sind) (?:das|dieser schritt|diese aufgabe|es) (?:\\S+ )?(?:wichtig|nötig|notwendig|sinnvoll|gut)",
  "wozu (?:ist|dient) (?:das|dieser schritt|diese aufgabe)",
].map(wholeWords);
const BARE_WHY = /^(?:warum|wieso|weshalb|wozu)(?: das)?$/u;
const PROGRESS = wholeWords("wo bin ich|fortschritt|mein(?:en)? status|wie weit bin ich");

const SMALLTALK =
  /^(?:hallo|hi|hey|guten (?:morgen|tag|abend)|moin|servus|danke|dankeschön|danke schön|danke dir|vielen dank|merci|ok|okay|alles klar|verstanden|super danke|perfekt|passt|top|tschüss|bye|ciao)(?: (?:danke|dir|schön|sehr|vielmals|tutor))?$/u;
const THANKS = /^(?:danke|dankeschön|vielen dank|super danke|ok danke|okay danke)(?: |$)/u;

const QUESTION_START =
  /^(?:und |aber |also |ok |okay )?(?:was|wie|wo|wohin|woher|warum|wieso|weshalb|weswegen|welche[rsnm]?|wann|wer|wem|wen|wozu|womit|wofür|worin|worauf|kann|kannst|könnte|könntest|muss|musst|darf|soll|sollte|gibt|ist|sind|hat|habe|bedeutet|heißt|heisst|erkläre?|zeig(?:e)?|hilf|verstehe)(?: |$)/u;

const DEFINITION_PATTERNS = [
  /^(?:und |aber |also )?(?:was|wofür) (?:ist|sind|bedeutet|bedeuten|heißt|heisst|meint|macht) (?:eigentlich |denn |genau |nochmal )*(?:ein |eine |einen |der |die |das |den |dem |mit )?(.+)$/u,
  /^(?:und |aber |also )?was versteht man unter (?:einem |einer |einen |dem |der |den |die |das )?(.+)$/u,
  /^(?:bitte )?erklär(?:e)?(?: mir)?(?: bitte)?(?: kurz| nochmal| genauer)?(?: was)?(?: ein| eine| einen| der| die| das| den)? (.+)$/u,
  /^(?:was ist )?(?:der )?unterschied (?:zwischen )?(.+)$/u,
  /^definition (?:von )?(.+)$/u,
  /^ich verstehe (?:\S+ )?nicht was (?:ein |eine |einen |der |die |das )?(.+?) (?:ist|sind|bedeutet|bedeuten|heißt|heisst|macht)$/u,
];

const DEFINITION_TAIL =
  / (?:genau|eigentlich|technisch|im detail|ausführlich|tiefer|vertieft|genauer|nochmal|bitte|überhaupt|denn)$/u;

// Decision matrix for statements (#147). The phrase lists above miss everyday wording such as
// "bei speichern meiner punkte pass was nicht, das fenster ist sofort weg gewesen". The matrix
// reads two dimensions instead of whole sentences: whether something does not behave as expected
// (malfunction) and what it refers to (a platform surface, the simulated tool or nothing named).
// Questions keep the existing routing; the model decides those.
const NEGATION = "(?:nicht|nix|nichts|kein(?:e|en|er|em)?)";
const FUNCTION_VERB =
  "(?:sehen|sehe|siehst|sieht|sah|sichtbar|angezeigt|anzeigen|zeigt|gezeigt|speichert|gespeichert|gesichert|sichern|passt|pass|passen|stimmt|stimmen|geht|ging|klappt|klappte|lädt|laden|geladen|öffnet|geöffnet|reagiert|erkannt|erkennt|gezählt|zählt|abgehakt|übernommen|gewertet|geprüft|prüfen|funktioniert|funktionierte|erscheint|erschien|auftaucht|aufgetaucht)";
const NEGATED_FUNCTION = [
  `${NEGATION} (?:\\S+ ){0,4}${FUNCTION_VERB}`,
  `${FUNCTION_VERB} (?:\\S+ ){0,4}${NEGATION}`,
].map(wholeWords);
const DEFECT = wholeWords(
  "weg|verschwunden|verschwindet|verschwand|leer|kaputt|falsche[nmrs]?|eingefroren|abgestürzt|zurückgesetzt|(?:wieder|sofort|gleich|einfach) zu|wieder am anfang|von vorne?",
);
const PLATFORM_SURFACE = wholeWords(
  "fenster|übersicht|zusammenfassung|auswertung|abschluss\\w*|ergebnis\\w*|punkte?|punktestand|punktzahl|score|fortschritt|seite|anzeige|bildschirm|button|knopf|schaltfläche|dialog|popup|meldung|hinweis\\w*|highlight|markierung|overlay|tutor|guide|aufgabe|schritt|training|plattform|app|weiter|modul|kompetenzprofil|dashboard|haken",
);
const SIMULATED_TOOL = wholeWords(
  "terminal|explorer|editor|datei\\w*|ordner|befehl\\w*|commit|branch|copilot|claude|output|ausgabe|problems|menü|tab|panel|erweiterung\\w*|extension\\w*|repository|repo|tabelle|folie\\w*",
);

/**
 * 2: a malfunction of a platform surface, which is a report. 1: a malfunction of the simulated
 * tool or of nothing named, which the tutor asks back about. 0: no malfunction.
 */
function statementMalfunction(text: string): 0 | 1 | 2 {
  // "noch nicht gespeichert" describes progress, not a malfunction.
  const relevant = text.replace(/(?:^| )noch nicht(?= |$)/gu, " ");
  const malfunction =
    NEGATED_FUNCTION.some((matcher) => matcher.test(relevant)) || DEFECT.test(relevant);
  if (!malfunction) return 0;
  return PLATFORM_SURFACE.test(relevant) && !SIMULATED_TOOL.test(relevant) ? 2 : 1;
}

function score(text: string, list: Signal[]): number {
  return list.reduce((total, { matcher, weight }) => total + (matcher.test(text) ? weight : 0), 0);
}

function definitionSubject(text: string): string | null {
  for (const pattern of DEFINITION_PATTERNS) {
    const match = pattern.exec(text);
    let subject = match?.[1]?.trim();
    if (!subject) continue;
    while (DEFINITION_TAIL.test(subject)) subject = subject.replace(DEFINITION_TAIL, "").trim();
    if (subject) return subject;
  }
  return null;
}

function isQuestion(raw: string, text: string): boolean {
  return (
    raw.trim().endsWith("?") ||
    QUESTION_START.test(text) ||
    /verstehe (?:\S+ )?nicht/u.test(text) ||
    /^(?:mir ist (?:\S+ )?unklar|ich weiß nicht|ich weiss nicht|ich frage mich)(?: |$)/u.test(text)
  );
}

export function classifyTutorIntent(
  message: string,
  options: TutorIntentOptions = {},
): TutorIntentDecision {
  const text = normalizeTutorText(message);
  if (!text) return { intent: "unclear", confidence: "low" };
  if (SMALLTALK.test(text)) return { intent: "smalltalk", confidence: "high" };

  const words = text.split(" ").length;
  const question = isQuestion(message, text);
  const platformTopic = findPlatformTopic(message);
  const problem = Math.max(score(text, PROBLEM_SIGNALS), question ? 0 : statementMalfunction(text));
  const feature = score(text, FEATURE_SIGNALS);
  const feedback = score(text, FEEDBACK_SIGNALS);

  if (THANKS.test(text) && words <= 6 && !question && problem === 0) {
    return { intent: "smalltalk", confidence: "high" };
  }
  if ((BARE_HELP.test(text) || STUCK.some((matcher) => matcher.test(text))) && problem < 2) {
    return { intent: "next_step", confidence: "high" };
  }
  // "Wie melde ich einen Fehler?" or "Kann ich etwas kaputt machen?" ask about the platform; they
  // report nothing yet.
  if (
    question &&
    platformTopic &&
    (problem < 2 || platformTopic.id === "report" || platformTopic.id === "simulation")
  ) {
    return { intent: "platform", confidence: "high", platformTopic };
  }
  const subject = definitionSubject(text);
  // "Was ist ein Bug?" asks for a term even though it names a problem word.
  if (question && subject && subject.split(" ").length <= 3) {
    return { intent: "definition", confidence: "high", subject };
  }

  if (problem >= 2 && problem >= feature) {
    return question
      ? { intent: "unclear", confidence: "low", feedbackCandidate: "problem_report" }
      : { intent: "problem_report", confidence: "high" };
  }
  if (feature >= 2) {
    return question
      ? { intent: "unclear", confidence: "low", feedbackCandidate: "feature_request" }
      : { intent: "feature_request", confidence: "high" };
  }
  if (feedback >= 2 && !question) {
    return {
      intent: "feedback",
      confidence: "high",
      usability: USABILITY_MATCHERS.some((matcher) => matcher.test(text)),
    };
  }

  if (platformTopic && words <= 4) return { intent: "platform", confidence: "high", platformTopic };
  if (question && (BARE_WHY.test(text) || RATIONALE.some((matcher) => matcher.test(text)))) {
    return { intent: "rationale", confidence: "high" };
  }
  if (PROGRESS.test(text) && question) return { intent: "progress", confidence: "high" };
  if (subject) return { intent: "definition", confidence: "high", subject };
  if (words <= 3 && options.isKnownTerm?.(text)) {
    return { intent: "definition", confidence: "high", subject: text };
  }

  // A weak complaint ("Das ist komisch.") is neither a question nor a clear report.
  if (!question && problem === 1) {
    return { intent: "unclear", confidence: "low", feedbackCandidate: "problem_report" };
  }
  return { intent: "question", confidence: question ? "high" : "low" };
}

export function isFeedbackIntent(intent: TutorIntent): intent is TutorFeedbackIntent {
  return intent === "problem_report" || intent === "feature_request" || intent === "feedback";
}
