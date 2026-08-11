import { spawn } from "node:child_process";
import { resolve } from "node:path";

const computeDir = resolve("apps/web/.amplify-hosting/compute/default");
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

async function assertRoute(pathname) {
  const response = await fetch(`http://127.0.0.1:3000${pathname}`, { redirect: "manual" });
  const body = await response.text();

  if (response.status !== 200) {
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
