import { util } from "@aws-appsync/utils";

const PRINTABLE_ASCII =
  " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
  "abcdefghijklmnopqrstuvwxyz{|}~";
const SAFE_FILENAME_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0)
    util.unauthorized();
  const groups = identity.groups || [];
  let tenantId = null;
  for (const group of groups) {
    if (typeof group === "string" && group.startsWith("tenant:")) {
      const candidate = group.slice("tenant:".length);
      if (candidate.length === 0) util.error("Invalid tenant membership", "TenantMembershipError");
      if (tenantId !== null && tenantId !== candidate) {
        util.error(
          "Multiple tenant memberships require explicit tenant selection",
          "TenantMembershipError",
        );
      }
      tenantId = candidate;
    }
  }
  return { userId: identity.sub, storageTenantId: tenantId || `personal:${identity.sub}` };
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    util.error(`${field} is required`, "AttestationExportError");
  }
  return value;
}

function format(value) {
  if (value !== "PDF" && value !== "CSV") {
    util.error("format must be PDF or CSV", "AttestationExportError");
  }
  return value;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : `${value}`;
  return `"${text.split('"').join('""')}"`;
}

function signingColumns(row) {
  return [row.signingStatus, row.signingAlgorithm, row.signingKeyId, row.signature];
}

function csvContent(row, expired) {
  const headers = [
    "attestation_id",
    "tenant_id",
    "user_id",
    "scenario_id",
    "scenario_version",
    "product_id",
    "product_version",
    "learning_objective_ids",
    "issued_at_epoch_ms",
    "valid_until_epoch_ms",
    "validity_status",
    "recertification_recommended",
    "scenario_run_id",
    "session_id",
    "source_revision",
    "evidence_json",
    "provenance_json",
    "signing_status",
    "signing_algorithm",
    "signing_key_id",
    "signature",
  ];
  const values = [
    row.id,
    row.tenantId,
    row.userId,
    row.scenarioId,
    row.scenarioVersion,
    row.productId,
    row.productVersion,
    (row.learningObjectiveIds || []).join("|"),
    row.issuedAt,
    row.validUntil,
    expired ? "expired" : "valid",
    expired,
    row.scenarioRunId,
    row.sessionId,
    row.sourceRevision,
    JSON.stringify(row.evidence),
    JSON.stringify(row.provenance),
    ...signingColumns(row),
  ];
  return `${headers.map(csvCell).join(",")}\r\n${values.map(csvCell).join(",")}\r\n`;
}

function ascii(value) {
  const text = `${value}`;
  let result = "";
  for (const char of text) {
    result += PRINTABLE_ASCII.indexOf(char) >= 0 ? char : "?";
  }
  return result;
}

function pdfText(value) {
  return ascii(value).split("\\").join("\\\\").split("(").join("\\(").split(")").join("\\)");
}

function pdfLines(row, expired) {
  const objectiveIds = row.learningObjectiveIds || [];
  const signatureText =
    row.signingStatus === "signed"
      ? `${row.signingAlgorithm || "unknown"} / ${row.signingKeyId || "unknown"}`
      : "External cryptographic signature required";
  return [
    "Kompetenznachweis / Competence Attestation",
    `Attestation: ${row.id}`,
    `User: ${row.userId}`,
    `Tenant: ${row.tenantId}`,
    `Scenario: ${row.scenarioId}`,
    `Scenario version: ${row.scenarioVersion}`,
    `Product: ${row.productId} ${row.productVersion}`,
    `Issued at (epoch ms): ${row.issuedAt}`,
    `Valid until (epoch ms): ${row.validUntil}`,
    `Status: ${expired ? "EXPIRED - recertification recommended" : "VALID"}`,
    `Evidence run: ${row.scenarioRunId}`,
    `Session: ${row.sessionId}`,
    `Source revision: ${row.sourceRevision}`,
    `Evidence status: ${row.evidence && row.evidence.evidenceStatus}`,
    `Signature status: ${signatureText}`,
    "Learning objectives:",
    ...objectiveIds.map((objectiveId) => `- ${objectiveId}`),
  ];
}

function pdfStream(lines) {
  const commands = ["BT", "/F1 15 Tf", "72 760 Td"];
  let index = 0;
  for (const line of lines) {
    if (index === 1) commands.push("/F1 10 Tf");
    commands.push(`(${pdfText(line)}) Tj`);
    commands.push("0 -22 Td");
    index += 1;
  }
  commands.push("ET");
  return commands.join("\n");
}

function pad10(value) {
  return `0000000000${value}`.slice(-10);
}

function pdfContent(row, expired) {
  const stream = pdfStream(pdfLines(row, expired));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  let objectNumber = 1;
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${objectNumber} 0 obj\n${object}\nendobj\n`;
    objectNumber += 1;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${pad10(offset)} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function safeFilename(value) {
  const source = ascii(value);
  let result = "";
  for (const char of source) {
    result += SAFE_FILENAME_CHARS.indexOf(char) >= 0 ? char : "-";
  }
  return result.length > 0 ? result : "attestation";
}

export function request(ctx) {
  const subject = caller(ctx);
  const attestationId = requiredString(ctx.args.attestationId, "attestationId");
  ctx.stash.attestationExportSubject = subject;
  ctx.stash.attestationExportFormat = format(ctx.args.format);
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({ id: attestationId }),
    consistentRead: true,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type, ctx.result);
  const row = ctx.result;
  if (!row) util.error("Attestation not found", "AttestationNotFoundError");
  const subject = ctx.stash.attestationExportSubject;
  if (row.tenantId !== subject.storageTenantId || row.userId !== subject.userId) {
    util.unauthorized();
  }

  const expired = util.time.nowEpochMilliSeconds() >= row.validUntil;
  const exportFormat = ctx.stash.attestationExportFormat;
  const content = exportFormat === "CSV" ? csvContent(row, expired) : pdfContent(row, expired);
  const extension = exportFormat === "CSV" ? "csv" : "pdf";
  return {
    attestationId: row.id,
    format: exportFormat,
    filename: `competence-attestation-${safeFilename(row.scenarioId)}-${safeFilename(row.scenarioVersion)}.${extension}`,
    mimeType: exportFormat === "CSV" ? "text/csv;charset=utf-8" : "application/pdf",
    contentBase64: util.base64Encode(content),
    signingStatus: row.signingStatus,
    signingAlgorithm: row.signingAlgorithm,
    signingKeyId: row.signingKeyId,
    signature: row.signature,
  };
}
