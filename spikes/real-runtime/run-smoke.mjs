import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isRealRuntimeEvent, translateEmbeddedTargetRect } from "./bridgeProtocol.ts";

const spikeDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(spikeDirectory, "..", "..");
const requireFromE2e = createRequire(path.join(repositoryRoot, "e2e", "package.json"));
const { chromium } = requireFromE2e("@playwright/test");
const execFileAsync = promisify(execFile);

const runtimeBinary = process.env["REAL_RUNTIME_BIN"];
if (!runtimeBinary) {
  throw new Error("REAL_RUNTIME_BIN must point to an extracted code-server release binary");
}

const bridgeSource = "real-editor-runtime-spike";
const sessionId = "real-runtime-smoke-session";
const eventToken = "local-smoke-token";
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ai-tutor-real-runtime-"));
const logs = [];
let runtimeProcess;
let browser;
let collectorServer;
let hostServer;

try {
  const workspaceDirectory = path.join(temporaryRoot, "workspace");
  const userDataDirectory = path.join(temporaryRoot, "user-data");
  const userSettingsDirectory = path.join(userDataDirectory, "User");
  const extensionsDirectory = path.join(temporaryRoot, "extensions");
  const extensionDirectory = path.join(extensionsDirectory, "ai-tutor.runtime-bridge-0.1.0");
  await Promise.all([
    mkdir(workspaceDirectory, { recursive: true }),
    mkdir(userSettingsDirectory, { recursive: true }),
    mkdir(extensionsDirectory, { recursive: true }),
  ]);
  await cp(path.join(spikeDirectory, "bridge-extension"), extensionDirectory, {
    recursive: true,
  });
  await writeFile(
    path.join(workspaceDirectory, "README.md"),
    "# Real Runtime Smoke Test\n\nSynthetic spike content only.\n",
    "utf8",
  );
  await writeFile(
    path.join(userSettingsDirectory, "settings.json"),
    JSON.stringify(
      {
        "chat.agentFilesLocations": {
          "~/.copilot/agents": false,
          "~/.claude/agents": false,
        },
        "chat.agentSkillsLocations": {
          "~/.agents/skills": false,
          "~/.copilot/skills": false,
          "~/.claude/skills": false,
        },
        "chat.instructionsFilesLocations": {
          "~/.copilot/instructions": false,
          "~/.claude/rules": false,
        },
        "chat.hookFilesLocations": {
          "~/.copilot/hooks": false,
          "~/.claude/settings.json": false,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const events = [];
  collectorServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/events") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${eventToken}`) {
      response.writeHead(401).end();
      return;
    }
    const body = await readRequestBody(request);
    const event = JSON.parse(body);
    if (!isRealRuntimeEvent(event, { source: bridgeSource, sessionId })) {
      response.writeHead(422).end();
      return;
    }
    events.push(event);
    response.writeHead(204).end();
  });
  const collectorPort = await listenOnRandomPort(collectorServer);

  const runtimePort = await reservePort();
  const hostPort = await reservePort();
  const runtimeOrigin = `http://127.0.0.1:${runtimePort}`;
  hostServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Real runtime host</title></head>
  <body style="margin:0;background:#111827">
    <iframe id="runtime" title="Real editor runtime" src="${runtimeOrigin}/?folder=${encodeURIComponent(workspaceDirectory)}" style="border:0;width:100vw;height:100vh"></iframe>
  </body>
</html>`);
  });
  await listen(hostServer, hostPort);

  runtimeProcess = spawn(
    runtimeBinary,
    [
      "--config",
      "/dev/null",
      "--auth",
      "none",
      "--bind-addr",
      `127.0.0.1:${runtimePort}`,
      "--disable-telemetry",
      "--disable-update-check",
      "--disable-workspace-trust",
      "--disable-getting-started-override",
      "--ignore-last-opened",
      "--user-data-dir",
      userDataDirectory,
      "--extensions-dir",
      extensionsDirectory,
      "--session-socket",
      path.join(userDataDirectory, "session.sock"),
      workspaceDirectory,
    ],
    {
      env: {
        ...pickRuntimeEnvironment(),
        AI_TUTOR_EVENT_ENDPOINT: `http://127.0.0.1:${collectorPort}/events`,
        AI_TUTOR_EVENT_TOKEN: eventToken,
        AI_TUTOR_SESSION_ID: sessionId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  runtimeProcess.stdout.on("data", (chunk) => logs.push(String(chunk)));
  runtimeProcess.stderr.on("data", (chunk) => logs.push(String(chunk)));
  await waitForHealthyRuntime(`${runtimeOrigin}/healthz`, runtimeProcess);
  const runtimeVersion = await readRuntimeVersion(runtimeBinary);

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (message) => logs.push(`[browser:${message.type()}] ${message.text()}\n`));
  page.on("pageerror", (error) => logs.push(`[browser:error] ${error.stack ?? error.message}\n`));

  await page.goto(`http://127.0.0.1:${hostPort}/`);
  const crossOriginFrame = await waitForRuntimeFrame(page, runtimeOrigin);
  await crossOriginFrame.locator(".monaco-workbench").waitFor({ timeout: 30_000 });
  const crossOriginDomAccessible = await page.evaluate(() => {
    const frame = document.querySelector("#runtime");
    try {
      return Boolean(frame?.contentDocument?.querySelector(".monaco-workbench"));
    } catch {
      return false;
    }
  });

  await page.goto(`${runtimeOrigin}/proxy/${hostPort}/`);
  const sameOriginFrame = await waitForRuntimeFrame(page, runtimeOrigin);
  await sameOriginFrame.locator(".monaco-workbench").waitFor({ timeout: 30_000 });
  const sameOriginDomAccessible = await page.evaluate(() =>
    Boolean(
      document.querySelector("#runtime")?.contentDocument?.querySelector(".monaco-workbench"),
    ),
  );

  const explorerTarget = sameOriginFrame.locator('[aria-label^="Explorer"]').first();
  await explorerTarget.waitFor({ timeout: 30_000 });
  const readmeTarget = sameOriginFrame.getByText("README.md", { exact: true }).first();
  try {
    await readmeTarget.waitFor({ timeout: 10_000 });
  } catch {
    await explorerTarget.click();
    await readmeTarget.waitFor({ timeout: 30_000 });
  }
  await readmeTarget.click();
  const fileEvent = await waitForEvent(
    events,
    (event) => event.type === "file.opened" && event.payload.filename === "README.md",
  );

  const frameBox = await page.locator("#runtime").boundingBox();
  const innerTargetBox = await explorerTarget.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  });
  const browserTargetBox = await explorerTarget.boundingBox();
  if (!frameBox || !browserTargetBox) throw new Error("target rectangles were not measurable");
  const translatedTargetBox = translateEmbeddedTargetRect(
    { top: frameBox.y, left: frameBox.x, width: frameBox.width, height: frameBox.height },
    innerTargetBox,
  );
  const translatedTargetMatches =
    Math.abs(translatedTargetBox.top - browserTargetBox.y) <= 1 &&
    Math.abs(translatedTargetBox.left - browserTargetBox.x) <= 1 &&
    Math.abs(translatedTargetBox.width - browserTargetBox.width) <= 1 &&
    Math.abs(translatedTargetBox.height - browserTargetBox.height) <= 1;
  const runtimeProcessTreeRssMb = await readProcessTreeRssMb(runtimeProcess.pid);
  const personalCustomizationDiscoveryDisabled = ![
    path.join(process.env["HOME"] ?? "", ".agents"),
    path.join(process.env["HOME"] ?? "", ".claude"),
    path.join(process.env["HOME"] ?? "", ".copilot"),
  ].some((marker) => marker.length > 0 && logs.join("").includes(marker));

  const evidencePath =
    process.env["REAL_RUNTIME_EVIDENCE_PATH"] ??
    path.join(temporaryRoot, "real-runtime-evidence.png");
  await page.screenshot({ path: evidencePath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        runtimeVersion,
        runtimeProcessTreeRssMb,
        personalCustomizationDiscoveryDisabled,
        crossOriginDomAccessible,
        sameOriginDomAccessible,
        translatedTargetMatches,
        capturedEvent: fileEvent,
        evidencePath,
      },
      null,
      2,
    ),
  );

  if (crossOriginDomAccessible) throw new Error("cross-origin frame unexpectedly exposed its DOM");
  if (!sameOriginDomAccessible) throw new Error("same-origin frame did not expose its DOM");
  if (!translatedTargetMatches) throw new Error("translated target rectangle did not match");
  if (!personalCustomizationDiscoveryDisabled) {
    throw new Error("runtime attempted to discover personal editor customizations");
  }
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const [pageIndex, currentPage] of pages.entries()) {
      logs.push(
        `[browser:frames] ${JSON.stringify(
          currentPage.frames().map((frame) => ({ name: frame.name(), url: frame.url() })),
        )}\n`,
      );
      try {
        logs.push(
          `[browser:body] ${(await currentPage.locator("body").innerText()).slice(0, 2_000)}\n`,
        );
        await currentPage.screenshot({
          path: `/tmp/aitp27-real-runtime-failure-${pageIndex}.png`,
          fullPage: true,
        });
      } catch (diagnosticError) {
        logs.push(`[browser:diagnostic-error] ${diagnosticError.message}\n`);
      }
    }
  }
  if (logs.length > 0) console.error(logs.join("").slice(-12_000));
  throw error;
} finally {
  await browser?.close();
  runtimeProcess?.kill("SIGTERM");
  await closeServer(hostServer);
  await closeServer(collectorServer);
  if (process.env["REAL_RUNTIME_KEEP_TEMP"] !== "1") {
    await rm(temporaryRoot, { recursive: true, force: true });
  } else {
    console.error(`kept temporary runtime at ${temporaryRoot}`);
  }
}

async function readRequestBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error("event request exceeds 64 KiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function reservePort() {
  const server = createServer();
  const port = await listenOnRandomPort(server);
  await closeServer(server);
  return port;
}

async function listenOnRandomPort(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function waitForHealthyRuntime(url, processHandle) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`real runtime exited with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("real runtime did not become healthy within 120 seconds");
}

async function readRuntimeVersion(binary) {
  const { stdout } = await execFileAsync(binary, ["--config", "/dev/null", "--version"], {
    env: pickRuntimeEnvironment(),
  });
  return stdout.trim();
}

async function readProcessTreeRssMb(rootPid) {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="]);
  const processes = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([pid, parentPid, rss]) =>
      [pid, parentPid, rss].every((value) => Number.isFinite(value)),
    );
  const processIds = new Set([rootPid]);
  let discoveredChild;
  do {
    discoveredChild = false;
    for (const [pid, parentPid] of processes) {
      if (processIds.has(parentPid) && !processIds.has(pid)) {
        processIds.add(pid);
        discoveredChild = true;
      }
    }
  } while (discoveredChild);
  const rssKb = processes
    .filter(([pid]) => processIds.has(pid))
    .reduce((total, [, , rss]) => total + rss, 0);
  return Number((rssKb / 1024).toFixed(1));
}

async function waitForRuntimeFrame(page, runtimeOrigin) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const frame = page
      .frames()
      .find(
        (candidate) => candidate !== page.mainFrame() && candidate.url().startsWith(runtimeOrigin),
      );
    if (frame) return frame;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("runtime iframe did not load within 120 seconds");
}

async function waitForEvent(events, predicate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`expected bridge event was not captured; received ${JSON.stringify(events)}`);
}

function pickRuntimeEnvironment() {
  const environment = {};
  for (const name of ["PATH", "LANG", "LC_ALL", "SHELL", "USER", "TMPDIR", "HOME"]) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  return environment;
}
