import type { TelemetrySink, TrainingEvent, TrainingSubjectRef } from "@ai-train-lab/training-engine";
import { createLocalStorageTelemetryOutbox } from "./adapters/localStorageTelemetryOutbox";
import {
  BufferedTelemetrySink,
  type TelemetryEventWriter,
  type TelemetryPseudonymizationMode,
  type TrainingAnalyticsQuery,
  type TrainingAnalyticsService,
} from "./telemetryPipeline";

function createLazyAmplifyWriter(): TelemetryEventWriter {
  let writerPromise: Promise<TelemetryEventWriter> | null = null;
  const loadWriter = () => {
    writerPromise ??= import("./adapters/amplifyTelemetryAdapter").then(
      ({ createAmplifyTelemetryEventWriter }) => createAmplifyTelemetryEventWriter(),
    );
    return writerPromise;
  };
  return {
    async write(event: TrainingEvent) {
      await (await loadWriter()).write(event);
    },
  };
}

export function createApplicationTelemetrySink(subject: TrainingSubjectRef): TelemetrySink {
  const sink = new BufferedTelemetrySink(
    createLocalStorageTelemetryOutbox(subject),
    createLazyAmplifyWriter(),
  );
  void sink.flush();
  return sink;
}

export function createApplicationTrainingAnalyticsService(): TrainingAnalyticsService {
  let servicePromise: Promise<TrainingAnalyticsService> | null = null;
  const loadService = () => {
    servicePromise ??= import("./adapters/amplifyTelemetryAdapter").then(
      ({ createAmplifyTrainingAnalyticsService }) => createAmplifyTrainingAnalyticsService(),
    );
    return servicePromise;
  };

  return {
    async loadScenarioMetrics(query: TrainingAnalyticsQuery) {
      return (await loadService()).loadScenarioMetrics(query);
    },
    async loadPseudonymizationMode() {
      return (await loadService()).loadPseudonymizationMode();
    },
    async savePseudonymizationMode(mode: TelemetryPseudonymizationMode) {
      await (await loadService()).savePseudonymizationMode(mode);
    },
  };
}
