import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassificationScheme } from "../src/classification.ts";
import { createUtf8TextExtractor } from "../src/document-classification.ts";
import type { DocumentCheckAuditRecord } from "../src/tenant-document-check.ts";
import { createTenantDocumentCheckService } from "../src/tenant-document-check.ts";

const scheme: ClassificationScheme = {
  tenantId: "tenant-a",
  levels: [
    { id: "public", label: "Öffentlich", rank: 0 },
    { id: "internal", label: "Intern", rank: 1 },
    { id: "confidential", label: "Vertraulich", rank: 2 },
  ],
  indicators: [
    { id: "marking_internal", label: "Interne Kennzeichnung", minLevel: "internal" },
    { id: "personal_data", label: "Personenbezug", minLevel: "confidential" },
  ],
  aiPolicy: [
    { tool: "approved-copilot", maxLevel: "internal" },
    { tool: "public-ai", maxLevel: "public" },
  ],
  defaultOnUncertainty: "escalate",
};

function source(text: string) {
  return {
    format: "txt" as const,
    fileName: "secret-name.txt",
    bytes: new TextEncoder().encode(text),
  };
}

describe("tenant document check", () => {
  it("returns level, reasons, approval matrix, disclaimer and learning link", async () => {
    const records: DocumentCheckAuditRecord[] = [];
    const service = createTenantDocumentCheckService({
      tenantId: "tenant-a",
      scheme,
      extractors: [createUtf8TextExtractor()],
      auditSink: {
        persist(record) {
          records.push(record);
        },
      },
      learningUnitHref: "/training/classification",
      now: () => new Date("2026-08-21T20:00:00.000Z"),
    });

    const result = await service.check(
      { tenantId: "tenant-a", userId: "user-7" },
      source("Intern: Projektstatus"),
    );

    assert.equal(result.levelId, "internal");
    assert.ok(result.reasons.includes("explizite interne Kennzeichnung erkannt"));
    assert.deepEqual(result.approvalMatrix, [
      { tool: "approved-copilot", allowed: true },
      { tool: "public-ai", allowed: false },
    ]);
    assert.match(result.disclaimer, /Entscheidungshilfe/);
    assert.equal(result.learningUnitHref, "/training/classification");
    assert.deepEqual(records, [
      {
        timestamp: "2026-08-21T20:00:00.000Z",
        fileType: "txt",
        levelId: "internal",
        indicatorIds: ["marking_internal"],
        userId: "user-7",
      },
    ]);
  });

  it("persists only reduced metadata and never document content, bytes or filename", async () => {
    const records: DocumentCheckAuditRecord[] = [];
    const service = createTenantDocumentCheckService({
      tenantId: "tenant-a",
      scheme,
      extractors: [createUtf8TextExtractor()],
      auditSink: {
        persist(record) {
          records.push(record);
        },
      },
      learningUnitHref: "/training/classification",
    });
    const sensitive = "Intern Max Mustermann max@example.test";

    await service.check({ tenantId: "tenant-a", userId: "user-7" }, source(sensitive));

    const serialized = JSON.stringify(records);
    assert.ok(!serialized.includes(sensitive));
    assert.ok(!serialized.includes("secret-name.txt"));
    assert.ok(!serialized.includes("max@example.test"));
    assert.deepEqual(
      Object.keys(records[0] ?? {}).sort(),
      ["fileType", "indicatorIds", "levelId", "timestamp", "userId"].sort(),
    );
  });

  it("fails closed before extraction for cross-tenant requests", async () => {
    let extractCalled = false;
    let persistCalled = false;
    const service = createTenantDocumentCheckService({
      tenantId: "tenant-a",
      scheme,
      extractors: [
        {
          format: "txt",
          extract() {
            extractCalled = true;
            return { format: "txt", text: "Intern" };
          },
        },
      ],
      auditSink: {
        persist() {
          persistCalled = true;
        },
      },
      learningUnitHref: "/training/classification",
    });

    await assert.rejects(
      service.check({ tenantId: "tenant-b", userId: "user-7" }, source("Intern")),
      /Cross-tenant document check denied/,
    );
    assert.equal(extractCalled, false);
    assert.equal(persistCalled, false);
  });

  it("rejects a scheme from another tenant when constructing the boundary", () => {
    assert.throws(
      () =>
        createTenantDocumentCheckService({
          tenantId: "tenant-b",
          scheme,
          extractors: [createUtf8TextExtractor()],
          auditSink: { persist() {} },
          learningUnitHref: "/training/classification",
        }),
      /Document-check scheme tenant does not match boundary tenant/,
    );
  });
});
