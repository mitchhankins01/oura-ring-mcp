import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDuration,
  secondsToHours,
  formatTime,
  getToday,
  getDaysAgo,
  percentage,
  formatScore,
  formatSleepStages,
} from './formatters.js';

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(3665)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(7260)).toBe('2h 1m');
  });

  it('formats minutes only when less than an hour', () => {
    expect(formatDuration(1800)).toBe('30m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats hours only when minutes are zero', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(10800)).toBe('3h');
  });

  it('handles edge cases', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59)).toBe('0m'); // Rounds down
    expect(formatDuration(27000)).toBe('7h 30m');
  });
});

describe('secondsToHours', () => {
  it('converts seconds to hours with one decimal', () => {
    expect(secondsToHours(3600)).toBe(1.0);
    expect(secondsToHours(5400)).toBe(1.5);
    expect(secondsToHours(27000)).toBe(7.5);
  });

  it('rounds to one decimal place', () => {
    expect(secondsToHours(3665)).toBe(1.0); // 1.018 hours rounds to 1.0
    expect(secondsToHours(7260)).toBe(2.0); // 2.016 hours rounds to 2.0
  });

  it('handles edge cases', () => {
    expect(secondsToHours(0)).toBe(0);
    expect(secondsToHours(1)).toBe(0); // Very small values round to 0
  });
});

describe('formatTime', () => {
  it('preserves original timezone when formatting ISO timestamps', () => {
    // EST timezone: 10:30 PM should stay 10:30 PM regardless of server timezone
    expect(formatTime('2024-01-15T22:30:00-05:00')).toBe('10:30 PM');
    // UTC midnight should be 12:00 AM
    expect(formatTime('2024-01-15T00:00:00+00:00')).toBe('12:00 AM');
    // Noon should be 12:00 PM
    expect(formatTime('2024-01-15T12:00:00+00:00')).toBe('12:00 PM');
    // Morning time
    expect(formatTime('2024-01-15T07:15:00-05:00')).toBe('7:15 AM');
  });

  it('handles edge cases for hour conversion', () => {
    // 11 PM
    expect(formatTime('2024-01-15T23:45:00+00:00')).toBe('11:45 PM');
    // 1 AM
    expect(formatTime('2024-01-15T01:05:00+00:00')).toBe('1:05 AM');
  });

  it('handles invalid timestamps gracefully', () => {
    // Invalid dates produce "Invalid Date"
    expect(formatTime('invalid')).toBe('Invalid Date');
    expect(formatTime('not-a-date')).toBe('Invalid Date');
  });
});

describe('getToday', () => {
  beforeEach(() => {
    // Mock the current date to 2024-01-15 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today in YYYY-MM-DD format', () => {
    expect(getToday()).toBe('2024-01-15');
  });
});

describe('getDaysAgo', () => {
  beforeEach(() => {
    // Mock the current date to 2024-01-15 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates dates N days ago', () => {
    expect(getDaysAgo(0)).toBe('2024-01-15');
    expect(getDaysAgo(1)).toBe('2024-01-14');
    expect(getDaysAgo(7)).toBe('2024-01-08');
    expect(getDaysAgo(30)).toBe('2023-12-16');
  });

  it('handles edge cases', () => {
    expect(getDaysAgo(0)).toBe('2024-01-15');
    expect(getDaysAgo(365)).toBe('2023-01-15');
  });
});

describe('percentage', () => {
  it('calculates percentages with one decimal', () => {
    expect(percentage(50, 100)).toBe(50.0);
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(2, 3)).toBe(66.7);
  });

  it('handles edge cases', () => {
    expect(percentage(0, 100)).toBe(0);
    expect(percentage(100, 100)).toBe(100);
    expect(percentage(0, 0)).toBe(0); // Division by zero returns 0
  });

  it('handles decimal inputs', () => {
    expect(percentage(7200, 27000)).toBe(26.7); // Deep sleep percentage
    expect(percentage(5400, 27000)).toBe(20.0); // REM sleep percentage
  });
});

describe('formatScore', () => {
  it('formats scores with context labels', () => {
    expect(formatScore(90)).toBe('90 (Optimal)');
    expect(formatScore(85)).toBe('85 (Optimal)');
    expect(formatScore(80)).toBe('80 (Good)');
    expect(formatScore(70)).toBe('70 (Good)');
    expect(formatScore(65)).toBe('65 (Fair)');
    expect(formatScore(60)).toBe('60 (Fair)');
    expect(formatScore(50)).toBe('50 (Pay attention)');
  });

  it('handles boundary cases', () => {
    expect(formatScore(84)).toBe('84 (Good)');
    expect(formatScore(69)).toBe('69 (Fair)');
    expect(formatScore(59)).toBe('59 (Pay attention)');
  });

  it('handles null values', () => {
    expect(formatScore(null)).toBe('No data');
  });

  it('handles extreme values', () => {
    expect(formatScore(0)).toBe('0 (Pay attention)');
    expect(formatScore(100)).toBe('100 (Optimal)');
  });
});

describe('formatSleepStages', () => {
  it('formats sleep stages with durations and percentages', () => {
    const result = formatSleepStages(7200, 5400, 14400, 27000);
    expect(result).toBe('Deep: 2h (26.7%) | REM: 1h 30m (20%) | Light: 4h (53.3%)');
  });

  it('handles uneven sleep distribution', () => {
    const result = formatSleepStages(3600, 1800, 7200, 12600);
    expect(result).toContain('Deep: 1h (28.6%)');
    expect(result).toContain('REM: 30m (14.3%)');
    expect(result).toContain('Light: 2h (57.1%)');
  });

  it('handles zero values', () => {
    const result = formatSleepStages(0, 0, 3600, 3600);
    expect(result).toBe('Deep: 0m (0%) | REM: 0m (0%) | Light: 1h (100%)');
  });

  it('handles edge case with zero total sleep', () => {
    const result = formatSleepStages(0, 0, 0, 0);
    expect(result).toBe('Deep: 0m (0%) | REM: 0m (0%) | Light: 0m (0%)');
  });
});
