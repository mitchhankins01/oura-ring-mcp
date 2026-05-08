export type CoverageStatus = "available" | "sparse" | "missing" | "errored";
export type CoverageKind = "daily" | "event";

export interface CoverageSummaryInput {
  label: string;
  tool: string;
  kind: CoverageKind;
  expectedDays: number;
  recordCount: number;
  uniqueDays?: number;
  minCoverage?: number;
  minRecords?: number;
  error?: unknown;
}

export interface CoverageSummary {
  label: string;
  tool: string;
  status: CoverageStatus;
  recordCount: number;
  uniqueDays?: number;
  coveragePercent?: number;
  note: string;
}

export function normalizeCoverageDays(days: unknown): number {
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
    return 30;
  }

  return Math.min(90, Math.max(1, Math.floor(days)));
}

export function uniqueRecordDays<T>(
  records: T[],
  getDay: (record: T) => string | null | undefined
): number {
  const days = new Set<string>();

  for (const record of records) {
    const day = getDay(record);
    if (day) {
      days.add(day);
    }
  }

  return days.size;
}

export function summarizeCoverage(input: CoverageSummaryInput): CoverageSummary {
  if (input.error !== undefined) {
    return {
      label: input.label,
      tool: input.tool,
      status: "errored",
      recordCount: 0,
      note: errorMessage(input.error),
    };
  }

  if (input.recordCount === 0) {
    return {
      label: input.label,
      tool: input.tool,
      status: "missing",
      recordCount: 0,
      uniqueDays: input.uniqueDays ?? 0,
      coveragePercent: input.kind === "daily" ? 0 : undefined,
      note: "0 records",
    };
  }

  if (input.kind === "event") {
    const minRecords = input.minRecords ?? 3;
    return {
      label: input.label,
      tool: input.tool,
      status: input.recordCount >= minRecords ? "available" : "sparse",
      recordCount: input.recordCount,
      uniqueDays: input.uniqueDays,
      note: `${input.recordCount} ${pluralize("record", input.recordCount)}`,
    };
  }

  const uniqueDays = input.uniqueDays ?? input.recordCount;
  const coveragePercent = Math.min(100, Math.round((uniqueDays / input.expectedDays) * 100));
  const minCoverage = input.minCoverage ?? 0.7;

  return {
    label: input.label,
    tool: input.tool,
    status: coveragePercent >= minCoverage * 100 ? "available" : "sparse",
    recordCount: input.recordCount,
    uniqueDays,
    coveragePercent,
    note: `${uniqueDays}/${input.expectedDays} ${pluralize("day", input.expectedDays)}`,
  };
}

export function formatDataCoverageReport(params: {
  days: number;
  startDate: string;
  endDate: string;
  summaries: CoverageSummary[];
}): string {
  const counts = countStatuses(params.summaries);
  const usefulTools = params.summaries
    .filter((summary) => summary.status === "available")
    .map((summary) => `\`${summary.tool}\``);
  const sparseTools = params.summaries
    .filter((summary) => summary.status === "sparse")
    .map((summary) => `\`${summary.tool}\``);

  const lines = [
    `## Data Coverage (${params.days} days)`,
    "",
    `**Range:** ${params.startDate} to ${params.endDate}`,
    "",
    "| Domain | Status | Coverage | Next tool |",
    "|--------|--------|----------|-----------|",
  ];

  for (const summary of params.summaries) {
    lines.push(
      `| ${summary.label} | ${summary.status} | ${summary.note} | \`${summary.tool}\` |`
    );
  }

  lines.push("");
  lines.push(
    `**Summary:** ${counts.available} available, ${counts.sparse} sparse, ${counts.missing} missing, ${counts.errored} errored.`
  );

  if (usefulTools.length > 0) {
    lines.push(`**Likely useful next:** ${usefulTools.join(", ")}`);
  }

  if (sparseTools.length > 0) {
    lines.push(`**Use only for targeted questions:** ${sparseTools.join(", ")}`);
  }

  const errored = params.summaries.filter((summary) => summary.status === "errored");
  if (errored.length > 0) {
    lines.push("");
    lines.push("**Endpoint errors:**");
    for (const summary of errored) {
      lines.push(`- ${summary.label}: ${summary.note}`);
    }
  }

  return lines.join("\n");
}

function countStatuses(summaries: CoverageSummary[]): Record<CoverageStatus, number> {
  return summaries.reduce<Record<CoverageStatus, number>>(
    (counts, summary) => {
      counts[summary.status]++;
      return counts;
    },
    { available: 0, sparse: 0, missing: 0, errored: 0 }
  );
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Request failed";
  return message.length > 80 ? `${message.slice(0, 77)}...` : message;
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}
