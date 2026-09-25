import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Search,
  SkipForward,
  Target,
} from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import { useLocalizedScenario } from "@/i18n/useLocalizedScenario";
import { TutorChat } from "@/components/tutor/TutorChat";
import { getRuntimeAdapter } from "@/runtime";
import { getGlossaryConceptByKey, getGlossaryConceptForTarget } from "@/lib/glossary";
import { GlossaryText } from "@/components/training/GlossaryText";
import { getHelpBonusDeductionPercent } from "@/types/training";

const FAILURES_PER_HELP_OFFER = 3;

export function GuidePanel() {
  const { mode, progress, helpLevel, recovery } = useTraining();
  const tutorProminent =
    mode === "guided" &&
    (Boolean(recovery) || progress.activeStepMistakes >= FAILURES_PER_HELP_OFFER || helpLevel > 0);

  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col border-border bg-panel pb-2.5 lg:w-[380px] lg:flex-none lg:border-l">
      {mode === "guided" ? (
        <GuidedGuide />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          role="region"
          aria-label={mode === "explore" ? "Explore-Guide" : "Challenge-Guide"}
          tabIndex={0}
        >
          {mode === "explore" ? <ExploreGuide /> : <ChallengeGuide />}
        </div>
      )}
      <TutorChat prominent={tutorProminent} />
    </aside>
  );
}
