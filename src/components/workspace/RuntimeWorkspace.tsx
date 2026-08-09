import { sourceControlPlatformRuntime } from "@/runtime/sourceControlPlatformRuntime";
import { useTraining } from "@/state/trainingStore";
import { SourceControlPlatformWorkspace } from "./SourceControlPlatformWorkspace";
import { Workspace } from "./Workspace";

export function RuntimeWorkspace() {
  const { scenario } = useTraining();
  if (scenario.environment?.runtimeAdapterId === sourceControlPlatformRuntime.id) {
    return <SourceControlPlatformWorkspace />;
  }
  return <Workspace />;
}
