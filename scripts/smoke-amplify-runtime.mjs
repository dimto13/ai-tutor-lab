import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const computeDir = resolve("apps/web/.amplify-hosting/compute/default");
const ssrDir = resolve(computeDir, "_ssr");
const server = spawn(process.execPath, ["server.js"], {
  cwd: computeDir,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "3000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});
server.stderr.on("data", (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
});

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Amplify compute server exited before accepting requests (code ${String(server.exitCode)}).\n${stdout}\n${stderr}`,
      );
    }

    try {
      const response = await fetch("http://127.0.0.1:3000/", { redirect: "manual" });
      return response;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`Amplify compute server did not become reachable: ${String(lastError)}`);
}

function printLineRange(lines, startIndex, endIndex) {
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (index < 0 || index >= lines.length) continue;
    console.error(`${String(index + 1).padStart(6, " ")} | ${lines[index]}`);
  }
}

async function printAmplifyBundleDiagnostics() {
  console.error("\n--- Amplify bundle diagnostics ---");

  const stackMatch = stderr.match(/(\/[^\s()]+\/_ssr\/server-[^\s():]+\.mjs):(\d+):(\d+)/);
  if (stackMatch) {
    const [, stackFile, lineText, columnText] = stackMatch;
    const lines = (await readFile(stackFile, "utf8")).split("\n");
    const lineNumber = Number(lineText);
    console.error(`Failing generated chunk: ${stackFile}:${lineText}:${columnText}`);
    printLineRange(lines, lineNumber - 6, lineNumber + 4);
  } else {
    console.error("No generated server chunk location found in stderr stack trace.");
  }

  const files = (await readdir(ssrDir)).filter(
    (filename) => filename.startsWith("server-") && filename.endsWith(".mjs"),
  );

  for (const filename of files) {
    const path = resolve(ssrDir, filename);
    const lines = (await readFile(path, "utf8")).split("\n");
    const helperMatches = [];

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes("__exportAll")) helperMatches.push(index);
    }

    if (helperMatches.length === 0) continue;

    console.error(`\n${filename}: ${helperMatches.length} __exportAll occurrence(s)`);
    for (const index of helperMatches.slice(0, 12)) {
      printLineRange(lines, index - 2, index + 2);
    }
    if (helperMatches.length > 12) {
      console.error(`... ${helperMatches.length - 12} additional occurrence(s) omitted`);
    }
  }

  console.error("--- end Amplify bundle diagnostics ---\n");
}

async function assertRoute(pathname) {
  const response = await fetch(`http://127.0.0.1:3000${pathname}`, { redirect: "manual" });
  const body = await response.text();

  if (response.status !== 200) {
    await printAmplifyBundleDiagnostics();
    throw new Error(
      `Amplify runtime smoke failed for ${pathname}: HTTP ${response.status} ${response.headers.get("content-type") ?? ""}\n${body.slice(0, 1200)}`,
    );
  }

  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error(
      `Amplify runtime smoke failed for ${pathname}: expected text/html, got ${response.headers.get("content-type") ?? "<none>"}`,
    );
  }

  console.log(`Amplify runtime smoke OK: ${pathname} -> HTTP ${response.status}`);
}

try {
  const firstResponse = await waitForServer();
  await firstResponse.body?.cancel();
  await assertRoute("/");
  await assertRoute("/training/vscode-basics.guided");
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      delay(2_000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
