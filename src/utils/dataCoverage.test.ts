import { describe, it, expect } from "vitest";
import {
  formatDataCoverageReport,
  normalizeCoverageDays,
  summarizeCoverage,
  uniqueRecordDays,
} from "./dataCoverage.js";

describe("normalizeCoverageDays", () => {
  it("defaults to 30 days when input is missing or invalid", () => {
    expect(normalizeCoverageDays(undefined)).toBe(30);
    expect(normalizeCoverageDays("30")).toBe(30);
    expect(normalizeCoverageDays(0)).toBe(30);
    expect(normalizeCoverageDays(-7)).toBe(30);
  });

  it("floors fractional days and caps at 90", () => {
    expect(normalizeCoverageDays(14.9)).toBe(14);
    expect(normalizeCoverageDays(120)).toBe(90);
  });
});

describe("uniqueRecordDays", () => {
  it("counts unique days from records", () => {
    const records = [
      { day: "2024-01-01" },
      { day: "2024-01-01" },
      { day: "2024-01-02" },
      { day: null },
    ];

    expect(uniqueRecordDays(records, (record) => record.day)).toBe(2);
  });
});

describe("summarizeCoverage", () => {
  it("marks daily domains available when day coverage is high enough", () => {
    const summary = summarizeCoverage({
      label: "Daily sleep",
      tool: "get_daily_sleep",
      kind: "daily",
      expectedDays: 30,
      recordCount: 24,
      uniqueDays: 24,
    });

    expect(summary.status).toBe("available");
    expect(summary.coveragePercent).toBe(80);
    expect(summary.note).toBe("24/30 days");
  });

  it("marks daily domains sparse when records exist below the threshold", () => {
    const summary = summarizeCoverage({
      label: "Readiness",
      tool: "get_readiness",
      kind: "daily",
      expectedDays: 30,
      recordCount: 8,
      uniqueDays: 8,
    });

    expect(summary.status).toBe("sparse");
    expect(summary.note).toBe("8/30 days");
  });

  it("marks event domains sparse until they meet the record threshold", () => {
    const summary = summarizeCoverage({
      label: "Workouts",
      tool: "get_workouts",
      kind: "event",
      expectedDays: 30,
      recordCount: 2,
      uniqueDays: 2,
      minRecords: 3,
    });

    expect(summary.status).toBe("sparse");
    expect(summary.note).toBe("2 records");
  });

  it("marks event domains available when they meet the record threshold", () => {
    const summary = summarizeCoverage({
      label: "Rest mode",
      tool: "get_rest_mode",
      kind: "event",
      expectedDays: 30,
      recordCount: 1,
      uniqueDays: 1,
      minRecords: 1,
    });

    expect(summary.status).toBe("available");
    expect(summary.note).toBe("1 record");
  });

  it("marks empty domains missing", () => {
    const summary = summarizeCoverage({
      label: "SpO2",
      tool: "get_spo2",
      kind: "daily",
      expectedDays: 30,
      recordCount: 0,
      uniqueDays: 0,
    });

    expect(summary.status).toBe("missing");
    expect(summary.note).toBe("0 records");
  });

  it("marks failed domains errored without throwing", () => {
    const summary = summarizeCoverage({
      label: "Stress",
      tool: "get_stress",
      kind: "daily",
      expectedDays: 30,
      recordCount: 0,
      error: new Error("Stress API unavailable"),
    });

    expect(summary.status).toBe("errored");
    expect(summary.note).toBe("Stress API unavailable");
  });
});

describe("formatDataCoverageReport", () => {
  it("formats a compact markdown report", () => {
    const report = formatDataCoverageReport({
      days: 30,
      startDate: "2023-12-17",
      endDate: "2024-01-15",
      summaries: [
        {
          label: "Sleep",
          tool: "get_sleep",
          status: "available",
          recordCount: 27,
          uniqueDays: 27,
          coveragePercent: 90,
          note: "27/30 days",
        },
        {
          label: "Workouts",
          tool: "get_workouts",
          status: "sparse",
          recordCount: 2,
          uniqueDays: 2,
          note: "2 records",
        },
        {
          label: "Stress",
          tool: "get_stress",
          status: "errored",
          recordCount: 0,
          note: "Stress API unavailable",
        },
      ],
    });

    expect(report).toContain("## Data Coverage (30 days)");
    expect(report).toContain("| Sleep | available | 27/30 days | `get_sleep` |");
    expect(report).toContain("1 available, 1 sparse, 0 missing, 1 errored");
    expect(report).toContain("**Likely useful next:** `get_sleep`");
    expect(report).toContain("**Use only for targeted questions:** `get_workouts`");
    expect(report).toContain("- Stress: Stress API unavailable");
  });
});
