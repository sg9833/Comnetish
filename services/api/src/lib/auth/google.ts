import { HttpError } from '../http-error';
import { env } from '../../config/env';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export type GoogleUserProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export function isGoogleOAuthConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export function requireGoogleOAuthConfig() {
  if (!isGoogleOAuthConfigured()) {
    throw new HttpError(503, 'Google OAuth is not configured');
  }
}

export function createGoogleAuthorizationUrl(state: string) {
  requireGoogleOAuthConfig();

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent select_account');
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  requireGoogleOAuthConfig();

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code'
    }).toString()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, `Google token exchange failed: ${body || response.statusText}`);
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserProfile(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(502, `Google user profile fetch failed: ${body || response.statusText}`);
  }

  const profile = (await response.json()) as GoogleUserProfile;
  if (!profile.sub || !profile.email) {
    throw new HttpError(400, 'Google account did not provide a usable email identity');
  }

  if (!profile.email_verified) {
    throw new HttpError(400, 'Google account email is not verified');
  }

  return profile;
}