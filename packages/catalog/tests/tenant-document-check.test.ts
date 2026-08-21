import { describe, expect, it, vi } from "vitest";
import type { ClassificationScheme } from "../src/classification.ts";
import type { DocumentCheckAuditRecord } from "../src/tenant-document-check.ts";
import { createTenantDocumentCheckService } from "../src/tenant-document-check.ts";
import { createUtf8TextExtractor } from "../src/document-classification.ts";

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
      auditSink: { persist: (record) => records.push(record) },
      learningUnitHref: "/training/classification",
      now: () => new Date("2026-08-21T20:00:00.000Z"),
    });

    const result = await service.check(
      { tenantId: "tenant-a", userId: "user-7" },
      source("Intern: Projektstatus"),
    );

    expect(result.levelId).toBe("internal");
    expect(result.reasons).toContain("explizite interne Kennzeichnung erkannt");
    expect(result.approvalMatrix).toEqual([
      { tool: "approved-copilot", allowed: true },
      { tool: "public-ai", allowed: false },
    ]);
    expect(result.disclaimer).toMatch(/Entscheidungshilfe/);
    expect(result.learningUnitHref).toBe("/training/classification");
    expect(records).toEqual([
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
    const persist = vi.fn<(record: DocumentCheckAuditRecord) => void>();
    const service = createTenantDocumentCheckService({
      tenantId: "tenant-a",
      scheme,
      extractors: [createUtf8TextExtractor()],
      auditSink: { persist },
      learningUnitHref: "/training/classification",
    });
    const sensitive = "Intern Max Mustermann max@example.test";

    await service.check({ tenantId: "tenant-a", userId: "user-7" }, source(sensitive));

    const serialized = JSON.stringify(persist.mock.calls);
    expect(serialized).not.toContain(sensitive);
    expect(serialized).not.toContain("secret-name.txt");
    expect(serialized).not.toContain("max@example.test");
    expect(Object.keys(persist.mock.calls[0]![0]).sort()).toEqual(
      ["fileType", "indicatorIds", "levelId", "timestamp", "userId"].sort(),
    );
  });

  it("fails closed before extraction for cross-tenant requests", async () => {
    const extract = vi.fn(() => ({ format: "txt" as const, text: "Intern" }));
    const persist = vi.fn();
    const service = createTenantDocumentCheckService({
      tenantId: "tenant-a",
      scheme,
      extractors: [{ format: "txt", extract }],
      auditSink: { persist },
      learningUnitHref: "/training/classification",
    });

    await expect(
      service.check({ tenantId: "tenant-b", userId: "user-7" }, source("Intern")),
    ).rejects.toThrow("Cross-tenant document check denied");
    expect(extract).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects a scheme from another tenant when constructing the boundary", () => {
    expect(() =>
      createTenantDocumentCheckService({
        tenantId: "tenant-b",
        scheme,
        extractors: [createUtf8TextExtractor()],
        auditSink: { persist: vi.fn() },
        learningUnitHref: "/training/classification",
      }),
    ).toThrow("Document-check scheme tenant does not match boundary tenant");
  });
});
