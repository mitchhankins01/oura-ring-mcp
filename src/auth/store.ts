/**
 * Token storage for OAuth credentials
 * Stores tokens in ~/.oura-mcp/credentials.json
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".oura-mcp");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

export interface OuraCredentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number; // Unix timestamp (ms)
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/**
 * Load stored credentials
 * Returns null if no credentials exist or file is corrupted
 */
export async function loadCredentials(): Promise<OuraCredentials | null> {
  try {
    const data = await fs.readFile(CREDENTIALS_FILE, "utf-8");
    const credentials = JSON.parse(data) as OuraCredentials;

    // Validate required fields
    if (!credentials.access_token || !credentials.refresh_token) {
      return null;
    }

    return credentials;
  } catch {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Save credentials to disk
 */
export async function saveCredentials(credentials: OuraCredentials): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(
    CREDENTIALS_FILE,
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 } // Read/write for owner only
  );
}

/**
 * Delete stored credentials
 */
export async function clearCredentials(): Promise<void> {
  try {
    await fs.unlink(CREDENTIALS_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Check if credentials are expired (or will expire within buffer period)
 */
export function isExpired(credentials: OuraCredentials, bufferMs = 60000): boolean {
  return Date.now() + bufferMs >= credentials.expires_at;
}

/**
 * Get the credentials file path (for display to user)
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
