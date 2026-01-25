/**
 * Tests for error utilities
 */
import { describe, it, expect } from "vitest";
import { OuraApiError, formatError, getNoDataMessage } from "./errors.js";

describe("OuraApiError", () => {
  it("should create error with status-specific message for 401", () => {
    const error = new OuraApiError(401, "Unauthorized", "");
    expect(error.message).toContain("Authentication failed");
    expect(error.message).toContain("invalid or expired");
    expect(error.name).toBe("OuraApiError");
    expect(error.status).toBe(401);
  });

  it("should create error with status-specific message for 403", () => {
    const error = new OuraApiError(403, "Forbidden", "");
    expect(error.message).toContain("Access denied");
    expect(error.message).toContain("permission");
  });

  it("should create error with status-specific message for 404", () => {
    const error = new OuraApiError(404, "Not Found", "");
    expect(error.message).toContain("Endpoint not found");
  });

  it("should create error with status-specific message for 426", () => {
    const error = new OuraApiError(426, "Upgrade Required", "");
    expect(error.message).toContain("Subscription required");
  });

  it("should create error with status-specific message for 429", () => {
    const error = new OuraApiError(429, "Too Many Requests", "");
    expect(error.message).toContain("Rate limited");
    expect(error.message).toContain("5000 requests");
  });

  it("should create error with status-specific message for 500", () => {
    const error = new OuraApiError(500, "Internal Server Error", "");
    expect(error.message).toContain("temporarily unavailable");
  });

  it("should create error with status-specific message for 502", () => {
    const error = new OuraApiError(502, "Bad Gateway", "");
    expect(error.message).toContain("temporarily unavailable");
  });

  it("should create error with status-specific message for 503", () => {
    const error = new OuraApiError(503, "Service Unavailable", "");
    expect(error.message).toContain("temporarily unavailable");
  });

  it("should create error with status-specific message for 504", () => {
    const error = new OuraApiError(504, "Gateway Timeout", "");
    expect(error.message).toContain("temporarily unavailable");
  });

  it("should parse JSON error body with detail field", () => {
    const error = new OuraApiError(400, "Bad Request", '{"detail": "Invalid date format"}');
    expect(error.message).toContain("Invalid date format");
  });

  it("should parse JSON error body with message field", () => {
    const error = new OuraApiError(400, "Bad Request", '{"message": "Something went wrong"}');
    expect(error.message).toContain("Something went wrong");
  });

  it("should parse JSON error body with error field", () => {
    const error = new OuraApiError(400, "Bad Request", '{"error": "Validation failed"}');
    expect(error.message).toContain("Validation failed");
  });

  it("should use default message for 400 when body has no useful message", () => {
    const error = new OuraApiError(400, "Bad Request", "");
    expect(error.message).toContain("Check your date format");
  });

  it("should handle non-JSON body for default case", () => {
    const error = new OuraApiError(418, "I'm a teapot", "Short error message");
    expect(error.message).toContain("Short error message");
  });

  it("should truncate very long non-JSON body", () => {
    const longBody = "x".repeat(300);
    const error = new OuraApiError(418, "I'm a teapot", longBody);
    expect(error.message).not.toContain(longBody);
    expect(error.message).toContain("Unknown error");
  });
});

describe("formatError", () => {
  it("should format OuraApiError", () => {
    const error = new OuraApiError(401, "Unauthorized", "");
    expect(formatError(error)).toContain("Authentication failed");
  });

  it("should handle network errors (fetch failed)", () => {
    const error = new Error("fetch failed: ECONNREFUSED");
    expect(formatError(error)).toContain("Network error");
    expect(formatError(error)).toContain("Unable to connect");
  });

  it("should handle network errors (ENOTFOUND)", () => {
    const error = new Error("ENOTFOUND api.ouraring.com");
    expect(formatError(error)).toContain("Network error");
  });

  it("should handle timeout errors (ETIMEDOUT)", () => {
    const error = new Error("ETIMEDOUT");
    expect(formatError(error)).toContain("timed out");
  });

  it("should handle timeout errors (timeout in message)", () => {
    const error = new Error("Request timeout");
    expect(formatError(error)).toContain("timed out");
  });

  it("should return generic Error messages", () => {
    const error = new Error("Something went wrong");
    expect(formatError(error)).toBe("Something went wrong");
  });

  it("should handle unknown error types", () => {
    expect(formatError("string error")).toBe("An unknown error occurred");
    expect(formatError(null)).toBe("An unknown error occurred");
    expect(formatError(undefined)).toBe("An unknown error occurred");
    expect(formatError(123)).toBe("An unknown error occurred");
  });
});

describe("getNoDataMessage", () => {
  it("should return message for single date", () => {
    const message = getNoDataMessage("sleep", "2024-01-15");
    expect(message).toContain("No sleep data found for 2024-01-15");
    expect(message).toContain("ring hasn't synced");
    expect(message).toContain("didn't wear your ring");
  });

  it("should return message for date range", () => {
    const message = getNoDataMessage("activity", "2024-01-01", "2024-01-15");
    expect(message).toContain("No activity data found for 2024-01-01 to 2024-01-15");
  });

  it("should return single date message when start equals end", () => {
    const message = getNoDataMessage("readiness", "2024-01-15", "2024-01-15");
    expect(message).toContain("No readiness data found for 2024-01-15");
    expect(message).not.toContain("to 2024-01-15");
  });

  it("should include sleep-specific tips for sleep data", () => {
    const message = getNoDataMessage("sleep", "2024-01-15");
    expect(message).toContain("day you woke up");
  });

  it("should not include sleep-specific tips for non-sleep data", () => {
    const message = getNoDataMessage("activity", "2024-01-15");
    expect(message).not.toContain("day you woke up");
  });
});
