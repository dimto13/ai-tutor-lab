import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogUrl = new URL("../../content/scoring/scenario-score-catalog.json", import.meta.url);
const resolverUrl = new URL("../../amplify/data/award-score-write-event.js", import.meta.url);
const trainingStoreUrl = new URL("../../apps/web/src/state/trainingStore.tsx", import.meta.url);

interface ScoreDefinition {
  id: string;
  mode: "explore" | "guided" | "challenge";
  version: string;
  points: number;
}

function compareDefinitions(left: ScoreDefinition, right: ScoreDefinition): number {
  return left.id.localeCompare(right.id);
}

function resolverDefinitions(source: string): ScoreDefinition[] {
  const pattern =
    /^\s*"([^"]+)":\s*\{\s*mode:\s*"(explore|guided|challenge)",\s*version:\s*"([^"]+)",\s*points:\s*(\d+(?:\.\d+)?)\s*\},?\s*$/gm;
  const definitions: ScoreDefinition[] = [];

  for (const match of source.matchAll(pattern)) {
    const [, id, mode, version, points] = match;
    if (!id || !mode || !version || !points) continue;
    definitions.push({
      id,
      mode: mode as ScoreDefinition["mode"],
      version,
      points: Number(points),
    });
  }
  return definitions.sort(compareDefinitions);
}

test("declarative scoring catalog is valid and exactly mirrored by the AppSync resolver", async () => {
  const [catalogSource, resolverSource] = await Promise.all([
    readFile(catalogUrl, "utf8"),
    readFile(resolverUrl, "utf8"),
  ]);
  const parsed = JSON.parse(catalogSource) as { schemaVersion?: unknown; scenarios?: unknown };

  assert.equal(parsed.schemaVersion, 1);
  assert.ok(Array.isArray(parsed.scenarios), "scoring catalog must contain a scenario list");
  const catalog = parsed.scenarios as ScoreDefinition[];
  assert.ok(catalog.length > 0, "scoring catalog must not be empty");

  const ids = new Set<string>();
  for (const definition of catalog) {
    assert.equal(typeof definition.id, "string");
    assert.ok(definition.id.length > 0);
    assert.ok(!ids.has(definition.id), `duplicate scoring definition ${definition.id}`);
    ids.add(definition.id);
    assert.ok(
      definition.mode === "explore" ||
        definition.mode === "guided" ||
        definition.mode === "challenge",
    );
    assert.equal(typeof definition.version, "string");
    assert.ok(definition.version.length > 0);
    assert.equal(typeof definition.points, "number");
    assert.ok(Number.isFinite(definition.points) && definition.points > 0);
  }

  assert.deepEqual(resolverDefinitions(resolverSource), [...catalog].sort(compareDefinitions));
});

test("training store has no browser-side authoritative score calculation", async () => {
  const source = await readFile(trainingStoreUrl, "utf8");

  assert.doesNotMatch(source, /\bearnedPoints\b/);
  assert.doesNotMatch(source, /\bscoreMultiplier\b/);
  assert.doesNotMatch(source, /modeMultiplier\s*=/);
  assert.doesNotMatch(source, /scenario\.points\s*\?\?/);
});
