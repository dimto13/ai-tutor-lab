import { useEffect, useState } from "react";
import { classificationRuntime } from "@/runtime/classificationRuntime";
import { claudeCodeRuntime } from "@/runtime/claudeCodeRuntime";
import { m365CopilotRuntime } from "@/runtime/m365CopilotRuntime";
import { sourceControlPlatformRuntime } from "@/runtime/sourceControlPlatformRuntime";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { useTraining } from "@/state/trainingStore";
import { ClassificationWorkspace } from "./ClassificationWorkspace";
import { ClaudeCodeWorkspace } from "./ClaudeCodeWorkspace";
import { M365CopilotWorkspace } from "./M365CopilotWorkspace";
import { SourceControlPlatformWorkspace } from "./SourceControlPlatformWorkspace";
import { Workspace } from "./Workspace";

type RuntimeStateSubscription = (handler: (reason: string) => void) => () => void;
type RuntimeSnapshotReader = () => Promise<unknown>;

const subscribeVscodeState: RuntimeStateSubscription = (handler) =>
  vscodeRuntime.subscribeState((_state, reason) => handler(reason));
const snapshotVscode: RuntimeSnapshotReader = () => vscodeRuntime.snapshot();
const subscribeSourceControlState: RuntimeStateSubscription = (handler) =>
  sourceControlPlatformRuntime.subscribeState((_state, reason) => handler(reason));
const snapshotSourceControl: RuntimeSnapshotReader = () => sourceControlPlatformRuntime.snapshot();
const subscribeClaudeCodeState: RuntimeStateSubscription = (handler) =>
  claudeCodeRuntime.subscribeState((_state, reason) => handler(reason));
const snapshotClaudeCode: RuntimeSnapshotReader = () => claudeCodeRuntime.snapshot();

function useRuntimePersistence(
  runtimeId: string,
  subscribeState: RuntimeStateSubscription,
  snapshot: RuntimeSnapshotReader,
): void {
  const {
    isReady,
    isGuidedReplay,
    mode,
    progress,
    ensureGuidedNavigationCheckpoints,
    ensureGuidedRecoveryCheckpoint,
    persistRuntimeSnapshot,
    restoreRuntimeSnapshot,
  } = useTraining();
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    if (!isReady) return;

    let active = true;
    let persistenceReady = false;
    setRuntimeReady(false);
    const unsubscribe = subscribeState((reason) => {
      if (!active || !persistenceReady || reason === "mount" || reason === "restore") return;
      void snapshot().then((currentSnapshot) => {
        if (active) return persistRuntimeSnapshot(runtimeId, currentSnapshot);
      });
    });

    const frame = window.requestAnimationFrame(() => {
      void snapshot()
        .then((initialSnapshot) => {
          if (!active) return false;
          persistRuntimeSnapshot(runtimeId, initialSnapshot);
          return restoreRuntimeSnapshot(runtimeId);
        })
        .finally(() => {
          if (active) {
            persistenceReady = true;
            setRuntimeReady(true);
          }
        });
    });

    return () => {
      active = false;
      persistenceReady = false;
      setRuntimeReady(false);
      window.cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [
    isReady,
    persistRuntimeSnapshot,
    restoreRuntimeSnapshot,
    runtimeId,
    snapshot,
    subscribeState,
  ]);

  useEffect(() => {
    if (!runtimeReady || mode !== "guided" || !progress.activeStepId || isGuidedReplay) {
      return;
    }

    // Navigation checkpoints must start at the exact step-entry state. Waiting for another animation
    // frame leaves a window in which a fast learner action can complete the step and cancel the
    // checkpoint effect before it ever runs.
    void ensureGuidedNavigationCheckpoints();

    let active = true;
    void snapshot().then((currentSnapshot) => {
      if (!active) return;
      void ensureGuidedRecoveryCheckpoint(runtimeId, currentSnapshot);
    });
    return () => {
      active = false;
    };
  }, [
    runtimeReady,
    mode,
    progress.activeStepId,
    isGuidedReplay,
    ensureGuidedNavigationCheckpoints,
    ensureGuidedRecoveryCheckpoint,
    runtimeId,
    snapshot,
  ]);
}

function PersistedVscodeWorkspace() {
  useRuntimePersistence(vscodeRuntime.id, subscribeVscodeState, snapshotVscode);
  return <Workspace />;
}

function PersistedSourceControlPlatformWorkspace() {
  useRuntimePersistence(
    sourceControlPlatformRuntime.id,
    subscribeSourceControlState,
    snapshotSourceControl,
  );
  return <SourceControlPlatformWorkspace />;
}

function PersistedClaudeCodeWorkspace() {
  useRuntimePersistence(claudeCodeRuntime.id, subscribeClaudeCodeState, snapshotClaudeCode);
  return <ClaudeCodeWorkspace />;
}

export function RuntimeWorkspace() {
  const { scenario } = useTraining();
  if (scenario.environment?.runtimeAdapterId === classificationRuntime.id) {
    return <ClassificationWorkspace />;
  }
  if (scenario.environment?.runtimeAdapterId === m365CopilotRuntime.id) {
    return <M365CopilotWorkspace />;
  }
  if (scenario.environment?.runtimeAdapterId === sourceControlPlatformRuntime.id) {
    return <PersistedSourceControlPlatformWorkspace />;
  }
  if (scenario.environment?.runtimeAdapterId === claudeCodeRuntime.id) {
    return <PersistedClaudeCodeWorkspace />;
  }
  return <PersistedVscodeWorkspace />;
}
