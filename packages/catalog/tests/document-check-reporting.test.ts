import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTenantDocumentCheckReportingService,
  type DocumentCheckReportingVisibilityPolicy,
} from "../src/document-check-reporting.ts";
import type { DocumentCheckAuditRecord } from "../src/tenant-document-check.ts";

function record(
  index: number,
  options: Partial<DocumentCheckAuditRecord> = {},
): DocumentCheckAuditRecord {
  return {
    timestamp: `2026-08-${String(20 + index).padStart(2, "0")}T10:00:00.000Z`,
    fileType: "txt",
    levelId: index % 2 === 0 ? "internal" : "confidential",
    indicatorIds: index % 2 === 0 ? ["personal_data", "contract"] : ["personal_data"],
    userId: `user-${index}`,
    ...options,
  };
}

function service(
  records: readonly DocumentCheckAuditRecord[],
  visibility: DocumentCheckReportingVisibilityPolicy["visibility"] = "aggregate",
) {
  return createTenantDocumentCheckReportingService({
    tenantId: "tenant-a",
    auditSource: { list: () => records },
    visibilitySource: { load: () => ({ visibility }) },
  });
}

describe("document-check reporting", () => {
  it("suppresses aggregate results below five checks without leaking the cohort size", async () => {
    const reporting = service([record(1), record(2), record(3), record(4)]);

    const result = await reporting.loadReport({ tenantId: "tenant-a", role: "trainer" });

    assert.deepEqual(result, {
      visibility: "aggregate",
      cohortSuppressed: true,
      checkCount: null,
      levelDistribution: [],
      frequentIndicators: [],
      trend: [],
    });
    await assert.rejects(
      reporting.exportCsv({ tenantId: "tenant-a", role: "trainer" }),
      /reporting is suppressed/,
    );
  });

  it("makes aggregate distribution, indicators, trend and CSV visible at exactly five checks", async () => {
    const records = [record(1), record(2), record(3), record(4), record(5)];
    const reporting = service(records);

    const result = await reporting.loadReport({ tenantId: "tenant-a", role: "trainer" });

    assert.equal(result.cohortSuppressed, false);
    assert.equal(result.checkCount, 5);
    assert.deepEqual(result.levelDistribution, [
      { id: "confidential", count: 3, share: 0.6 },
      { id: "internal", count: 2, share: 0.4 },
    ]);
    assert.deepEqual(result.frequentIndicators, [
      { id: "personal_data", count: 5, share: 1 },
      { id: "contract", count: 2, share: 0.4 },
    ]);
    assert.deepEqual(result.trend, [
      { date: "2026-08-21", count: 1 },
      { date: "2026-08-22", count: 1 },
      { date: "2026-08-23", count: 1 },
      { date: "2026-08-24", count: 1 },
      { date: "2026-08-25", count: 1 },
    ]);

    const csv = await reporting.exportCsv({ tenantId: "tenant-a", role: "trainer" });
    assert.match(csv, /"summary","checks","5",""/);
    assert.match(csv, /"level","confidential","3","0.6"/);
    assert.match(csv, /"indicator","personal_data","5","1"/);
    assert.ok(!csv.includes("user-1"));
    assert.ok(!csv.includes("fileName"));
  });

  it("keeps document reporting aggregate even when the server policy is named", async () => {
    const reporting = service([record(1), record(2), record(3), record(4), record(5)], "named");

    const result = await reporting.loadReport({ tenantId: "tenant-a", role: "tenant_admin" });
    const serialized = JSON.stringify(result);

    assert.equal(result.visibility, "named");
    assert.equal(result.cohortSuppressed, false);
    assert.ok(!serialized.includes("user-"));
    assert.ok(!serialized.includes("fileName"));
  });

  it("suppresses private visibility before reading audit evidence", async () => {
    let auditRead = false;
    const reporting = createTenantDocumentCheckReportingService({
      tenantId: "tenant-a",
      auditSource: {
        list() {
          auditRead = true;
          return [record(1), record(2), record(3), record(4), record(5)];
        },
      },
      visibilitySource: { load: () => ({ visibility: "private" }) },
    });

    const result = await reporting.loadReport({ tenantId: "tenant-a", role: "trainer" });

    assert.equal(result.cohortSuppressed, true);
    assert.equal(result.checkCount, null);
    assert.equal(auditRead, false);
  });

  it("fails closed on cross-tenant context before reading policy or audit data", async () => {
    let policyRead = false;
    let auditRead = false;
    const reporting = createTenantDocumentCheckReportingService({
      tenantId: "tenant-a",
      auditSource: {
        list() {
          auditRead = true;
          return [];
        },
      },
      visibilitySource: {
        load() {
          policyRead = true;
          return { visibility: "aggregate" };
        },
      },
    });

    await assert.rejects(
      reporting.loadReport({ tenantId: "tenant-b", role: "tenant_admin" }),
      /Cross-tenant document-check reporting denied/,
    );
    assert.equal(policyRead, false);
    assert.equal(auditRead, false);
  });

  it("fails closed when audit evidence is malformed", async () => {
    const records = [
      record(1),
      record(2),
      record(3),
      record(4),
      record(5, { timestamp: "not-a-timestamp" }),
    ];
    const reporting = service(records);

    await assert.rejects(
      reporting.loadReport({ tenantId: "tenant-a", role: "tenant_admin" }),
      /reporting evidence is invalid/,
    );
  });
});
