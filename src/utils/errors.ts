/**
 * Custom error types and helpers for better error messages
 */

export class OuraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(getErrorMessage(status, body));
    this.name = "OuraApiError";
  }
}

/**
 * Get a user-friendly error message based on HTTP status code
 */
function getErrorMessage(status: number, body: string): string {
  switch (status) {
    case 400:
      return `Invalid request: ${parseErrorBody(body) || "Check your date format (YYYY-MM-DD) and date range."}`;

    case 401:
      return "Authentication failed: Your Oura access token is invalid or expired. " +
        "Get a new token at https://cloud.ouraring.com/personal-access-tokens";

    case 403:
      return "Access denied: Your token doesn't have permission for this data. " +
        "Make sure you granted the required scopes when creating your token.";

    case 404:
      return "Endpoint not found: This Oura API endpoint may have changed. " +
        "Try updating the oura-mcp package.";

    case 426:
      return "Subscription required: This feature requires an Oura subscription.";

    case 429:
      return "Rate limited: Too many requests to Oura API. Please wait a moment and try again. " +
        "(Limit: 5000 requests per 5 minutes)";

    case 500:
    case 502:
    case 503:
    case 504:
      return `Oura API is temporarily unavailable (${status}). Please try again in a few minutes.`;

    default:
      return `Oura API error (${status}): ${parseErrorBody(body) || "Unknown error"}`;
  }
}

/**
 * Try to parse error body for useful message
 */
function parseErrorBody(body: string): string | null {
  if (!body) return null;

  try {
    const parsed = JSON.parse(body);
    // Oura API returns { detail: "message" } for errors
    if (parsed.detail) return parsed.detail;
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
    return null;
  } catch {
    // Not JSON, return as-is if it's short enough
    return body.length < 200 ? body : null;
  }
}

/**
 * Format an error for display to the user
 */
export function formatError(error: unknown): string {
  if (error instanceof OuraApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    // Check for common network errors
    if (error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
      return "Network error: Unable to connect to Oura API. Check your internet connection.";
    }
    if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
      return "Request timed out: Oura API took too long to respond. Please try again.";
    }
    return error.message;
  }

  return "An unknown error occurred";
}

/**
 * Get helpful context for "no data" situations
 */
export function getNoDataMessage(dataType: string, startDate: string, endDate?: string): string {
  const dateRange = endDate && endDate !== startDate
    ? `${startDate} to ${endDate}`
    : startDate;

  const tips = [
    `No ${dataType} data found for ${dateRange}.`,
    "",
    "This could mean:",
    "• Your Oura ring hasn't synced yet - open the Oura app to sync",
    "• You didn't wear your ring during this period",
    "• The data is still being processed (can take a few hours)",
  ];

  // Add specific tips based on data type
  if (dataType === "sleep") {
    tips.push("• Sleep data appears on the day you woke up, not when you fell asleep");
  }

  return tips.join("\n");
}
