import { google } from "googleapis";

declare const process: {
  env: Record<string, string | undefined>;
};

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function getGoogleOAuthConfigFromEnv(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN",
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}

export function getGoogleOAuthClient(config: GoogleOAuthConfig = getGoogleOAuthConfigFromEnv()) {
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return oauth2Client;
}
