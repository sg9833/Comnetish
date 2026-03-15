export type UserRole = 'TENANT' | 'PROVIDER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string | null;
  emailVerifiedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  primaryRole: UserRole;
  status: string;
}

export interface AuthSession {
  id: string;
  expiresAt: string;
  emailVerified: boolean;
}

export interface AuthProviders {
  google: {
    configured: boolean;
  };
}

interface ApiResponse<T> {
  data: T;
}

interface ApiErrorBody {
  message?: string;
  error?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const parsed = (await response.json()) as ApiErrorBody;
      message = parsed.message || parsed.error || message;
    } catch {
      // keep default message when error body is not JSON
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export function getApiBaseUrl() {
  return API_BASE;
}

export async function authMe() {
  return request<{ user: AuthUser; session: AuthSession }>('/api/auth/me', {
    method: 'GET'
  });
}

export async function authLogin(input: { email: string; password: string }) {
  return request<{ user: AuthUser; session: AuthSession }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function authSignup(input: { email: string; password: string; displayName?: string }) {
  return request<{
    user: AuthUser;
    session: AuthSession;
    verification?: {
      required: boolean;
      previewUrl?: string;
      delivery?: {
        provider: string;
        delivered: boolean;
        previewUrl?: string;
      };
    };
  }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      role: 'TENANT'
    })
  });
}

export async function authLogout() {
  return request<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST'
  });
}

export async function authForgotPassword(email: string) {
  return request<{
    ok: boolean;
    reset?: {
      previewUrl?: string;
    };
  }>('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function authResetPassword(token: string, password: string) {
  return request<{ user: AuthUser; session: AuthSession; passwordReset: boolean }>('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password })
  });
}

export async function authVerifyEmail(token: string) {
  return request<{ user: AuthUser; verified: boolean }>('/api/auth/email/verify/confirm', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
}

export async function getAuthProviders() {
  return request<AuthProviders>('/api/auth/providers', {
    method: 'GET'
  });
}

export function getGoogleStartUrl(options?: { returnPath?: string; sourcePath?: string }) {
  const url = new URL('/api/auth/google/start', API_BASE);
  url.searchParams.set('role', 'TENANT');
  url.searchParams.set('returnPath', options?.returnPath ?? '/dashboard');
  url.searchParams.set('sourcePath', options?.sourcePath ?? '/login');
  return url.toString();
}