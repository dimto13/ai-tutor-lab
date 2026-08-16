import { useEffect, useState } from "react";
import { claudeCodeRuntime } from "@/runtime/claudeCodeRuntime";
import { sourceControlPlatformRuntime } from "@/runtime/sourceControlPlatformRuntime";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { useTraining } from "@/state/trainingStore";
import { ClaudeCodeWorkspace } from "./ClaudeCodeWorkspace";
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
    mode,
    progress,
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
    if (!runtimeReady || mode !== "guided" || !progress.activeStepId) return;
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      void snapshot().then((currentSnapshot) => {
        if (active) void ensureGuidedRecoveryCheckpoint(runtimeId, currentSnapshot);
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [
    runtimeReady,
    mode,
    progress.activeStepId,
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
  if (scenario.environment?.runtimeAdapterId === sourceControlPlatformRuntime.id) {
    return <PersistedSourceControlPlatformWorkspace />;
  }
  if (scenario.environment?.runtimeAdapterId === claudeCodeRuntime.id) {
    return <PersistedClaudeCodeWorkspace />;
  }
  return <PersistedVscodeWorkspace />;
}