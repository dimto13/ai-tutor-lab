import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Info,
  MessageSquareText,
  Network,
  Server,
  ShieldCheck,
} from "lucide-react";
import {
  sourceControlPlatformRuntime,
  type PlatformView,
  type SourceControlPlatformState,
} from "@/runtime/sourceControlPlatformRuntime";
import { useTraining } from "@/state/trainingStore";

const EMPTY_STATE: SourceControlPlatformState = {
  platformName: "Source-Control-Plattform",
  repositoryOwner: "contoso-labs",
  repositoryName: "onboarding-guide",
  activeView: "overview",
  currentBranch: "main",
  branches: ["main"],
  branchMenuOpen: false,
  pullRequestCreated: false,
  pullRequestTitle: "",
  pullRequestDescription: "",
  pullRequestHeadBranch: "",
  diffViewed: false,
  reviewReplied: false,
  reviewReply: "",
  checkStatus: "pending",
  mergeReady: false,
  issueOpened: false,
};

type PullRequestTab = "conversation" | "diff" | "checks";

export function SourceControlPlatformWorkspace() {
  const { mode, scenario, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<SourceControlPlatformState>(EMPTY_STATE);
  const [newBranch, setNewBranch] = useState("feature/readme-guide");
  const [pullRequestTitle, setPullRequestTitle] = useState("README um Einstieg ergänzen");
  const [pullRequestDescription, setPullRequestDescription] = useState("");
  const [reviewReply, setReviewReply] = useState("");
  const [pullRequestTab, setPullRequestTab] = useState<PullRequestTab>("conversation");
  const [remoteHelpOpen, setRemoteHelpOpen] = useState(false);
  const runtimeRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = runtimeRootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = sourceControlPlatformRuntime.subscribeState((nextState, reason) => {
      setState(nextState);
      setPullRequestTitle(nextState.pullRequestTitle || "README um Einstieg ergänzen");
      setPullRequestDescription(nextState.pullRequestDescription);
      setReviewReply(nextState.reviewReply);
      if (reason === "mutation") {
        persistRuntimeSnapshot(sourceControlPlatformRuntime.id, nextState);
      }
    });
    void (async () => {
      await sourceControlPlatformRuntime.mount(container, scenario.environment?.seed);
      if (!disposed) await restoreRuntimeSnapshot(sourceControlPlatformRuntime.id);
    })();
    return () => {
      disposed = true;
      unsubscribe();
      void sourceControlPlatformRuntime.unmount();
    };
  }, [scenario.environment?.seed, persistRuntimeSnapshot, restoreRuntimeSnapshot]);

  const inspect = (ref: string) => {
    if (mode === "explore") sourceControlPlatformRuntime.inspect(ref);
  };

  const openView = (view: PlatformView, ref: string) => {
    inspect(ref);
    sourceControlPlatformRuntime.openView(view);
  };

  const openPullRequestTab = (tab: PullRequestTab) => {
    setPullRequestTab(tab);
    if (tab === "diff") {
      inspect("platform.pullRequest.diff");
      sourceControlPlatformRuntime.viewDiff();
    } else if (tab === "checks") {
      inspect("platform.pullRequest.checks");
    }
  };

  return (
    <div
      ref={runtimeRootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-[#010409] px-4 text-xs text-foreground">
        <Server className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{state.platformName}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          vollständig simulierte Lernumgebung
        </span>
      </div>

      <div className="shrink-0 border-b border-border bg-panel px-5 pt-4">
        <button
          type="button"
          data-highlight="platform.repository.header"
          onClick={() => inspect("platform.repository.header")}
          className="flex items-center gap-2 text-left text-sm"
        >
          <Network className="h-4 w-4 text-muted-foreground" />
          <span className="text-accent">{state.repositoryOwner}</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-accent">{state.repositoryName}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            Intern
          </span>
        </button>

        <nav
          className="mt-4 flex items-end gap-1 overflow-x-auto"
          aria-label="Repository-Navigation"
        >
          <NavButton
            active={state.activeView === "overview"}
            target="platform.navigation.overview"
            icon={Info}
            label="Überblick"
            onClick={() => openView("overview", "platform.navigation.overview")}
          />
          <NavButton
            active={state.activeView === "code"}
            target="platform.navigation.code"
            icon={Code2}
            label="Code"
            onClick={() => openView("code", "platform.navigation.code")}
          />
          <NavButton
            active={state.activeView === "commits"}
            target="platform.commit.history"
            icon={GitCommitHorizontal}
            label="Commits"
            onClick={() => openView("commits", "platform.commit.history")}
          />
          <NavButton
            active={state.activeView === "pull-requests"}
            target="platform.pullRequests"
            icon={GitPullRequest}
            label="Pull Requests"
            onClick={() => openView("pull-requests", "platform.pullRequests")}
          />
          <NavButton
            active={state.activeView === "issues"}
            target="platform.issues"
            icon={CircleDot}
            label="Issues"
            onClick={() => openView("issues", "platform.issues")}
          />
        </nav>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl">
          {state.activeView === "overview" ? <Overview /> : null}
          {state.activeView === "code" ? (
            <CodeView
              state={state}
              newBranch={newBranch}
              setNewBranch={setNewBranch}
              inspect={inspect}
            />
          ) : null}
          {state.activeView === "commits" ? <CommitsView /> : null}
          {state.activeView === "pull-requests" ? (
            <PullRequestsView
              state={state}
              title={pullRequestTitle}
              description={pullRequestDescription}
              setTitle={setPullRequestTitle}
              setDescription={setPullRequestDescription}
              tab={pullRequestTab}
              openTab={openPullRequestTab}
              reviewReply={reviewReply}
              setReviewReply={setReviewReply}
              inspect={inspect}
            />
          ) : null}
          {state.activeView === "issues" ? <IssuesView state={state} inspect={inspect} /> : null}
        </div>
      </main>

      <div className="relative shrink-0 border-t border-border bg-panel px-5 py-2">
        <button
          type="button"
          data-highlight="platform.remote.help"
          onClick={() => {
            inspect("platform.remote.help");
            setRemoteHelpOpen((open) => !open);
          }}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <GitFork className="h-3.5 w-3.5" /> Clone, Fork und Remote verstehen
        </button>
        {remoteHelpOpen ? (
          <div className="absolute bottom-11 left-5 z-20 max-w-lg rounded-lg border border-border bg-card p-4 text-xs leading-relaxed shadow-2xl">
            <p className="font-semibold text-foreground">Drei verwandte, aber getrennte Begriffe</p>
            <p className="mt-2 text-muted-foreground">
              <strong className="text-foreground">Clone</strong> erstellt eine lokale Kopie. Ein
              <strong className="text-foreground"> Fork</strong> ist eine serverseitige Kopie in
              einem anderen Namensraum. Ein <strong className="text-foreground">Remote</strong> ist
              die gespeicherte Adresse zu einem entfernten Repository, häufig unter dem Namen
              <code className="mx-1 rounded bg-white/5 px-1">origin</code>.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NavButton({
  active,
  target,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  target: string;
  icon: typeof Info;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      data-highlight={target}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-xs transition-colors ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Overview() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <ConceptCard
        icon={GitBranch}
        title="Git arbeitet lokal"
        text="Git verwaltet Working Tree, Branches und Commits auf deinem Rechner. Du kannst committen, vergleichen und Branches wechseln, ohne mit einer Plattform verbunden zu sein."
      />
      <ConceptCard
        icon={Server}
        title="Die Plattform verbindet Teams"
        text="Die Plattform hostet das Remote-Repository und ergänzt Pull Requests, Reviews, Issues, Rechte und Status Checks. Sie ersetzt Git nicht, sondern baut darauf auf."
      />
      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <h2 className="text-base font-semibold text-foreground">Vom Working Tree zum Review</h2>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
          {[
            ["1", "Working Tree", "Dateien lokal ändern"],
            ["2", "Commit", "Änderung beschreiben"],
            ["3", "Remote", "Branch hochladen"],
            ["4", "Pull Request", "Diff zur Prüfung öffnen"],
            ["5", "Review & Checks", "Qualität absichern"],
          ].map(([number, title, description]) => (
            <div key={number} className="rounded-md border border-border bg-background p-3">
              <span className="text-[10px] font-semibold text-accent">{number}</span>
              <p className="mt-1 font-medium text-foreground">{title}</p>
              <p className="mt-1 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConceptCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof GitBranch;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-accent" />
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function CodeView({
  state,
  newBranch,
  setNewBranch,
  inspect,
}: {
  state: SourceControlPlatformState;
  newBranch: string;
  setNewBranch(value: string): void;
  inspect(ref: string): void;
}) {
  return (
    <section>
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Dateien auf {state.currentBranch}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Der Server zeigt den Stand des ausgewählten Branches, nicht deinen lokalen Working Tree.
          </p>
        </div>
        <button
          type="button"
          data-highlight="platform.branch.selector"
          onClick={() => {
            inspect("platform.branch.selector");
            sourceControlPlatformRuntime.setBranchMenuOpen(!state.branchMenuOpen);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs hover:border-ring"
        >
          <GitBranch className="h-3.5 w-3.5" /> {state.currentBranch}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {state.branchMenuOpen ? (
          <div className="absolute right-0 top-12 z-10 w-80 rounded-lg border border-border bg-card p-3 shadow-2xl">
            <p className="text-xs font-semibold">Branch auswählen oder erstellen</p>
            <div className="mt-2 flex gap-2">
              <input
                value={newBranch}
                onChange={(event) => setNewBranch(event.target.value)}
                placeholder="feature/beschreibung"
                aria-label="Neuer Branch"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={() => sourceControlPlatformRuntime.createBranch(newBranch)}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
              >
                Erstellen
              </button>
            </div>
            <ul className="mt-2 border-t border-border pt-2 text-xs">
              {state.branches.map((branch) => (
                <li key={branch} className="flex items-center gap-2 py-1 text-muted-foreground">
                  {branch === state.currentBranch ? <Check className="h-3.5 w-3.5" /> : null}
                  {branch}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card text-xs">
        <div className="flex items-center gap-3 border-b border-border bg-white/[0.03] px-4 py-3">
          <GitCommitHorizontal className="h-4 w-4 text-accent" />
          <span className="font-medium">Dokumentation für neue Teammitglieder vorbereiten</span>
          <span className="ml-auto text-muted-foreground">a1b2c3d · vor 2 Stunden</span>
        </div>
        {["docs/", "src/", "README.md", "CONTRIBUTING.md"].map((file) => (
          <div key={file} className="flex border-b border-border px-4 py-2.5 last:border-0">
            <Code2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-accent">{file}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommitsView() {
  const commits = [
    ["a1b2c3d", "Dokumentation für neue Teammitglieder vorbereiten", "Maria Schmidt"],
    ["9f8e7d6", "Beispiele für lokale Einrichtung ergänzen", "Jonas Weber"],
    ["4c3b2a1", "Projektstruktur initialisieren", "Maria Schmidt"],
  ];
  return (
    <section>
      <h2 className="text-base font-semibold">Commit-Historie</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Jeder Commit verbindet einen Projektzustand mit Nachricht, Autor und Vorgänger.
      </p>
      <ol className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        {commits.map(([hash, message, author]) => (
          <li
            key={hash}
            className="flex items-center gap-3 border-b border-border p-4 last:border-0"
          >
            <GitCommitHorizontal className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{message}</p>
              <p className="mt-1 text-xs text-muted-foreground">{author} · synthetische Historie</p>
            </div>
            <code className="text-xs text-accent">{hash}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PullRequestsView({
  state,
  title,
  description,
  setTitle,
  setDescription,
  tab,
  openTab,
  reviewReply,
  setReviewReply,
  inspect,
}: {
  state: SourceControlPlatformState;
  title: string;
  description: string;
  setTitle(value: string): void;
  setDescription(value: string): void;
  tab: PullRequestTab;
  openTab(tab: PullRequestTab): void;
  reviewReply: string;
  setReviewReply(value: string): void;
  inspect(ref: string): void;
}) {
  const [editingPullRequest, setEditingPullRequest] = useState(false);

  if (!state.pullRequestCreated) {
    return (
      <section className="mx-auto max-w-2xl">
        <h2 className="text-base font-semibold">Pull Request erstellen</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ein Pull Request schlägt vor, den Branch <strong>{state.currentBranch}</strong> mit
          <strong> main</strong> zusammenzuführen. Beschreibe Zweck und erwartete Wirkung für das
          Review.
        </p>
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <label className="block text-xs font-medium">
            Titel
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Pull-Request-Titel"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="block text-xs font-medium">
            Beschreibung
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Pull-Request-Beschreibung"
              placeholder="Was ändert sich, warum und wie wurde es geprüft?"
              className="mt-1.5 h-28 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <button
            type="button"
            onClick={() => sourceControlPlatformRuntime.createPullRequest(title, description)}
            className="rounded-md bg-success px-3 py-2 text-xs font-semibold text-black hover:opacity-90"
          >
            Pull Request erstellen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-start gap-3">
        <GitPullRequest className="mt-1 h-5 w-5 text-success" />
        <div>
          <h2 className="text-lg font-semibold">{state.pullRequestTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="rounded-full bg-success/20 px-2 py-0.5 font-medium text-success">
              Offen
            </span>{" "}
            {state.pullRequestHeadBranch} möchte nach main zusammengeführt werden
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditingPullRequest((editing) => !editing)}
          className="ml-auto rounded-md border border-border px-3 py-2 text-xs font-medium hover:border-ring"
        >
          {editingPullRequest ? "Bearbeiten schließen" : "Pull Request bearbeiten"}
        </button>
      </div>

      {editingPullRequest ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Korrigiere Titel oder Beschreibung. Als Head-Branch wird der aktuell ausgewählte Branch
            <strong className="ml-1 text-foreground">{state.currentBranch}</strong> verwendet.
          </p>
          <label className="block text-xs font-medium">
            Titel
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Pull-Request-Titel"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="block text-xs font-medium">
            Beschreibung
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Pull-Request-Beschreibung"
              className="mt-1.5 h-28 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              sourceControlPlatformRuntime.createPullRequest(title, description);
              setEditingPullRequest(false);
            }}
            className="rounded-md bg-success px-3 py-2 text-xs font-semibold text-black hover:opacity-90"
          >
            Änderungen speichern
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex gap-1 border-b border-border">
        <PrTab active={tab === "conversation"} onClick={() => openTab("conversation")}>
          Unterhaltung
        </PrTab>
        <PrTab
          active={tab === "diff"}
          target="platform.pullRequest.diff"
          onClick={() => openTab("diff")}
        >
          Geänderte Dateien
        </PrTab>
        <PrTab
          active={tab === "checks"}
          target="platform.pullRequest.checks"
          onClick={() => openTab("checks")}
        >
          Checks
        </PrTab>
      </div>

      {tab === "conversation" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <article className="rounded-lg border border-border bg-card p-4 text-xs leading-relaxed">
              <p className="font-semibold">Maria Schmidt</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {state.pullRequestDescription || "Keine Beschreibung angegeben."}
              </p>
            </article>
            <article
              data-highlight="platform.pullRequest.review"
              onClick={() => inspect("platform.pullRequest.review")}
              className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-xs"
            >
              <div className="flex items-center gap-2 font-semibold text-warning">
                <MessageSquareText className="h-4 w-4" /> Änderungen angefragt · Jonas Weber
              </div>
              <p className="mt-2 leading-relaxed text-foreground">
                Bitte bestätige, dass der neue Einstieg keine internen Zugangsdaten enthält und der
                Link zur Einrichtung geprüft wurde.
              </p>
              {state.reviewReplied ? (
                <div className="mt-3 rounded-md border border-success/40 bg-success/10 p-3">
                  <p className="font-medium text-success">Zuletzt gesendete Antwort</p>
                  <p className="mt-1 text-muted-foreground">{state.reviewReply}</p>
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <input
                  value={reviewReply}
                  onChange={(event) => setReviewReply(event.target.value)}
                  aria-label="Antwort auf Review"
                  placeholder="Prüfung kurz nachvollziehbar beantworten"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-ring"
                />
                <button
                  type="button"
                  onClick={() => sourceControlPlatformRuntime.replyToReview(reviewReply)}
                  className="rounded-md border border-border px-3 py-2 font-medium hover:border-ring"
                >
                  {state.reviewReplied ? "Antwort aktualisieren" : "Antworten"}
                </button>
              </div>
            </article>
          </div>
          <MergeSummary state={state} />
        </div>
      ) : null}

      {tab === "diff" ? <DiffView /> : null}
      {tab === "checks" ? <ChecksView state={state} /> : null}
    </section>
  );
}

function PrTab({
  active,
  target,
  onClick,
  children,
}: {
  active: boolean;
  target?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-highlight={target}
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-xs ${
        active ? "border-accent text-foreground" : "border-transparent text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DiffView() {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-sans font-medium">
        <FileDiff className="h-4 w-4 text-accent" /> README.md
      </div>
      <div className="grid grid-cols-[44px_44px_1fr] border-b border-border bg-white/[0.02] text-muted-foreground">
        <span className="border-r border-border px-2 py-1 text-right">8</span>
        <span className="border-r border-border px-2 py-1 text-right">8</span>
        <span className="px-3 py-1">## Projekt lokal starten</span>
      </div>
      <div className="grid grid-cols-[44px_44px_1fr] bg-success/10 text-success">
        <span className="border-r border-success/20 px-2 py-1 text-right">+</span>
        <span className="border-r border-success/20 px-2 py-1 text-right">9</span>
        <span className="px-3 py-1">+ Folge der geprüften Einrichtung in docs/setup.md.</span>
      </div>
      <p className="border-t border-border p-3 font-sans text-muted-foreground">
        Der Diff zeigt ausschließlich die Änderung zwischen Ausgangs- und Zielbranch. Beim Review
        zählt diese Änderung – nicht nur die vollständige Datei.
      </p>
    </div>
  );
}

function ChecksView({ state }: { state: SourceControlPlatformState }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        {state.checkStatus === "success" ? (
          <CheckCircle2 className="h-5 w-5 text-success" />
        ) : (
          <Clock3 className="h-5 w-5 text-warning" />
        )}
        <div>
          <p className="text-sm font-semibold">Inhalts- und Linkprüfung</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.checkStatus === "success"
              ? "Erfolgreich · alle Merge-Anforderungen werden neu bewertet."
              : "Ausstehend · aktualisiere den simulierten Prüflauf."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => sourceControlPlatformRuntime.completeChecks()}
          className="ml-auto rounded-md border border-border px-3 py-2 text-xs font-medium hover:border-ring"
        >
          Checks aktualisieren
        </button>
      </div>
    </div>
  );
}

function MergeSummary({ state }: { state: SourceControlPlatformState }) {
  const items = [
    [state.pullRequestCreated, "Pull Request beschrieben"],
    [state.diffViewed, "Diff geprüft"],
    [state.reviewReplied, "Review beantwortet"],
    [state.checkStatus === "success", "Status Check erfolgreich"],
  ] as const;
  return (
    <aside className="rounded-lg border border-border bg-card p-4 text-xs">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4 text-accent" /> Merge-Anforderungen
      </div>
      <ul className="mt-3 space-y-2">
        {items.map(([done, label]) => (
          <li key={label} className="flex items-center gap-2 text-muted-foreground">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <CircleDot className="h-3.5 w-3.5" />
            )}
            {label}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => sourceControlPlatformRuntime.inspectMergeReadiness()}
        className={`mt-4 w-full rounded-md border px-3 py-2 font-medium ${
          state.mergeReady
            ? "border-success/50 bg-success/10 text-success"
            : "border-border text-muted-foreground"
        }`}
      >
        {state.mergeReady ? "Bereit zum Merge" : "Noch nicht merge-bereit"}
      </button>
    </aside>
  );
}

function IssuesView({
  state,
  inspect,
}: {
  state: SourceControlPlatformState;
  inspect(ref: string): void;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">
        Issues planen Arbeit, Pull Requests liefern Änderungen
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Ein Issue beschreibt Bedarf, Fehler oder Aufgabe. Ein Pull Request enthält einen konkreten
        Branch-Diff, der geprüft und zusammengeführt werden kann. Beide können miteinander verknüpft
        sein, sind aber nicht dasselbe.
      </p>
      <button
        type="button"
        onClick={() => {
          inspect("platform.issues");
          sourceControlPlatformRuntime.openIssue();
        }}
        className="mt-4 flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-ring"
      >
        <CircleDot className="h-4 w-4 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            #42 Einstieg für neue Teammitglieder klären
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Typ: Lerninhalt · Status: {state.issueOpened ? "angesehen" : "offen"}
          </span>
        </span>
      </button>
    </section>
  );
}
