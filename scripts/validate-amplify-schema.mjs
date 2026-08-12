import { schema } from "../amplify/data/resource.ts";

// Amplify validates the Data schema at runtime during `ampx pipeline-deploy`; TypeScript alone
// does not execute this transform. Keep this guard in CI so invalid model authorization and other
// schema-transform errors fail before merge/release. This intentionally validates the schema only;
// full CDK synthesis and cloud deployment remain part of the real Amplify pipeline.
schema.transform();

console.log("Amplify Data schema transform succeeded.");
