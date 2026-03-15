import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '../../config/env';

const ACCESS_COOKIE_NAME = 'comnetish_access_token';
const REFRESH_COOKIE_NAME = 'comnetish_refresh_token';
const GOOGLE_OAUTH_STATE_COOKIE_NAME = 'comnetish_google_oauth_state';

export type GoogleOAuthStateCookie = {
  state: string;
  intent: 'login' | 'link';
  role: 'TENANT' | 'PROVIDER';
  returnPath?: string;
  sourcePath?: string;
};

function getCookieBaseOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: '/',
    maxAge,
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {})
  } as const;
}

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  setCookie(c, ACCESS_COOKIE_NAME, accessToken, getCookieBaseOptions(env.AUTH_ACCESS_TOKEN_TTL_MINUTES * 60));
  setCookie(c, REFRESH_COOKIE_NAME, refreshToken, getCookieBaseOptions(env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60));
}

export function clearAuthCookies(c: Context) {
  deleteCookie(c, ACCESS_COOKIE_NAME, {
    path: '/',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {})
  });
  deleteCookie(c, REFRESH_COOKIE_NAME, {
    path: '/',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {})
  });
}

export function getAccessTokenFromCookie(c: Context) {
  return getCookie(c, ACCESS_COOKIE_NAME) ?? null;
}

export function getRefreshTokenFromCookie(c: Context) {
  return getCookie(c, REFRESH_COOKIE_NAME) ?? null;
}

export function setGoogleOAuthStateCookie(c: Context, payload: GoogleOAuthStateCookie) {
  setCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME, Buffer.from(JSON.stringify(payload)).toString('base64url'), {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: '/',
    maxAge: 10 * 60,
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {})
  });
}

export function getGoogleOAuthStateCookie(c: Context): GoogleOAuthStateCookie | null {
  const value = getCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as GoogleOAuthStateCookie;
  } catch {
    return null;
  }
}

export function clearGoogleOAuthStateCookie(c: Context) {
  deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME, {
    path: '/',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {})
  });
}