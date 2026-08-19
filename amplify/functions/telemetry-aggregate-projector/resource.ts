import { defineFunction } from "@aws-amplify/backend";

export const telemetryAggregateProjector = defineFunction({
  name: "telemetry-aggregate-projector",
  resourceGroupName: "data",
  entry: "./handler.js",
});
