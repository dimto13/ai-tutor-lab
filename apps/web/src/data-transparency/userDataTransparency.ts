import type { Schema } from "../../../../amplify/data/resource";
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

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data error";
  return errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean)
    .join("; ");
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

  const { generateClient } = await import("aws-amplify/data");
  const client = generateClient<Schema>();
  const result = await client.queries.loadMyDataTransparencyContext();
  if (result.errors?.length) throw new Error(errorText(result.errors));
  if (!result.data) throw new Error("Amplify Data returned no transparency context");
  return {
    storageMode,
    scoreVisibility: result.data.scoreVisibility,
    leaderboardsEnabled: result.data.leaderboardsEnabled,
    namedApprovalConfirmed: result.data.namedApprovalConfirmed,
    rawTelemetryRetentionDays: result.data.rawTelemetryRetentionDays,
    telemetryPseudonymizationMode: result.data.telemetryPseudonymizationMode,
  };
}

function scoreRecipients(context: DataTransparencyContext): string {
  if (context.storageMode === "browser-local") {
    return "Im lokalen Entwicklungsmodus werden keine tenantweiten Punkte- oder Ranglistendaten an Trainer oder Admins ausgegeben.";
  }
  if (context.scoreVisibility === "private") {
    return "Nur du siehst deine individuellen Punkte. Tenantweite Ranglisten und Auswertungen sind deaktiviert.";
  }
  if (context.scoreVisibility === "aggregate") {
    return "Trainer und Tenant-Admins können ausschließlich aggregierte Punktwerte sehen; Kohorten unter 5 Personen werden serverseitig vollständig unterdrückt.";
  }
  return "Eine namentliche Auswertung ist nur für Tenant-Admins möglich und nur, weil eine dokumentierte Freigabe serverseitig bestätigt wurde.";
}

function scoreRetention(): string {
  return "Für gespeicherte ScoreEvents und ScenarioRuns ist im aktuellen Produktvertrag keine separate automatische Löschfrist definiert. Das Kompetenzprofil wird daraus serverseitig berechnet und ist keine zweite authoritative Punkte-Persistenz.";
}

export function dataCategories(context: DataTransparencyContext): DataCategoryDescription[] {
  const cloud = context.storageMode === "cloud";
  return [
    {
      id: "account",
      title: "Kontoprofil und Anmeldung",
      stored: cloud
        ? "Cognito-Identität und aktuelle Auth-Claims wie Nutzer-ID, Tenant-Zuordnung, E-Mail, Anzeigename und Rollen sowie – sofern angelegt – das ergänzende UserProfile."
        : "Die lokale Testidentität aus der Entwicklungs-Konfiguration und – sofern gespeichert – das lokale Nutzerprofil.",
      storage: cloud
        ? "AWS Cognito für die Anmeldung und Auth-Claims; ergänzende Profildaten im bestehenden UserProfile-Pfad."
        : "Lokaler Auth-Adapter plus Browser-Speicher für das lokale Nutzerprofil; kein Cognito-Cloudkonto wird verwendet.",
      recipients: "Du selbst sowie Authentifizierungs- und Backend-Dienste, die Identität, Tenant und Rollen zur Autorisierung benötigen. Es gibt keinen Trainer-Read auf dein UserProfile.",
      retention: "Für Auth-Konto und UserProfile ist im aktuellen Produktvertrag keine separate automatische Löschfrist implementiert.",
    },
    {
      id: "preferences",
      title: "Lernpräferenzen und Barrierefreiheit",
      stored: "Sprache, bevorzugter Trainingsmodus, Wochenziel, Accessibility-Einstellungen und deine KI-Selbsteinschätzung.",
      storage: cloud
        ? "AWS-Cloud im bestehenden UserPreferences-Pfad."
        : "Nur im Browser des lokalen Entwicklungsmodus.",
      recipients: "Du selbst und die Backend-Dienste für deine persönlichen Einstellungen. Diese Selbsteinschätzung ist kein Kompetenznachweis.",
      retention: "Für Präferenzen ist im aktuellen Produktvertrag keine separate automatische Löschfrist implementiert.",
    },
    {
      id: "training",
      title: "Trainingsfortschritt und Runtime-Zustand",
      stored: "Trainingssessions mit dem aktuellen Lernfortschritt im Session-Payload sowie separate Runtime-Snapshots für den simulierten Produktzustand.",
      storage: cloud
        ? "AWS-Cloud über die bestehenden TrainingSession-/RuntimeSnapshot-Persistenzadapter; Offline-Fallback kann zusätzlich subject-gescopte Browserdaten halten."
        : "Subject-gescopte Browser-Persistenz im lokalen Entwicklungsmodus.",
      recipients: "Du selbst und die Trainings-Backendlogik. Trainer-/Admin-Analytics verwendet einen getrennten Telemetriepfad und gibt gespeicherte Session-/Runtime-Rohzustände nicht direkt aus.",
      retention: "Für TrainingSessions ist keine separate automatische Löschfrist implementiert. Runtime-Snapshots können im bestehenden Runtime-Pfad ersetzt oder gelöscht werden; Browser-Fallback bleibt bis Überschreiben oder Löschen des Browser-Speichers bestehen.",
    },
    {
      id: "scores",
      title: "Punkte und Kompetenzprofil",
      stored: "Serverbestätigte ScenarioRuns und ScoreEvents werden gespeichert. Das Kompetenzprofil je Technologie wird daraus serverseitig berechnet.",
      storage: cloud
        ? "ScoreEvents und ScenarioRuns liegen in der serverautoritativen AWS-Persistenz; der Client ist nicht die Punktequelle und das Kompetenzprofil ist keine parallele authoritative Punkte-Persistenz."
        : "Im lokalen Entwicklungsmodus entsteht keine tenantweite serverautoritative Rangliste.",
      recipients: scoreRecipients(context),
      retention: scoreRetention(),
    },
    {
      id: "attestations",
      title: "Kompetenznachweise",
      stored: "Ausgestellte Nachweise mit Szenario-/Produktversion, Lernzielen, Evidenz, Gültigkeitszeitraum und Signaturmetadaten.",
      storage: cloud
        ? "Serverautoritative AWS-Persistenz; vorhandene Nachweis-Exporte werden erst auf deine Anfrage erzeugt."
        : "Im lokalen Entwicklungsmodus wird kein serverautoritatives Cloud-Attestation-Repository als persönliche Datenquelle verwendet.",
      recipients: cloud
        ? "Du selbst. Ein PDF-/CSV-Nachweis verlässt den Self-Service-Pfad erst, wenn du ihn ausdrücklich exportierst und selbst weitergibst."
        : "Keine Cloud-Empfänger im lokalen Entwicklungsmodus.",
      retention: "Die fachliche Nachweisgültigkeit beträgt 12 Monate. Das ist keine Löschfrist; für den gespeicherten Nachweis ist aktuell keine separate automatische Löschfrist definiert.",
    },
    {
      id: "telemetry",
      title: "Nutzungs- und Lerntelemetrie",
      stored: "Pseudonymisierte Rohereignisse zu Sessions, Schritten, Hinweisen und Versuchen sowie daraus erzeugte tenantweite Aggregate.",
      storage: cloud
        ? `AWS-Cloud. Rohereignisse werden im Modus ${context.telemetryPseudonymizationMode ?? "SESSION"} pseudonymisiert.`
        : "Im lokalen Entwicklungsmodus ist der Cloud-Telemetriepfad nicht aktiv.",
      recipients: cloud
        ? "Trainer und Tenant-Admins erhalten ausschließlich die serverseitige Analytics-Ausgabe; bei weniger als 3 gestarteten Sessions werden Detailmetriken unterdrückt. Personenbezogene Rohereignisse werden über diesen Reporting-Pfad nicht ausgegeben."
        : "Keine Cloud-Reporting-Empfänger im lokalen Entwicklungsmodus.",
      retention:
        cloud && context.rawTelemetryRetentionDays !== null
          ? `Personenbeziehbare Rohtelemetrie hat eine serverseitige TTL von ${context.rawTelemetryRetentionDays} Tagen und kann zusätzlich über den bestehenden Eigendaten-Löschpfad gelöscht werden. Tenant-Aggregate enthalten keine Nutzer-ID und gehören nicht zum personenbezogenen Rohdatenbestand.`
          : "Keine Cloud-Telemetrie-Retention im lokalen Entwicklungsmodus.",
    },
    {
      id: "feedback",
      title: "Produktfeedback",
      stored: "Explizit eingegebenes Feedback mit Szenario-, Schritt-, Modus- und technischem Kontext.",
      storage: "Browser-localStorage im bestehenden Feedback-Speicher; aktuell kein automatischer Server-Upload.",
      recipients: "Nur Personen mit Zugriff auf dieses Browserprofil, solange du das Feedback nicht selbst exportierst. Der aktuelle Feedback-Speicher ist nicht serverseitig an dein Konto gebunden.",
      retention: "Bis du die Browserdaten löschst. Weil dieser Speicher nicht zuverlässig einer angemeldeten Person zugeordnet ist, wird er nicht automatisch in den kontogebundenen Eigendatenexport gemischt; der bestehende Feedback-Export bleibt separat verfügbar.",
    },
    {
      id: "transient",
      title: "Nur vorübergehend verarbeitete Daten",
      stored: "Authentifizierungs- und Request-Kontext einschließlich kurzlebiger Zugangstokens, der benötigt wird, um deinen Nutzer und Tenant serverseitig zu autorisieren.",
      storage: "Nur transient im Auth-/Request-Pfad; keine zusätzliche Export-Persistenz wird angelegt.",
      recipients: "Authentifizierungs- und Backend-Dienste während der Verarbeitung.",
      retention: "Nicht als eigener Produktdatensatz gespeichert. Zugangstokens werden ausdrücklich nicht in den Eigendatenexport aufgenommen.",
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
  const { generateClient } = await import("aws-amplify/data");
  const client = generateClient<Schema>();
  const result = await client.queries.exportMyData();
  if (result.errors?.length) throw new Error(errorText(result.errors));
  if (typeof result.data !== "string") throw new Error("Amplify Data returned no own-data export");
  return JSON.parse(result.data) as unknown;
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
