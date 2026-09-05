import type { UserIdentity } from "@/auth/authService";
import { browserLocalStorage } from "@/persistence/adapters/browserLocalStorage";

export type ScoreVisibility = "private" | "aggregate" | "named";
export type DataStorageMode = "browser-local" | "cloud";

export interface DataTransparencyContext {
  storageMode: DataStorageMode;
  scoreVisibility: ScoreVisibility;
  leaderboardsEnabled: boolean;
  namedApprovalConfirmed: boolean;
  rawTelemetryRetentionDays: number | null;
  telemetryPseudonymizationMode: "SESSION" | "ANONYMOUS" | null;
}

export interface DataCategoryDescription {
  id: string;
  title: string;
  stored: string;
  storage: string;
  recipients: string;
  retention: string;
}

function configuredMode(): DataStorageMode {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "browser-local";
  if (authMode === "cognito") return "cloud";
  return import.meta.env.PROD ? "cloud" : "browser-local";
}

export async function loadMyDataTransparencyContext(): Promise<DataTransparencyContext> {
  const storageMode = configuredMode();
  if (storageMode === "browser-local") {
    return {
      storageMode,
      scoreVisibility: "private",
      leaderboardsEnabled: false,
      namedApprovalConfirmed: false,
      rawTelemetryRetentionDays: null,
      telemetryPseudonymizationMode: null,
    };
  }

  const { loadAmplifyDataTransparencyContext } =
    await import("@/persistence/adapters/amplifyDataTransparency");
  const context = await loadAmplifyDataTransparencyContext();
  return { storageMode, ...context };
}

function scoreRecipients(context: DataTransparencyContext): string {
  if (context.storageMode === "browser-local") {
    return "Im lokalen Entwicklungsmodus werden keine organisationsweiten Punkte oder Ranglisten an Trainer oder Administratoren ausgegeben.";
  }
  if (context.scoreVisibility === "private") {
    return "Nur du siehst deine individuellen Punkte. Organisationsweite Ranglisten und Auswertungen sind deaktiviert.";
  }
  if (context.scoreVisibility === "aggregate") {
    return "Trainer und Administratoren deiner Organisation können ausschließlich zusammengefasste Punktwerte sehen; Gruppen unter 5 Personen werden vollständig unterdrückt.";
  }
  return "Eine namentliche Auswertung ist nur für Administratoren deiner Organisation möglich und nur, wenn eine dokumentierte Freigabe bestätigt wurde.";
}

function scoreRetention(): string {
  return "Für gespeicherte Punkteereignisse und abgeschlossene Szenarioläufe ist derzeit keine separate automatische Löschfrist definiert. Dein Kompetenzprofil wird daraus berechnet und nicht zusätzlich als zweite Punktequelle gespeichert.";
}

function telemetryPseudonymizationDescription(
  mode: DataTransparencyContext["telemetryPseudonymizationMode"],
): string {
  if (mode === "ANONYMOUS") {
    return "Die Statistik wird ohne eine nutzerbezogene Kennung verarbeitet.";
  }
  if (mode === "SESSION") {
    return "Kennungen werden je Trainingssitzung pseudonymisiert und nicht als direkte Nutzerkennung in der Statistik verwendet.";
  }
  return "Personenbeziehbare Kennungen werden vor der statistischen Verarbeitung pseudonymisiert.";
}

export function dataCategories(context: DataTransparencyContext): DataCategoryDescription[] {
  const cloud = context.storageMode === "cloud";
  return [
    {
      id: "account",
      title: "Kontoprofil und Anmeldung",
      stored: cloud
        ? "Deine Anmelde- und Kontodaten wie Nutzer-ID, Organisationszuordnung, E-Mail-Adresse, Anzeigename und Rollen sowie – sofern angelegt – ergänzende Profildaten."
        : "Die lokale Testidentität aus der Entwicklungs-Konfiguration und – sofern gespeichert – das lokale Nutzerprofil.",
      storage: cloud
        ? "Im zentralen Anmelde- und Profilspeicher der Anwendung."
        : "Im lokalen Anmeldemodus und im Browser für das lokale Nutzerprofil; es wird kein Cloudkonto verwendet.",
      recipients:
        "Du selbst sowie die Anmelde- und Anwendungsdienste, die deine Identität, Organisationszuordnung und Rollen für die Zugriffsprüfung benötigen. Trainer können dein persönliches Profil nicht einsehen.",
      retention:
        "Für dein Anmeldekonto und ergänzende Profildaten ist derzeit keine separate automatische Löschfrist implementiert.",
    },
    {
      id: "preferences",
      title: "Lernpräferenzen und Barrierefreiheit",
      stored:
        "Sprache, bevorzugter Trainingsmodus, Wochenziel, Einstellungen zur Barrierefreiheit und deine KI-Selbsteinschätzung.",
      storage: cloud
        ? "Im persönlichen Einstellungsspeicher der Anwendung."
        : "Nur im Browser des lokalen Entwicklungsmodus.",
      recipients:
        "Du selbst und die Anwendungsdienste für deine persönlichen Einstellungen. Diese Selbsteinschätzung ist kein Kompetenznachweis.",
      retention:
        "Für Präferenzen ist derzeit keine separate automatische Löschfrist implementiert.",
    },
    {
      id: "training",
      title: "Trainingsfortschritt und aktueller Übungszustand",
      stored:
        "Dein aktueller Lernfortschritt in Trainingssitzungen sowie Zustandsdaten, die benötigt werden, um eine laufende Übung fortzusetzen.",
      storage: cloud
        ? "Im persönlichen Trainingsspeicher der Anwendung; bei vorübergehend fehlender Verbindung können zusätzlich nur dir zugeordnete Daten im Browser zwischengespeichert werden."
        : "Nur dir zugeordnete Trainingsdaten im Browser des lokalen Entwicklungsmodus.",
      recipients:
        "Du selbst und die Anwendungslogik für deine Trainings. Trainer- und Administratorauswertungen verwenden einen getrennten, zusammengefassten Auswertungspfad und geben deine gespeicherten Trainingszustände nicht direkt aus.",
      retention:
        "Für Trainingssitzungen ist derzeit keine separate automatische Löschfrist implementiert. Zwischengespeicherte Übungszustände können ersetzt oder gelöscht werden; Daten im Browser bleiben bis zum Überschreiben oder Löschen der Browserdaten bestehen.",
    },
    {
      id: "scores",
      title: "Punkte und Kompetenzprofil",
      stored:
        "Vom System bestätigte Ergebnisse abgeschlossener Szenarien und Punkteereignisse werden gespeichert. Daraus wird dein Kompetenzprofil je Technologie berechnet.",
      storage: cloud
        ? "Die bestätigten Ergebnisse werden zentral gespeichert. Änderungen nur im Browser können diese Punkte nicht verändern; dein Kompetenzprofil wird aus den bestätigten Ergebnissen berechnet."
        : "Im lokalen Entwicklungsmodus entsteht keine organisationsweite Rangliste.",
      recipients: scoreRecipients(context),
      retention: scoreRetention(),
    },
    {
      id: "attestations",
      title: "Kompetenznachweise",
      stored:
        "Ausgestellte Nachweise mit Szenario- und Produktversion, Lernzielen, Nachweisen deiner Leistung, Gültigkeitszeitraum und Angaben zur Echtheitsprüfung.",
      storage: cloud
        ? "Im zentralen Nachweisspeicher der Anwendung; Exportdateien werden erst auf deine Anfrage erzeugt."
        : "Im lokalen Entwicklungsmodus wird kein zentraler Nachweisspeicher als persönliche Datenquelle verwendet.",
      recipients: cloud
        ? "Du selbst. Ein PDF- oder CSV-Nachweis verlässt den persönlichen Bereich erst, wenn du ihn ausdrücklich exportierst und selbst weitergibst."
        : "Keine Cloud-Empfänger im lokalen Entwicklungsmodus.",
      retention:
        "Die fachliche Nachweisgültigkeit beträgt 12 Monate. Das ist keine Löschfrist; für den gespeicherten Nachweis ist aktuell keine separate automatische Löschfrist definiert.",
    },
    {
      id: "telemetry",
      title: "Nutzungs- und Lernstatistik",
      stored:
        "Pseudonymisierte Ereignisse zu Trainingssitzungen, Schritten, Hinweisen und Versuchen sowie daraus erzeugte organisationsweite Zusammenfassungen.",
      storage: cloud
        ? `Im zentralen Statistikbereich der Anwendung. ${telemetryPseudonymizationDescription(context.telemetryPseudonymizationMode)}`
        : "Im lokalen Entwicklungsmodus ist die zentrale Nutzungsstatistik nicht aktiv.",
      recipients: cloud
        ? "Trainer und Administratoren deiner Organisation erhalten ausschließlich die dafür vorgesehene Auswertung; bei weniger als 3 gestarteten Sitzungen werden Detailmetriken unterdrückt. Personenbeziehbare Einzelereignisse werden über diesen Auswertungspfad nicht ausgegeben."
        : "Keine Empfänger einer zentralen Nutzungsstatistik im lokalen Entwicklungsmodus.",
      retention:
        cloud && context.rawTelemetryRetentionDays !== null
          ? `Personenbeziehbare Einzelereignisse werden nach ${context.rawTelemetryRetentionDays} Tagen automatisch aus diesem Statistikbereich entfernt und können zusätzlich über den bestehenden Löschweg für deine eigenen Daten gelöscht werden. Organisationsweite Zusammenfassungen enthalten keine Nutzer-ID und gehören nicht zu deinen personenbezogenen Einzelereignissen.`
          : "Im lokalen Entwicklungsmodus werden keine Daten in der zentralen Nutzungsstatistik gespeichert.",
    },
    {
      id: "feedback",
      title: "Produktfeedback",
      stored:
        "Von dir ausdrücklich eingegebenes Feedback mit Angaben zur Übung, zum Schritt, zum Trainingsmodus und dem für die Fehleranalyse nötigen technischen Kontext.",
      storage:
        "Im Browserprofil, das du gerade verwendest; derzeit erfolgt kein automatischer Upload an einen Server.",
      recipients:
        "Nur Personen mit Zugriff auf dieses Browserprofil, solange du das Feedback nicht selbst exportierst. Das gespeicherte Feedback ist nicht fest mit deinem angemeldeten Konto verknüpft.",
      retention:
        "Bis du die Browserdaten löschst. Weil dieser Speicher nicht zuverlässig einer angemeldeten Person zugeordnet ist, wird er nicht automatisch in den Export deiner kontogebundenen Daten gemischt; der separate Feedback-Export bleibt verfügbar.",
    },
    {
      id: "transient",
      title: "Nur vorübergehend verarbeitete Daten",
      stored:
        "Kurzlebige Anmelde- und Verbindungsdaten, die benötigt werden, um dich zu erkennen und deine Berechtigungen innerhalb deiner Organisation zu prüfen.",
      storage:
        "Nur während Anmeldung und Anfrageverarbeitung; dafür wird kein zusätzlicher dauerhafter Datensatz angelegt.",
      recipients: "Anmelde- und Anwendungsdienste während der Verarbeitung.",
      retention:
        "Nicht als eigener Produktdatensatz gespeichert. Kurzlebige Zugangsdaten werden ausdrücklich nicht in den Export deiner eigenen Daten aufgenommen.",
    },
  ];
}

function browserSubjectPrefix(identity: UserIdentity): string | null {
  if (!identity.userId || !identity.tenantId) return null;
  return `ai-training-lab:tenant:value:${encodeURIComponent(identity.tenantId)}:user:${encodeURIComponent(identity.userId)}:`;
}

export function scopedBrowserTrainingRecords(identity: UserIdentity): Array<{
  key: string;
  value: unknown;
}> {
  const storage = browserLocalStorage();
  const prefix = browserSubjectPrefix(identity);
  if (!storage || !prefix) return [];
  const records: Array<{ key: string; value: unknown }> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      records.push({ key, value: JSON.parse(raw) as unknown });
    } catch {
      records.push({ key, value: raw });
    }
  }
  return records;
}

async function remoteOwnDataJson(): Promise<unknown> {
  const { exportAmplifyOwnData } = await import("@/persistence/adapters/amplifyDataTransparency");
  return exportAmplifyOwnData();
}

export interface OwnDataExportInput {
  identity: UserIdentity;
  profile: unknown;
  preferences: unknown;
}

export async function ownDataExportJson(input: OwnDataExportInput): Promise<string> {
  if (!input.identity.userId || !input.identity.tenantId) {
    throw new Error("Eigendatenexport erfordert einen angemeldeten Nutzer mit Tenant-Zuordnung.");
  }
  const storageMode = configuredMode();
  const serverData = storageMode === "cloud" ? await remoteOwnDataJson() : null;
  return JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      subject: {
        userId: input.identity.userId,
        tenantId: input.identity.tenantId,
      },
      storageMode,
      authenticatedIdentity: {
        userId: input.identity.userId,
        tenantId: input.identity.tenantId,
        email: input.identity.email,
        displayName: input.identity.displayName,
        roles: input.identity.roles,
      },
      serverData,
      browserData: {
        profile: storageMode === "browser-local" ? input.profile : null,
        preferences: storageMode === "browser-local" ? input.preferences : null,
        scopedTrainingCache: scopedBrowserTrainingRecords(input.identity),
        feedback: {
          included: false,
          reason:
            "The existing browser feedback store is not account-scoped and is exported separately to avoid cross-user attribution.",
        },
      },
      excluded: {
        authTokens: "Transient credentials are never exported.",
        tenantAggregates: "Tenant aggregates are not person-specific own data.",
      },
    },
    null,
    2,
  );
}

export async function downloadOwnDataExport(input: OwnDataExportInput): Promise<void> {
  const json = await ownDataExportJson(input);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ai-training-lab-meine-daten-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
