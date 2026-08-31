import type { DocumentCheckAuditRecord } from "./tenant-document-check.ts";

export const MIN_DOCUMENT_CHECK_REPORTING_COHORT = 5;

export type DocumentCheckReportingVisibility = "private" | "aggregate" | "named";
export type DocumentCheckReportingRole = "trainer" | "tenant_admin";

export interface TenantDocumentCheckReportingContext {
  tenantId: string;
  role: DocumentCheckReportingRole;
}

export interface DocumentCheckReportingVisibilityPolicy {
  visibility: DocumentCheckReportingVisibility;
}

/**
 * Server-side adapter to the tenant's existing visibility policy. The reporting
 * service never accepts visibility or tenant scope as a report/query argument.
 */
export interface DocumentCheckReportingVisibilitySource {
  load():
    | Promise<DocumentCheckReportingVisibilityPolicy>
    | DocumentCheckReportingVisibilityPolicy;
}

/**
 * Read side of the existing metadata-only document-check audit store. In the
 * dedicated tenant deployment this source is bound to exactly one tenant.
 */
export interface DocumentCheckAuditReportSource {
  list(): Promise<readonly DocumentCheckAuditRecord[]> | readonly DocumentCheckAuditRecord[];
}

export interface DocumentCheckReportBucket {
  id: string;
  count: number;
  share: number;
}

export interface DocumentCheckTrendBucket {
  date: string;
  count: number;
}

export interface TenantDocumentCheckReport {
  visibility: DocumentCheckReportingVisibility;
  cohortSuppressed: boolean;
  checkCount: number | null;
  levelDistribution: readonly DocumentCheckReportBucket[];
  frequentIndicators: readonly DocumentCheckReportBucket[];
  trend: readonly DocumentCheckTrendBucket[];
}

export interface TenantDocumentCheckReportingServiceOptions {
  tenantId: string;
  auditSource: DocumentCheckAuditReportSource;
  visibilitySource: DocumentCheckReportingVisibilitySource;
}

function suppressedReport(
  visibility: DocumentCheckReportingVisibility,
): TenantDocumentCheckReport {
  return {
    visibility,
    cohortSuppressed: true,
    checkCount: null,
    levelDistribution: [],
    frequentIndicators: [],
    trend: [],
  };
}

function assertContext(
  expectedTenantId: string,
  context: TenantDocumentCheckReportingContext,
): void {
  if (context.tenantId !== expectedTenantId) {
    throw new Error("Cross-tenant document-check reporting denied");
  }
  if (context.role !== "trainer" && context.role !== "tenant_admin") {
    throw new Error("Document-check reporting role is not authorized");
  }
}

function assertVisibility(
  policy: DocumentCheckReportingVisibilityPolicy,
): DocumentCheckReportingVisibility {
  if (
    policy.visibility !== "private" &&
    policy.visibility !== "aggregate" &&
    policy.visibility !== "named"
  ) {
    throw new Error("Document-check reporting visibility policy is invalid");
  }
  return policy.visibility;
}

function assertAuditRecord(record: DocumentCheckAuditRecord): void {
  if (
    !record.timestamp ||
    !Number.isFinite(Date.parse(record.timestamp)) ||
    !record.levelId.trim() ||
    !record.userId.trim() ||
    !Array.isArray(record.indicatorIds) ||
    record.indicatorIds.some((indicatorId) => !indicatorId.trim())
  ) {
    throw new Error("Document-check reporting evidence is invalid");
  }
}

function share(count: number, total: number): number {
  return Math.round((count / total) * 10_000) / 10_000;
}

function aggregate(records: readonly DocumentCheckAuditRecord[]): Omit<
  TenantDocumentCheckReport,
  "visibility" | "cohortSuppressed"
> {
  const levelCounts = new Map<string, number>();
  const indicatorCounts = new Map<string, number>();
  const trendCounts = new Map<string, number>();

  for (const record of records) {
    assertAuditRecord(record);
    levelCounts.set(record.levelId, (levelCounts.get(record.levelId) ?? 0) + 1);
    for (const indicatorId of new Set(record.indicatorIds)) {
      indicatorCounts.set(indicatorId, (indicatorCounts.get(indicatorId) ?? 0) + 1);
    }
    const date = new Date(record.timestamp).toISOString().slice(0, 10);
    trendCounts.set(date, (trendCounts.get(date) ?? 0) + 1);
  }

  const checkCount = records.length;
  return {
    checkCount,
    levelDistribution: [...levelCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, count]) => ({ id, count, share: share(count, checkCount) })),
    frequentIndicators: [...indicatorCounts.entries()]
      .sort(([leftId, leftCount], [rightId, rightCount]) =>
        rightCount === leftCount
          ? leftId.localeCompare(rightId)
          : rightCount - leftCount,
      )
      .map(([id, count]) => ({ id, count, share: share(count, checkCount) })),
    trend: [...trendCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, count })),
  };
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function toCsv(report: TenantDocumentCheckReport): string {
  const rows: Array<readonly (string | number)[]> = [
    ["section", "key", "count", "share"],
    ["summary", "checks", report.checkCount ?? 0, ""],
    ...report.levelDistribution.map((bucket) => [
      "level",
      bucket.id,
      bucket.count,
      bucket.share,
    ] as const),
    ...report.frequentIndicators.map((bucket) => [
      "indicator",
      bucket.id,
      bucket.count,
      bucket.share,
    ] as const),
    ...report.trend.map((bucket) => ["trend", bucket.date, bucket.count, ""] as const),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

/**
 * Creates aggregate reporting inside the same dedicated tenant boundary as the
 * document check. The service reads only the existing metadata audit records,
 * suppresses every aggregate below five checks and never emits user ids or
 * document-level rows. CSV export is derived from the same aggregate result.
 */
export function createTenantDocumentCheckReportingService(
  options: TenantDocumentCheckReportingServiceOptions,
) {
  if (!options.tenantId.trim()) {
    throw new Error("Document-check reporting tenant must be configured");
  }

  async function loadReport(
    context: TenantDocumentCheckReportingContext,
  ): Promise<TenantDocumentCheckReport> {
    assertContext(options.tenantId, context);
    const visibility = assertVisibility(await options.visibilitySource.load());
    if (visibility === "private") {
      return suppressedReport(visibility);
    }

    const records = await options.auditSource.list();
    if (records.length < MIN_DOCUMENT_CHECK_REPORTING_COHORT) {
      return suppressedReport(visibility);
    }

    return {
      visibility,
      cohortSuppressed: false,
      ...aggregate(records),
    };
  }

  return {
    loadReport,
    async exportCsv(context: TenantDocumentCheckReportingContext): Promise<string> {
      const report = await loadReport(context);
      if (report.cohortSuppressed) {
        throw new Error("Document-check reporting is suppressed");
      }
      return toCsv(report);
    },
  };
}
