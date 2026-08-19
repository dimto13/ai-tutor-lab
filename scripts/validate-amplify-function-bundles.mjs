import { build } from "esbuild";
import { resolve } from "node:path";

const entryPoints = [
  "amplify/functions/telemetry-deletion-worker/handler.js",
  "amplify/functions/telemetry-aggregate-projector/handler.js",
];

const dependency = "@aws-sdk/client-dynamodb";

for (const entryPoint of entryPoints) {
  const absoluteEntryPoint = resolve(entryPoint);
  const result = await build({
    entryPoints: [absoluteEntryPoint],
    absWorkingDir: process.cwd(),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });

  const bundledInputs = Object.keys(result.metafile.inputs);
  const dependencyWasBundled = bundledInputs.some((input) =>
    input.includes(`node_modules/${dependency}/`),
  );

  if (!dependencyWasBundled) {
    throw new Error(`${entryPoint}: ${dependency} was not resolved into the Lambda bundle`);
  }

  const externallyResolvedDependency = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports ?? [])
    .find(
      ({ external, path }) =>
        external && (path === dependency || path.startsWith(`${dependency}/`)),
    );

  if (externallyResolvedDependency) {
    throw new Error(`${entryPoint}: ${dependency} must be bundled instead of marked external`);
  }

  console.log(`Amplify function bundle smoke OK: ${entryPoint}`);
}
