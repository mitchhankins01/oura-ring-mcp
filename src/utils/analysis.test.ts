import { describe, it, expect } from "vitest";
import {
  mean,
  standardDeviation,
  sampleStandardDeviation,
  quantile,
  min,
  max,
  rollingAverages,
  rollingAverage,
  trend,
  detectOutliersIQR,
  detectOutliersZScore,
  detectOutliers,
  correlate,
  dispersion,
  gaussianSmooth,
  movingAverage,
  dayOfWeekAnalysis,
  sleepDebt,
  sleepRegularity,
} from "./analysis.js";

describe("Basic Statistics", () => {
  describe("mean", () => {
    it("calculates mean correctly", () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(mean([10, 20, 30])).toBe(20);
      expect(mean([5])).toBe(5);
    });

    it("handles empty array", () => {
      expect(mean([])).toBe(0);
    });
  });

  describe("standardDeviation", () => {
    it("calculates population std correctly", () => {
      // [1, 2, 3, 4, 5] has std of sqrt(2) ≈ 1.414
      const result = standardDeviation([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(1.414, 2);
    });

    it("returns 0 for single value", () => {
      expect(standardDeviation([5])).toBe(0);
    });

    it("returns 0 for empty array", () => {
      expect(standardDeviation([])).toBe(0);
    });
  });

  describe("sampleStandardDeviation", () => {
    it("uses N-1 denominator", () => {
      // [1, 2, 3, 4, 5] has sample std of sqrt(2.5) ≈ 1.581
      const result = sampleStandardDeviation([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(1.581, 2);
    });

    it("returns 0 for single value", () => {
      expect(sampleStandardDeviation([5])).toBe(0);
    });
  });

  describe("quantile", () => {
    it("calculates quartiles correctly", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(quantile(data, 0.25)).toBeCloseTo(3.25, 1);
      expect(quantile(data, 0.5)).toBeCloseTo(5.5, 1);
      expect(quantile(data, 0.75)).toBeCloseTo(7.75, 1);
    });

    it("handles empty array", () => {
      expect(quantile([], 0.5)).toBe(0);
    });
  });

  describe("min and max", () => {
    it("finds min and max", () => {
      expect(min([5, 2, 8, 1, 9])).toBe(1);
      expect(max([5, 2, 8, 1, 9])).toBe(9);
    });

    it("handles empty arrays", () => {
      expect(min([])).toBe(0);
      expect(max([])).toBe(0);
    });
  });
});

describe("Rolling Averages", () => {
  it("calculates 7/14/30 day rolling averages", () => {
    const data = Array.from({ length: 30 }, (_, i) => i + 1); // 1-30
    const result = rollingAverages(data);

    // Last 7 values: 24-30, mean = 27
    expect(result.day7.value).toBe(27);
    expect(result.day7.count).toBe(7);

    // Last 14 values: 17-30, mean = 23.5
    expect(result.day14.value).toBe(23.5);
    expect(result.day14.count).toBe(14);

    // All 30 values, mean = 15.5
    expect(result.day30.value).toBe(15.5);
    expect(result.day30.count).toBe(30);
  });

  it("handles insufficient data gracefully", () => {
    const data = [1, 2, 3];
    const result = rollingAverages(data);

    expect(result.day7.count).toBe(3);
    expect(result.day7.value).toBe(2);
  });

  it("calculates custom window", () => {
    const data = [1, 2, 3, 4, 5];
    const result = rollingAverage(data, 3);
    expect(result.value).toBe(4); // mean of [3, 4, 5]
    expect(result.count).toBe(3);
  });
});

describe("Trend Detection", () => {
  it("detects positive trend", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = trend(data);

    expect(result.slope).toBeCloseTo(1, 1);
    expect(result.rValue).toBeCloseTo(1, 2);
    expect(result.direction).toBe("improving");
    expect(result.significant).toBe(true);
  });

  it("detects negative trend", () => {
    const data = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const result = trend(data);

    expect(result.slope).toBeCloseTo(-1, 1);
    expect(result.rValue).toBeCloseTo(-1, 2);
    expect(result.direction).toBe("declining");
  });

  it("detects stable trend", () => {
    const data = [50, 50.1, 49.9, 50, 50.2, 49.8, 50.1, 50, 49.9, 50];
    const result = trend(data);

    expect(Math.abs(result.slope)).toBeLessThan(0.1);
    expect(result.direction).toBe("stable");
  });

  it("handles noisy data", () => {
    const data = [1, 3, 2, 4, 3, 5, 4, 6, 5, 7];
    const result = trend(data);

    expect(result.slope).toBeGreaterThan(0);
    expect(result.rValue).toBeGreaterThan(0);
    // Should still detect upward trend
    expect(result.direction).toBe("improving");
  });

  it("handles insufficient data", () => {
    expect(trend([]).direction).toBe("stable");
    expect(trend([5]).direction).toBe("stable");
  });
});

describe("Outlier Detection", () => {
  describe("IQR method", () => {
    it("detects extreme outliers", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
      const result = detectOutliersIQR(data);

      expect(result.outliers.length).toBe(1);
      expect(result.outliers[0].value).toBe(100);
      expect(result.method).toBe("iqr");
    });

    it("returns empty for normal data", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = detectOutliersIQR(data);

      expect(result.outliers.length).toBe(0);
    });

    it("handles small datasets", () => {
      const data = [1, 2, 3];
      const result = detectOutliersIQR(data);

      expect(result.outliers.length).toBe(0);
    });
  });

  describe("Z-score method", () => {
    it("detects outliers beyond threshold", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50];
      const result = detectOutliersZScore(data, 2);

      expect(result.outliers.length).toBe(1);
      expect(result.outliers[0].value).toBe(50);
      expect(result.method).toBe("zscore");
    });

    it("respects custom threshold", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20];

      // With threshold 2, 20 is an outlier
      const strict = detectOutliersZScore(data, 2);
      expect(strict.outliers.length).toBe(1);

      // With threshold 3, 20 might not be
      const lenient = detectOutliersZScore(data, 3);
      expect(lenient.outliers.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Combined detection", () => {
    it("only returns outliers flagged by both methods", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
      const result = detectOutliers(data);

      // 100 should be flagged by both IQR and Z-score
      expect(result.outliers.length).toBe(1);
      expect(result.outliers[0].value).toBe(100);
    });
  });
});

describe("Correlation Analysis", () => {
  it("detects perfect positive correlation", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const result = correlate(x, y);

    expect(result.correlation).toBeCloseTo(1, 2);
    expect(result.strength).toBe("strong");
    expect(result.direction).toBe("positive");
    expect(result.significant).toBe(true);
  });

  it("detects perfect negative correlation", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    const result = correlate(x, y);

    expect(result.correlation).toBeCloseTo(-1, 2);
    expect(result.strength).toBe("strong");
    expect(result.direction).toBe("negative");
  });

  it("detects weak/no correlation", () => {
    // Data designed to have near-zero correlation
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = [3, 1, 4, 1, 5, 9, 2, 6]; // pi digits - essentially random
    const result = correlate(x, y);

    expect(result.strength).not.toBe("strong");
  });

  it("handles insufficient data", () => {
    const result = correlate([1], [2]);
    expect(result.correlation).toBe(0);
    expect(result.n).toBe(1);
  });

  it("handles different length arrays", () => {
    const x = [1, 2, 3, 4, 5, 6, 7];
    const y = [2, 4, 6];
    const result = correlate(x, y);

    expect(result.n).toBe(3);
  });
});

describe("Dispersion Analysis", () => {
  it("calculates all metrics correctly", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = dispersion(data);

    expect(result.mean).toBe(5.5);
    expect(result.min).toBe(1);
    expect(result.max).toBe(10);
    expect(result.range).toBe(9);
    expect(result.median).toBeCloseTo(5.5, 1);
  });

  it("calculates coefficient of variation", () => {
    const data = [10, 10, 10, 10, 10];
    const result = dispersion(data);

    expect(result.coefficientOfVariation).toBe(0); // no variation
  });

  it("handles empty array", () => {
    const result = dispersion([]);
    expect(result.mean).toBe(0);
    expect(result.coefficientOfVariation).toBe(0);
  });
});

describe("Smoothing", () => {
  describe("gaussianSmooth", () => {
    it("smooths data", () => {
      const data = [1, 10, 1, 10, 1, 10, 1]; // jagged
      const smoothed = gaussianSmooth(data, 1);

      // Smoothed values should be less extreme
      const originalRange = max(data) - min(data);
      const smoothedRange = max(smoothed) - min(smoothed);
      expect(smoothedRange).toBeLessThan(originalRange);
    });

    it("returns original for sigma 0", () => {
      const data = [1, 2, 3];
      expect(gaussianSmooth(data, 0)).toEqual(data);
    });

    it("handles empty array", () => {
      expect(gaussianSmooth([], 1)).toEqual([]);
    });
  });

  describe("movingAverage", () => {
    it("smooths with window", () => {
      const data = [1, 2, 3, 4, 5];
      const smoothed = movingAverage(data, 3);

      expect(smoothed.length).toBe(5);
      expect(smoothed[2]).toBe(3); // mean of [2, 3, 4]
    });

    it("handles window larger than data", () => {
      const data = [1, 2, 3];
      const smoothed = movingAverage(data, 10);

      expect(smoothed.length).toBe(3);
    });
  });
});

describe("Day of Week Analysis", () => {
  it("calculates day averages", () => {
    const data = [
      { date: "2024-01-01", value: 80 }, // Monday
      { date: "2024-01-08", value: 90 }, // Monday
      { date: "2024-01-02", value: 70 }, // Tuesday
      { date: "2024-01-06", value: 60 }, // Saturday
    ];
    const result = dayOfWeekAnalysis(data);

    expect(result.dayAverages.Monday).toBe(85);
    expect(result.dayAverages.Tuesday).toBe(70);
    expect(result.dayAverages.Saturday).toBe(60);
    expect(result.dayCount.Monday).toBe(2);
  });

  it("identifies best and worst days", () => {
    const data = [
      { date: "2024-01-01", value: 90 }, // Monday
      { date: "2024-01-02", value: 50 }, // Tuesday
    ];
    const result = dayOfWeekAnalysis(data);

    expect(result.bestDay.day).toBe("Monday");
    expect(result.worstDay.day).toBe("Tuesday");
  });

  it("calculates weekday vs weekend", () => {
    const data = [
      { date: "2024-01-01", value: 80 }, // Monday
      { date: "2024-01-02", value: 80 }, // Tuesday
      { date: "2024-01-06", value: 60 }, // Saturday
      { date: "2024-01-07", value: 60 }, // Sunday
    ];
    const result = dayOfWeekAnalysis(data);

    expect(result.weekdayAverage).toBe(80);
    expect(result.weekendAverage).toBe(60);
  });
});

describe("Sleep-Specific Metrics", () => {
  describe("sleepDebt", () => {
    it("calculates debt when undersleeping", () => {
      // 6 hours per night in seconds
      const durations = [21600, 21600, 21600];
      const result = sleepDebt(durations, 8);

      expect(result.actualHours).toBe(6);
      expect(result.debtHours).toBe(2);
      expect(result.status).toBe("significant_debt");
    });

    it("detects surplus when oversleeping", () => {
      // 9 hours per night in seconds
      const durations = [32400, 32400, 32400];
      const result = sleepDebt(durations, 8);

      expect(result.actualHours).toBe(9);
      expect(result.debtHours).toBe(-1);
      expect(result.status).toBe("surplus");
    });

    it("shows balanced when near target", () => {
      // 8 hours per night
      const durations = [28800, 28800, 28800];
      const result = sleepDebt(durations, 8);

      expect(result.status).toBe("balanced");
    });
  });

  describe("sleepRegularity", () => {
    it("scores high for consistent times", () => {
      const bedtimes = [
        "2024-01-01T22:00:00Z",
        "2024-01-02T22:15:00Z",
        "2024-01-03T21:45:00Z",
        "2024-01-04T22:00:00Z",
      ];
      const waketimes = [
        "2024-01-02T06:00:00Z",
        "2024-01-03T06:15:00Z",
        "2024-01-04T05:45:00Z",
        "2024-01-05T06:00:00Z",
      ];
      const result = sleepRegularity(bedtimes, waketimes);

      expect(result.regularityScore).toBeGreaterThan(70);
      expect(result.status).toBe("very_regular");
    });

    it("scores low for inconsistent times", () => {
      const bedtimes = [
        "2024-01-01T20:00:00Z",
        "2024-01-02T01:00:00Z", // next day
        "2024-01-03T22:00:00Z",
        "2024-01-04T02:00:00Z", // next day
      ];
      const waketimes = [
        "2024-01-02T04:00:00Z",
        "2024-01-03T10:00:00Z",
        "2024-01-04T06:00:00Z",
        "2024-01-05T11:00:00Z",
      ];
      const result = sleepRegularity(bedtimes, waketimes);

      expect(result.regularityScore).toBeLessThan(60);
    });
  });
});

describe("Edge Cases", () => {
  it("handles all zeros", () => {
    const data = [0, 0, 0, 0, 0];
    expect(mean(data)).toBe(0);
    expect(standardDeviation(data)).toBe(0);
    expect(trend(data).slope).toBe(0);
  });

  it("handles negative values", () => {
    const data = [-5, -3, -1, 1, 3, 5];
    expect(mean(data)).toBe(0);
    expect(trend(data).slope).toBeGreaterThan(0);
  });

  it("handles very large values", () => {
    const data = [1e10, 2e10, 3e10];
    expect(mean(data)).toBe(2e10);
    expect(trend(data).direction).toBe("improving");
  });
});
