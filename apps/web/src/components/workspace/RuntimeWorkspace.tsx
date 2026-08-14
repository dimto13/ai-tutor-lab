import { useEffect } from "react";
import { sourceControlPlatformRuntime } from "@/runtime/sourceControlPlatformRuntime";
import { vscodeRuntime } from "@/runtime/vscodeRuntime";
import { useTraining } from "@/state/trainingStore";
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

function useRuntimePersistence(
  runtimeId: string,
  subscribeState: RuntimeStateSubscription,
  snapshot: RuntimeSnapshotReader,
): void {
  const { isReady, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();

  useEffect(() => {
    if (!isReady) return;

    let active = true;
    let persistenceReady = false;
    const unsubscribe = subscribeState((reason) => {
      if (!active || !persistenceReady || reason === "mount" || reason === "restore") return;
      void snapshot().then((currentSnapshot) => {
        if (active) return persistRuntimeSnapshot(runtimeId, currentSnapshot);
      });
    });

    const frame = window.requestAnimationFrame(() => {
      void restoreRuntimeSnapshot(runtimeId).finally(() => {
        if (active) persistenceReady = true;
      });
    });

    return () => {
      active = false;
      persistenceReady = false;
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

export function RuntimeWorkspace() {
  const { scenario } = useTraining();
  if (scenario.environment?.runtimeAdapterId === sourceControlPlatformRuntime.id) {
    return <PersistedSourceControlPlatformWorkspace />;
  }
  return <PersistedVscodeWorkspace />;
}
