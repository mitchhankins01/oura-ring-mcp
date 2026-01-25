/**
 * OAuth2 flow helpers for Oura API
 * https://cloud.ouraring.com/docs/authentication
 */

import { saveCredentials, type OuraCredentials } from "./store.js";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const REVOKE_URL = "https://api.ouraring.com/oauth/revoke";

// All available Oura scopes
const ALL_SCOPES = [
  "email",
  "personal",
  "daily",
  "heartrate",
  "workout",
  "tag",
  "session",
  "spo2",
  "ring_configuration",
  "stress",
  "heart_health",
];

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Build the authorization URL for the OAuth flow
 */
export function buildAuthorizationUrl(config: OAuthConfig, state: string): string {
  const scopes = config.scopes ?? ALL_SCOPES;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(" "),
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig
): Promise<OuraCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenResponse;

  const credentials: OuraCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return credentials;
}

/**
 * Refresh an expired access token
 * Note: Oura refresh tokens are single-use - the response includes a new refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: OAuthConfig
): Promise<OuraCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenResponse;

  const credentials: OuraCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token, // New refresh token!
    token_type: data.token_type,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Automatically save the new credentials since refresh token is single-use
  await saveCredentials(credentials);

  return credentials;
}

/**
 * Revoke an access token
 */
export async function revokeToken(accessToken: string): Promise<void> {
  const response = await fetch(`${REVOKE_URL}?access_token=${accessToken}`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token revocation failed: ${response.status} ${body}`);
  }
}

/**
 * Get the default OAuth config from environment variables
 */
export function getOAuthConfigFromEnv(): OAuthConfig | null {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const redirectUri = process.env.OURA_REDIRECT_URI ?? "http://localhost:3000/callback";

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}
