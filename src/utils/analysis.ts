/**
 * Statistical analysis utilities for Oura data
 * Inspired by Stanford Wearipedia notebook patterns
 */

// ============================================================================
// Basic Statistics
// ============================================================================

/**
 * Calculate the mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers
 * Uses population standard deviation (N) for consistency with scipy.stats
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Calculate sample standard deviation (N-1 denominator)
 * Use for small samples when estimating population std
 */
export function sampleStandardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Calculate quantiles (0-1 range)
 * e.g., quantile(arr, 0.25) for Q1, quantile(arr, 0.75) for Q3
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Calculate min value
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Calculate max value
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

// ============================================================================
// Rolling Averages
// ============================================================================

export interface RollingAverageResult {
  value: number;
  window: number;
  count: number; // actual data points in window (may be less if insufficient data)
}

/**
 * Calculate rolling averages for multiple windows
 * Returns averages for 7-day, 14-day, and 30-day windows
 *
 * @param values - Array of values (most recent last)
 * @returns Object with rolling averages for each window size
 */
export function rollingAverages(values: number[]): {
  day7: RollingAverageResult;
  day14: RollingAverageResult;
  day30: RollingAverageResult;
} {
  const calc = (window: number): RollingAverageResult => {
    const slice = values.slice(-window);
    return {
      value: mean(slice),
      window,
      count: slice.length,
    };
  };

  return {
    day7: calc(7),
    day14: calc(14),
    day30: calc(30),
  };
}

/**
 * Calculate a single rolling average for a custom window
 */
export function rollingAverage(values: number[], window: number): RollingAverageResult {
  const slice = values.slice(-window);
  return {
    value: mean(slice),
    window,
    count: slice.length,
  };
}

// ============================================================================
// Trend Detection (Linear Regression)
// ============================================================================

export interface TrendResult {
  slope: number; // change per day
  intercept: number;
  rValue: number; // correlation coefficient (-1 to 1)
  rSquared: number; // coefficient of determination (0 to 1)
  pValue: number; // statistical significance
  standardError: number;
  direction: "improving" | "declining" | "stable";
  significant: boolean; // p < 0.05
}

/**
 * Calculate linear regression trend
 * Uses least squares method, returns slope, r-value, and p-value
 *
 * @param values - Array of values (index = x, value = y)
 * @returns Trend analysis result
 */
export function trend(values: number[]): TrendResult {
  if (values.length < 2) {
    return {
      slope: 0,
      intercept: values[0] || 0,
      rValue: 0,
      rSquared: 0,
      pValue: 1,
      standardError: 0,
      direction: "stable",
      significant: false,
    };
  }

  const n = values.length;
  const x = values.map((_, i) => i);
  const y = values;

  const xMean = mean(x);
  const yMean = mean(y);

  // Calculate slope and intercept
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;

  // Calculate R-value (correlation coefficient)
  const xStd = standardDeviation(x);
  const yStd = standardDeviation(y);
  const rValue = xStd !== 0 && yStd !== 0 ? numerator / (n * xStd * yStd) : 0;
  const rSquared = rValue * rValue;

  // Calculate standard error of the slope
  const predicted = x.map((xi) => slope * xi + intercept);
  const residuals = y.map((yi, i) => yi - predicted[i]);
  const residualSS = residuals.reduce((sum, r) => sum + r * r, 0);
  const residualStd = n > 2 ? Math.sqrt(residualSS / (n - 2)) : 0;
  const standardError = denominator !== 0 ? residualStd / Math.sqrt(denominator) : 0;

  // Calculate p-value using t-distribution approximation
  // For perfect linear relationship (r = ±1), p-value is essentially 0
  let pValue: number;
  if (Math.abs(rValue) >= 0.9999) {
    pValue = 0;
  } else if (standardError === 0) {
    pValue = 1;
  } else {
    const tStat = Math.abs(slope / standardError);
    pValue = tDistributionPValue(tStat, n - 2);
  }

  // Determine direction (consider slope relative to mean)
  const slopePercentOfMean = yMean !== 0 ? (slope / yMean) * 100 : 0;
  let direction: "improving" | "declining" | "stable";
  if (Math.abs(slopePercentOfMean) < 0.5) {
    direction = "stable";
  } else {
    direction = slope > 0 ? "improving" : "declining";
  }

  return {
    slope,
    intercept,
    rValue,
    rSquared,
    pValue,
    standardError,
    direction,
    significant: pValue < 0.05,
  };
}

/**
 * Approximate p-value for two-tailed t-test
 * Uses a rational approximation that's accurate for df > 1
 */
function tDistributionPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  if (t === 0) return 1;

  // Use approximation based on regularized incomplete beta function
  const x = df / (df + t * t);

  // For large df, use normal approximation
  if (df > 100) {
    const z = Math.abs(t);
    // Standard normal CDF approximation
    const p = 0.5 * (1 + erf(z / Math.sqrt(2)));
    return 2 * (1 - p);
  }

  // Regularized incomplete beta function approximation
  const a = df / 2;
  const b = 0.5;
  const beta = incompleteBeta(x, a, b);

  return beta;
}

/**
 * Error function approximation (Horner form)
 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Incomplete beta function approximation
 * Uses continued fraction expansion
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use the symmetry relation if needed for better convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's algorithm for continued fraction
  const eps = 1e-10;
  const maxIter = 200;

  let f = 1;
  let c = 1;
  let d = 0;

  for (let m = 0; m <= maxIter; m++) {
    const m2 = 2 * m;

    // Even step
    let aa =
      m === 0 ? 1 : (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;

    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;

    f *= c * d;

    // Odd step
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));

    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;

    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;

    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return front * f;
}

/**
 * Log gamma function approximation (Lanczos)
 */
function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;

  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ============================================================================
// Outlier Detection
// ============================================================================

export interface OutlierResult {
  outliers: Array<{ index: number; value: number }>;
  lowerBound: number;
  upperBound: number;
  method: "iqr" | "zscore";
}

/**
 * Detect outliers using the IQR method
 * Values outside Q1 - 1.5*IQR or Q3 + 1.5*IQR are outliers
 *
 * @param values - Array of numeric values
 * @param multiplier - IQR multiplier (default 1.5, use 3 for extreme outliers)
 */
export function detectOutliersIQR(values: number[], multiplier = 1.5): OutlierResult {
  if (values.length < 4) {
    return {
      outliers: [],
      lowerBound: min(values),
      upperBound: max(values),
      method: "iqr",
    };
  }

  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  const outliers: Array<{ index: number; value: number }> = [];
  values.forEach((value, index) => {
    if (value < lowerBound || value > upperBound) {
      outliers.push({ index, value });
    }
  });

  return { outliers, lowerBound, upperBound, method: "iqr" };
}

/**
 * Detect outliers using Z-score method
 * Values with |z| > threshold are outliers
 *
 * @param values - Array of numeric values
 * @param threshold - Z-score threshold (default 2)
 */
export function detectOutliersZScore(values: number[], threshold = 2): OutlierResult {
  if (values.length < 2) {
    return {
      outliers: [],
      lowerBound: min(values),
      upperBound: max(values),
      method: "zscore",
    };
  }

  const avg = mean(values);
  const std = standardDeviation(values);

  if (std === 0) {
    return {
      outliers: [],
      lowerBound: avg,
      upperBound: avg,
      method: "zscore",
    };
  }

  const lowerBound = avg - threshold * std;
  const upperBound = avg + threshold * std;

  const outliers: Array<{ index: number; value: number }> = [];
  values.forEach((value, index) => {
    const zScore = Math.abs((value - avg) / std);
    if (zScore > threshold) {
      outliers.push({ index, value });
    }
  });

  return { outliers, lowerBound, upperBound, method: "zscore" };
}

/**
 * Combined outlier detection using both IQR and Z-score
 * Returns outliers flagged by both methods (more conservative)
 */
export function detectOutliers(
  values: number[],
  options: { iqrMultiplier?: number; zScoreThreshold?: number } = {}
): OutlierResult {
  const { iqrMultiplier = 1.5, zScoreThreshold = 2 } = options;

  const iqrResult = detectOutliersIQR(values, iqrMultiplier);
  const zResult = detectOutliersZScore(values, zScoreThreshold);

  // Find outliers flagged by both methods
  const iqrIndices = new Set(iqrResult.outliers.map((o) => o.index));
  const combinedOutliers = zResult.outliers.filter((o) => iqrIndices.has(o.index));

  return {
    outliers: combinedOutliers,
    lowerBound: Math.max(iqrResult.lowerBound, zResult.lowerBound),
    upperBound: Math.min(iqrResult.upperBound, zResult.upperBound),
    method: "iqr", // Combined uses both, but we mark as IQR for primary
  };
}

// ============================================================================
// Correlation Analysis
// ============================================================================

export interface CorrelationResult {
  correlation: number; // Pearson correlation coefficient (-1 to 1)
  pValue: number; // Statistical significance
  significant: boolean; // p < 0.05
  strength: "none" | "weak" | "moderate" | "strong";
  direction: "positive" | "negative" | "none";
  n: number; // Sample size
}

/**
 * Calculate Pearson correlation between two arrays
 * Includes p-value for statistical significance
 *
 * @param x - First array of values
 * @param y - Second array of values
 */
export function correlate(x: number[], y: number[]): CorrelationResult {
  const n = Math.min(x.length, y.length);

  if (n < 3) {
    return {
      correlation: 0,
      pValue: 1,
      significant: false,
      strength: "none",
      direction: "none",
      n,
    };
  }

  // Trim to same length
  const xTrim = x.slice(0, n);
  const yTrim = y.slice(0, n);

  const xMean = mean(xTrim);
  const yMean = mean(yTrim);

  let numerator = 0;
  let xSS = 0;
  let ySS = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = xTrim[i] - xMean;
    const yDiff = yTrim[i] - yMean;
    numerator += xDiff * yDiff;
    xSS += xDiff * xDiff;
    ySS += yDiff * yDiff;
  }

  const denominator = Math.sqrt(xSS * ySS);
  const r = denominator !== 0 ? numerator / denominator : 0;

  // Calculate p-value using t-distribution
  // For perfect correlation (r = ±1), p-value is essentially 0
  let pValue: number;
  if (Math.abs(r) >= 0.9999) {
    pValue = 0;
  } else {
    const tStat = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
    pValue = tDistributionPValue(Math.abs(tStat), n - 2);
  }

  // Determine strength
  const absR = Math.abs(r);
  let strength: "none" | "weak" | "moderate" | "strong";
  if (absR < 0.1) strength = "none";
  else if (absR < 0.3) strength = "weak";
  else if (absR < 0.5) strength = "moderate";
  else strength = "strong";

  return {
    correlation: r,
    pValue,
    significant: pValue < 0.05,
    strength,
    direction: r > 0.1 ? "positive" : r < -0.1 ? "negative" : "none",
    n,
  };
}

// ============================================================================
// Dispersion Analysis
// ============================================================================

export interface DispersionResult {
  mean: number;
  standardDeviation: number;
  coefficientOfVariation: number; // CV = std/mean (as percentage)
  min: number;
  max: number;
  range: number;
  q1: number;
  median: number;
  q3: number;
  iqr: number;
}

/**
 * Calculate dispersion/variability metrics
 * Coefficient of variation (CV) is useful for comparing variability across different metrics
 *
 * @param values - Array of numeric values
 */
export function dispersion(values: number[]): DispersionResult {
  if (values.length === 0) {
    return {
      mean: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      min: 0,
      max: 0,
      range: 0,
      q1: 0,
      median: 0,
      q3: 0,
      iqr: 0,
    };
  }

  const avg = mean(values);
  const std = standardDeviation(values);
  const minVal = min(values);
  const maxVal = max(values);
  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);

  return {
    mean: avg,
    standardDeviation: std,
    coefficientOfVariation: avg !== 0 ? (std / avg) * 100 : 0,
    min: minVal,
    max: maxVal,
    range: maxVal - minVal,
    q1,
    median,
    q3,
    iqr: q3 - q1,
  };
}

// ============================================================================
// Smoothing (for visualization)
// ============================================================================

/**
 * Apply Gaussian smoothing to a time series
 * Useful for visualization to reduce noise
 *
 * @param values - Array of numeric values
 * @param sigma - Standard deviation of Gaussian kernel (higher = smoother)
 */
export function gaussianSmooth(values: number[], sigma: number): number[] {
  if (values.length === 0 || sigma <= 0) return [...values];

  // Calculate kernel size (3 sigma each side)
  const kernelRadius = Math.ceil(sigma * 3);
  const kernelSize = kernelRadius * 2 + 1;

  // Generate Gaussian kernel
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let i = -kernelRadius; i <= kernelRadius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    kernelSum += weight;
  }
  // Normalize kernel
  const normalizedKernel = kernel.map((k) => k / kernelSum);

  // Apply convolution with edge handling (reflect)
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let smoothedValue = 0;
    for (let j = 0; j < kernelSize; j++) {
      const dataIndex = i + j - kernelRadius;
      // Reflect at edges
      const clampedIndex = Math.max(0, Math.min(values.length - 1, dataIndex));
      smoothedValue += values[clampedIndex] * normalizedKernel[j];
    }
    result.push(smoothedValue);
  }

  return result;
}

/**
 * Simple moving average smoothing
 *
 * @param values - Array of numeric values
 * @param window - Window size for averaging
 */
export function movingAverage(values: number[], window: number): number[] {
  if (values.length === 0 || window <= 1) return [...values];

  const halfWindow = Math.floor(window / 2);
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(values.length, i + halfWindow + 1);
    const slice = values.slice(start, end);
    result.push(mean(slice));
  }

  return result;
}

// ============================================================================
// Day-of-Week Analysis
// ============================================================================

export interface DayOfWeekResult {
  dayAverages: Record<string, number>;
  dayCount: Record<string, number>;
  bestDay: { day: string; average: number };
  worstDay: { day: string; average: number };
  weekdayAverage: number;
  weekendAverage: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Analyze patterns by day of week
 *
 * @param data - Array of { date: string, value: number } objects
 */
export function dayOfWeekAnalysis(
  data: Array<{ date: string; value: number }>
): DayOfWeekResult {
  const dayTotals: Record<string, number[]> = {
    Sunday: [],
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
  };

  for (const { date, value } of data) {
    const dayIndex = new Date(date).getDay();
    const dayName = DAY_NAMES[dayIndex];
    dayTotals[dayName].push(value);
  }

  const dayAverages: Record<string, number> = {};
  const dayCount: Record<string, number> = {};
  let bestDay = { day: "", average: -Infinity };
  let worstDay = { day: "", average: Infinity };

  for (const day of DAY_NAMES) {
    const avg = mean(dayTotals[day]);
    dayAverages[day] = avg;
    dayCount[day] = dayTotals[day].length;

    if (dayTotals[day].length > 0) {
      if (avg > bestDay.average) {
        bestDay = { day, average: avg };
      }
      if (avg < worstDay.average) {
        worstDay = { day, average: avg };
      }
    }
  }

  // Weekday vs weekend
  const weekdayValues = [
    ...dayTotals.Monday,
    ...dayTotals.Tuesday,
    ...dayTotals.Wednesday,
    ...dayTotals.Thursday,
    ...dayTotals.Friday,
  ];
  const weekendValues = [...dayTotals.Saturday, ...dayTotals.Sunday];

  return {
    dayAverages,
    dayCount,
    bestDay: bestDay.day ? bestDay : { day: "N/A", average: 0 },
    worstDay: worstDay.day ? worstDay : { day: "N/A", average: 0 },
    weekdayAverage: mean(weekdayValues),
    weekendAverage: mean(weekendValues),
  };
}

// ============================================================================
// Sleep-Specific Metrics
// ============================================================================

export interface SleepDebtResult {
  targetHours: number;
  actualHours: number;
  debtHours: number; // negative = sleep surplus
  debtPercentage: number;
  status: "surplus" | "balanced" | "mild_debt" | "significant_debt";
}

/**
 * Calculate sleep debt against a target (default 8 hours)
 *
 * @param sleepDurations - Array of sleep durations in seconds
 * @param targetHours - Target sleep hours per night (default 8)
 */
export function sleepDebt(sleepDurations: number[], targetHours = 8): SleepDebtResult {
  const actualHours = mean(sleepDurations) / 3600;
  const debtHours = targetHours - actualHours;
  const debtPercentage = ((targetHours - actualHours) / targetHours) * 100;

  let status: "surplus" | "balanced" | "mild_debt" | "significant_debt";
  if (debtHours <= -0.5) status = "surplus";
  else if (debtHours < 0.5) status = "balanced";
  else if (debtHours < 1.5) status = "mild_debt";
  else status = "significant_debt";

  return {
    targetHours,
    actualHours,
    debtHours,
    debtPercentage,
    status,
  };
}

export interface SleepRegularityResult {
  bedtimeStd: number; // hours
  waketimeStd: number; // hours
  regularityScore: number; // 0-100, higher = more regular
  status: "very_regular" | "regular" | "somewhat_irregular" | "irregular";
}

/**
 * Calculate sleep regularity based on consistency of bed/wake times
 *
 * @param bedtimes - Array of bedtime timestamps (ISO strings)
 * @param waketimes - Array of waketime timestamps (ISO strings)
 */
export function sleepRegularity(bedtimes: string[], waketimes: string[]): SleepRegularityResult {
  const extractHour = (iso: string): number => {
    const date = new Date(iso);
    let hour = date.getHours() + date.getMinutes() / 60;
    // Handle overnight (if bedtime is before midnight, adjust)
    if (hour < 12) hour += 24; // treat early morning as previous night
    return hour;
  };

  const bedtimeHours = bedtimes.map(extractHour);
  const waketimeHours = waketimes.map((iso) => {
    const date = new Date(iso);
    return date.getHours() + date.getMinutes() / 60;
  });

  const bedtimeStd = sampleStandardDeviation(bedtimeHours);
  const waketimeStd = sampleStandardDeviation(waketimeHours);

  // Score: inverse of combined variability (lower variability = higher score)
  // 0.5 hours std = 100 score, 2 hours std = 0 score
  const avgStd = (bedtimeStd + waketimeStd) / 2;
  const regularityScore = Math.max(0, Math.min(100, 100 - (avgStd - 0.5) * (100 / 1.5)));

  let status: "very_regular" | "regular" | "somewhat_irregular" | "irregular";
  if (regularityScore >= 80) status = "very_regular";
  else if (regularityScore >= 60) status = "regular";
  else if (regularityScore >= 40) status = "somewhat_irregular";
  else status = "irregular";

  return {
    bedtimeStd,
    waketimeStd,
    regularityScore,
    status,
  };
}
