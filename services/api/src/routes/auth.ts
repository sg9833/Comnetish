import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AuthChallengeType, UserRole, UserStatus } from '@prisma/client';
import { verifyMessage } from 'viem';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';
import {
  clearAuthCookies,
  clearGoogleOAuthStateCookie,
  getGoogleOAuthStateCookie,
  setGoogleOAuthStateCookie
} from '../lib/auth/cookies';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import {
  type AuthUser,
  createSessionForUser,
  getAuthUserById,
  requireCurrentSession,
  resolveCurrentSession,
  revokeAllUserSessions,
  revokeSession,
  resolveSessionFromRefreshToken,
  rotateSession,
  sanitizeUser
} from '../lib/auth/session';
import { createOpaqueToken, hashToken } from '../lib/auth/tokens';
import { assertEvmAddress, consumeWalletChallenge, createWalletChallenge, getActiveWalletChallenge, normalizeEvmAddress } from '../lib/auth/wallet';
import {
  createGoogleAuthorizationUrl,
  exchangeGoogleCode,
  fetchGoogleUserProfile,
  isGoogleOAuthConfigured,
  requireGoogleOAuthConfig
} from '../lib/auth/google';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email';
import { env } from '../config/env';

const auth = new Hono();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long');

const signupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['TENANT', 'PROVIDER']).default('TENANT')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: passwordSchema
});

const tokenSchema = z.object({
  token: z.string().min(24)
});

const emailSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(24),
  password: passwordSchema
});

const walletChallengeSchema = z.object({
  address: z.string().min(8),
  intent: z.enum(['login', 'link']).default('login')
});

const walletVerifySchema = z.object({
  address: z.string().min(8),
  signature: z.string().min(10),
  role: z.enum(['TENANT', 'PROVIDER']).default('TENANT')
});

const walletUnlinkSchema = z.object({
  address: z.string().min(8)
});

const googleStartSchema = z.object({
  intent: z.enum(['login', 'link']).optional(),
  role: z.enum(['TENANT', 'PROVIDER']).default('TENANT'),
  returnPath: z.string().startsWith('/').max(256).optional(),
  sourcePath: z.string().startsWith('/').max(256).optional()
});

const googleCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getAppBaseUrl(role: 'TENANT' | 'PROVIDER') {
  return role === 'PROVIDER' ? env.AUTH_PROVIDER_APP_URL : env.AUTH_TENANT_APP_URL;
}

function getDefaultReturnPath(role: 'TENANT' | 'PROVIDER') {
  return role === 'PROVIDER' ? '/onboard' : '/dashboard';
}

function getDefaultAuthEntryPath(role: 'TENANT' | 'PROVIDER') {
  return role === 'PROVIDER' ? '/' : '/login';
}

function buildFrontendReturnUrl(role: 'TENANT' | 'PROVIDER', returnPath?: string) {
  return new URL(returnPath ?? getDefaultReturnPath(role), getAppBaseUrl(role));
}

function buildFrontendAuthEntryUrl(role: 'TENANT' | 'PROVIDER', sourcePath?: string) {
  return new URL(sourcePath ?? getDefaultAuthEntryPath(role), getAppBaseUrl(role));
}

function buildUrl(path: string, token: string) {
  const url = new URL(path, env.AUTH_BASE_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildAuthResponse(user: Awaited<ReturnType<typeof getAuthUserById>> extends infer T ? T : never, extra?: Record<string, unknown>) {
  if (!user) {
    throw new HttpError(500, 'Authenticated user could not be loaded');
  }

  return {
    user: sanitizeUser(user),
    ...extra
  };
}

async function issueVerificationToken(userId: string, email: string) {
  const rawToken = createOpaqueToken(24);
  const tokenHash = hashToken(rawToken);

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  const verificationUrl = buildUrl('/verify-email', rawToken);
  const delivery = await sendVerificationEmail(email, verificationUrl);

  return {
    delivery,
    previewUrl: env.NODE_ENV === 'production' ? undefined : delivery.previewUrl
  };
}

async function issuePasswordResetToken(userId: string, email: string) {
  const rawToken = createOpaqueToken(24);
  const tokenHash = hashToken(rawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  const resetUrl = buildUrl('/reset-password', rawToken);
  const delivery = await sendPasswordResetEmail(email, resetUrl);

  return {
    delivery,
    previewUrl: env.NODE_ENV === 'production' ? undefined : delivery.previewUrl
  };
}

async function issueAuthSessionResponse(c: Context, userId: string) {
  const user = await getAuthUserById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const authSession = await createSessionForUser(c, user);

  return {
    user,
    authSession
  };
}

async function createWalletUser(address: string, role: 'TENANT' | 'PROVIDER') {
  return prisma.user.create({
    data: {
      primaryRole: role,
      status: UserStatus.ACTIVE,
      wallets: {
        create: {
          chainType: 'EVM',
          address,
          isPrimary: true,
          verifiedAt: new Date()
        }
      },
      ...(role === UserRole.PROVIDER
        ? { providerProfile: { create: {} } }
        : { tenantProfile: { create: {} } })
    },
    include: {
      wallets: true,
      oauthAccounts: true,
      providerProfile: true,
      tenantProfile: true
    }
  });
}

async function ensureLinkingAllowed(user: AuthUser, address: string) {
  const normalizedAddress = normalizeEvmAddress(address);

  const provider = await prisma.provider.findFirst({
    where: {
      userId: user.id,
      address: normalizedAddress
    }
  });

  if (provider) {
    throw new HttpError(409, 'This wallet is already assigned as the active provider identity');
  }
}

async function ensureUnlinkAllowed(user: AuthUser, address: string) {
  const normalizedAddress = normalizeEvmAddress(address);
  const linkedWallet = user.wallets.find((wallet) => wallet.address === normalizedAddress);

  if (!linkedWallet) {
    throw new HttpError(404, 'Wallet is not linked to this account');
  }

  const hasAlternateWallet = user.wallets.some((wallet) => wallet.id !== linkedWallet.id);
  const hasEmailPassword = Boolean(user.email && user.passwordHash);
  const hasOAuth = user.oauthAccounts.length > 0;

  if (!hasAlternateWallet && !hasEmailPassword && !hasOAuth) {
    throw new HttpError(400, 'You must keep at least one sign-in method on your account');
  }

  const provider = await prisma.provider.findFirst({
    where: {
      userId: user.id,
      address: normalizedAddress
    }
  });

  if (provider) {
    throw new HttpError(400, 'Provider identity wallets cannot be unlinked until provider ownership is migrated');
  }

  return linkedWallet;
}

function maybeRedirectCallback(c: Context, role: 'TENANT' | 'PROVIDER', payload: Record<string, unknown>, returnPath?: string) {
  const redirectUrl = buildFrontendReturnUrl(role, returnPath);
  redirectUrl.searchParams.set('auth', 'success');
  redirectUrl.searchParams.set('provider', 'google');

  if (payload.linked === true) {
    redirectUrl.searchParams.set('linked', '1');
  }

  if (payload.created === true) {
    redirectUrl.searchParams.set('created', '1');
  }

  if (returnPath || c.req.header('accept')?.includes('text/html')) {
    return c.redirect(redirectUrl.toString(), 302);
  }

  return c.json({ data: payload });
}

function maybeRedirectGoogleBrowserError(
  c: Context,
  options: {
    role: 'TENANT' | 'PROVIDER';
    sourcePath?: string;
    returnPath?: string;
    code: string;
    message: string;
    status: number;
  }
) {
  const wantsHtml = c.req.header('accept')?.includes('text/html');
  if (!wantsHtml) {
    throw new HttpError(options.status, options.message);
  }

  const redirectUrl = buildFrontendAuthEntryUrl(options.role, options.sourcePath);
  redirectUrl.searchParams.set('authError', options.code);
  if (options.returnPath) {
    redirectUrl.searchParams.set('returnPath', options.returnPath);
  }

  return c.redirect(redirectUrl.toString(), 302);
}

auth.get('/providers', (c) => {
  return c.json({
    data: {
      google: {
        configured: isGoogleOAuthConfigured()
      }
    }
  });
});

auth.post('/google/start', zValidator('json', googleStartSchema), async (c) => {
  const payload = c.req.valid('json');
  if (!isGoogleOAuthConfigured()) {
    throw new HttpError(503, 'Google OAuth is not configured');
  }

  const currentSession = await resolveCurrentSession(c);
  const intent = payload.intent ?? (currentSession ? 'link' : 'login');
  if (intent === 'link' && !currentSession) {
    throw new HttpError(401, 'Authentication required to link a Google account');
  }

  const state = createOpaqueToken(18);
  setGoogleOAuthStateCookie(c, {
    state,
    intent,
    role: payload.role,
    returnPath: payload.returnPath,
    sourcePath: payload.sourcePath
  });

  return c.json({
    data: {
      url: createGoogleAuthorizationUrl(state),
      intent,
      role: payload.role
    }
  });
});

auth.get('/google/start', zValidator('query', googleStartSchema), async (c) => {
  const payload = c.req.valid('query');
  if (!isGoogleOAuthConfigured()) {
    return maybeRedirectGoogleBrowserError(c, {
      role: payload.role,
      sourcePath: payload.sourcePath,
      returnPath: payload.returnPath,
      code: 'google_not_configured',
      message: 'Google OAuth is not configured',
      status: 503
    });
  }

  const currentSession = await resolveCurrentSession(c);
  const intent = payload.intent ?? (currentSession ? 'link' : 'login');
  if (intent === 'link' && !currentSession) {
    return maybeRedirectGoogleBrowserError(c, {
      role: payload.role,
      sourcePath: payload.sourcePath,
      returnPath: payload.returnPath,
      code: 'google_link_requires_login',
      message: 'Authentication required to link a Google account',
      status: 401
    });
  }

  const state = createOpaqueToken(18);
  setGoogleOAuthStateCookie(c, {
    state,
    intent,
    role: payload.role,
    returnPath: payload.returnPath,
    sourcePath: payload.sourcePath
  });

  return c.redirect(createGoogleAuthorizationUrl(state), 302);
});

auth.get('/google/callback', zValidator('query', googleCallbackSchema), async (c) => {
  const query = c.req.valid('query');
  const oauthState = getGoogleOAuthStateCookie(c);
  const role = oauthState?.role ?? 'TENANT';
  const sourcePath = oauthState?.sourcePath;
  const returnPath = oauthState?.returnPath;

  if (!isGoogleOAuthConfigured()) {
    clearGoogleOAuthStateCookie(c);
    return maybeRedirectGoogleBrowserError(c, {
      role,
      sourcePath,
      returnPath,
      code: 'google_not_configured',
      message: 'Google OAuth is not configured',
      status: 503
    });
  }

  if (query.error) {
    clearGoogleOAuthStateCookie(c);
    return maybeRedirectGoogleBrowserError(c, {
      role,
      sourcePath,
      returnPath,
      code: 'google_oauth_failed',
      message: query.error_description ?? `Google OAuth failed: ${query.error}`,
      status: 400
    });
  }

  if (!query.code || !query.state) {
    clearGoogleOAuthStateCookie(c);
    return maybeRedirectGoogleBrowserError(c, {
      role,
      sourcePath,
      returnPath,
      code: 'google_callback_invalid',
      message: 'Google OAuth callback is missing required parameters',
      status: 400
    });
  }

  clearGoogleOAuthStateCookie(c);

  if (!oauthState || oauthState.state !== query.state) {
    return maybeRedirectGoogleBrowserError(c, {
      role,
      sourcePath,
      returnPath,
      code: 'google_state_invalid',
      message: 'Google OAuth state is invalid or expired',
      status: 400
    });
  }

  try {
    const tokenResponse = await exchangeGoogleCode(query.code);
    const googleProfile = await fetchGoogleUserProfile(tokenResponse.access_token);
    const normalizedEmail = normalizeEmail(googleProfile.email!);

    const existingOAuth = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleProfile.sub
        }
      },
      include: {
        user: {
          include: {
            wallets: true,
            providerProfile: true,
            tenantProfile: true
          }
        }
      }
    });

    const currentSession = await resolveCurrentSession(c);

    if (oauthState.intent === 'link') {
      if (!currentSession) {
        throw new HttpError(401, 'Authentication required to complete Google account linking');
      }

      if (existingOAuth && existingOAuth.userId !== currentSession.user.id) {
        throw new HttpError(409, 'This Google account is already linked to another user');
      }

      await prisma.$transaction(async (tx) => {
        if (!existingOAuth) {
          await tx.oAuthAccount.create({
            data: {
              userId: currentSession.user.id,
              provider: 'google',
              providerAccountId: googleProfile.sub,
              email: normalizedEmail
            }
          });
        }

        if (!currentSession.user.email) {
          await tx.user.update({
            where: { id: currentSession.user.id },
            data: {
              email: normalizedEmail,
              emailVerifiedAt: new Date(),
              displayName: currentSession.user.displayName ?? googleProfile.name ?? null,
              avatarUrl: currentSession.user.avatarUrl ?? googleProfile.picture ?? null,
              status: currentSession.user.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : currentSession.user.status
            }
          });
        }
      });

      const refreshed = await issueAuthSessionResponse(c, currentSession.user.id);

      return maybeRedirectCallback(
        c,
        oauthState.role,
        {
          user: sanitizeUser(refreshed.user),
          session: {
            id: refreshed.authSession.session.id,
            expiresAt: refreshed.authSession.session.expiresAt,
            emailVerified: refreshed.authSession.principal.emailVerified
          },
          linked: true
        },
        oauthState.returnPath
      );
    }

    let userId: string;
    let created = false;

    if (existingOAuth) {
      userId = existingOAuth.userId;
    } else {
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          wallets: true,
          providerProfile: true,
          tenantProfile: true
        }
      });

      if (existingUserByEmail) {
        if (existingUserByEmail.status === UserStatus.SUSPENDED || existingUserByEmail.status === UserStatus.DELETED) {
          throw new HttpError(403, 'Account access is disabled');
        }

        await prisma.$transaction(async (tx) => {
          await tx.oAuthAccount.create({
            data: {
              userId: existingUserByEmail.id,
              provider: 'google',
              providerAccountId: googleProfile.sub,
              email: normalizedEmail
            }
          });

          await tx.user.update({
            where: { id: existingUserByEmail.id },
            data: {
              emailVerifiedAt: existingUserByEmail.emailVerifiedAt ?? new Date(),
              displayName: existingUserByEmail.displayName ?? googleProfile.name ?? null,
              avatarUrl: existingUserByEmail.avatarUrl ?? googleProfile.picture ?? null,
              status: existingUserByEmail.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : existingUserByEmail.status
            }
          });
        });

        userId = existingUserByEmail.id;
      } else {
        const createdUser = await prisma.user.create({
          data: {
            email: normalizedEmail,
            emailVerifiedAt: new Date(),
            displayName: googleProfile.name ?? null,
            avatarUrl: googleProfile.picture ?? null,
            primaryRole: oauthState.role,
            status: UserStatus.ACTIVE,
            oauthAccounts: {
              create: {
                provider: 'google',
                providerAccountId: googleProfile.sub,
                email: normalizedEmail
              }
            },
            ...(oauthState.role === UserRole.PROVIDER
              ? { providerProfile: { create: {} } }
              : { tenantProfile: { create: {} } })
          }
        });

        userId = createdUser.id;
        created = true;
      }
    }

    const authResult = await issueAuthSessionResponse(c, userId);

    logger.info('auth.google.completed', {
      userId,
      email: normalizedEmail,
      intent: oauthState.intent
    });

    return maybeRedirectCallback(
      c,
      oauthState.role,
      {
        user: sanitizeUser(authResult.user),
        session: {
          id: authResult.authSession.session.id,
          expiresAt: authResult.authSession.session.expiresAt,
          emailVerified: authResult.authSession.principal.emailVerified
        },
        google: {
          linked: true,
          providerAccountId: googleProfile.sub
        },
        created
      },
      oauthState.returnPath
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return maybeRedirectGoogleBrowserError(c, {
        role: oauthState.role,
        sourcePath: oauthState.sourcePath,
        returnPath: oauthState.returnPath,
        code: 'google_oauth_failed',
        message: error.message,
        status: error.status
      });
    }

    throw error;
  }
});

auth.post('/signup', zValidator('json', signupSchema), async (c) => {
  const payload = c.req.valid('json');
  const email = normalizeEmail(payload.email);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new HttpError(409, 'An account already exists for this email address');
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(payload.password),
      displayName: payload.displayName?.trim() || null,
      primaryRole: payload.role,
      status: UserStatus.PENDING_VERIFICATION,
      ...(payload.role === UserRole.PROVIDER
        ? { providerProfile: { create: {} } }
        : { tenantProfile: { create: {} } })
    },
    include: {
      wallets: true,
      oauthAccounts: true,
      providerProfile: true,
      tenantProfile: true
    }
  });

  const verification = await issueVerificationToken(user.id, email);
  const authSession = await createSessionForUser(c, user);

  logger.info('auth.signup.created', {
    userId: user.id,
    email,
    role: user.primaryRole
  });

  return c.json(
    {
      data: buildAuthResponse(user, {
        session: {
          id: authSession.session.id,
          expiresAt: authSession.session.expiresAt,
          emailVerified: authSession.principal.emailVerified
        },
        verification: {
          required: true,
          ...verification
        }
      })
    },
    201
  );
});

auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const payload = c.req.valid('json');
  const email = normalizeEmail(payload.email);

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      wallets: true,
      oauthAccounts: true,
      providerProfile: true,
      tenantProfile: true
    }
  });

  if (!user?.passwordHash) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const validPassword = await verifyPassword(payload.password, user.passwordHash);
  if (!validPassword) {
    throw new HttpError(401, 'Invalid email or password');
  }

  if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
    throw new HttpError(403, 'Account access is disabled');
  }

  const authSession = await createSessionForUser(c, user);

  return c.json({
    data: buildAuthResponse(user, {
      session: {
        id: authSession.session.id,
        expiresAt: authSession.session.expiresAt,
        emailVerified: authSession.principal.emailVerified
      }
    })
  });
});

auth.post('/logout', async (c) => {
  const current = (await requireCurrentSession(c).catch(() => null)) ?? (await resolveSessionFromRefreshToken(c));
  if (current) {
    await revokeSession(current.session.id);
  }

  clearAuthCookies(c);
  return c.json({ data: { ok: true } });
});

auth.post('/refresh', async (c) => {
  const rotated = await rotateSession(c);

  return c.json({
    data: {
      user: sanitizeUser(rotated.user),
      session: {
        id: rotated.session.id,
        expiresAt: rotated.session.expiresAt,
        emailVerified: rotated.principal.emailVerified
      }
    }
  });
});

auth.get('/me', async (c) => {
  const current = await requireCurrentSession(c);

  return c.json({
    data: {
      user: sanitizeUser(current.user),
      session: {
        id: current.session.id,
        expiresAt: current.session.expiresAt,
        emailVerified: Boolean(current.user.emailVerifiedAt)
      }
    }
  });
});

auth.post('/email/verify/request', async (c) => {
  const current = await requireCurrentSession(c).catch(() => null);
  const body = c.req.header('content-type')?.includes('application/json') ? await c.req.json().catch(() => null) : null;
  const parsed = body ? emailSchema.safeParse(body) : null;

  const targetUser = current
    ? current.user
    : parsed?.success
      ? await prisma.user.findUnique({
          where: { email: normalizeEmail(parsed.data.email) },
          include: { wallets: true, oauthAccounts: true, providerProfile: true, tenantProfile: true }
        })
      : null;

  if (!targetUser?.email) {
    return c.json({ data: { ok: true } });
  }

  if (targetUser.emailVerifiedAt) {
    return c.json({ data: { ok: true, alreadyVerified: true } });
  }

  const verification = await issueVerificationToken(targetUser.id, targetUser.email);

  return c.json({
    data: {
      ok: true,
      verification
    }
  });
});

auth.post('/email/verify/confirm', zValidator('json', tokenSchema), async (c) => {
  const { token } = c.req.valid('json');
  const tokenHash = hashToken(token);

  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { wallets: true, oauthAccounts: true, providerProfile: true, tenantProfile: true }
      }
    }
  });

  if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt <= new Date()) {
    throw new HttpError(400, 'Verification token is invalid or expired');
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE
      }
    })
  ]);

  const freshUser = await getAuthUserById(verificationToken.userId);

  return c.json({
    data: buildAuthResponse(freshUser, {
      verified: true
    })
  });
});

auth.post('/password/forgot', zValidator('json', emailSchema), async (c) => {
  const { email } = c.req.valid('json');
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user?.email || !user.passwordHash) {
    return c.json({ data: { ok: true } });
  }

  const reset = await issuePasswordResetToken(user.id, user.email);

  return c.json({
    data: {
      ok: true,
      reset
    }
  });
});

auth.post('/password/reset', zValidator('json', resetPasswordSchema), async (c) => {
  const payload = c.req.valid('json');
  const tokenHash = hashToken(payload.token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash }
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    throw new HttpError(400, 'Password reset token is invalid or expired');
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: await hashPassword(payload.password),
        status: UserStatus.ACTIVE
      }
    })
  ]);

  await revokeAllUserSessions(resetToken.userId);
  clearAuthCookies(c);

  const user = await getAuthUserById(resetToken.userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const authSession = await createSessionForUser(c, user);

  return c.json({
    data: buildAuthResponse(user, {
      session: {
        id: authSession.session.id,
        expiresAt: authSession.session.expiresAt,
        emailVerified: authSession.principal.emailVerified
      },
      passwordReset: true
    })
  });
});

auth.post('/wallet/challenge', zValidator('json', walletChallengeSchema), async (c) => {
  const payload = c.req.valid('json');
  const address = normalizeEvmAddress(payload.address);
  assertEvmAddress(address);

  if (payload.intent === 'link') {
    const current = await requireCurrentSession(c);
    await ensureLinkingAllowed(current.user, address);

    return c.json({
      data: await createWalletChallenge({
        address,
        type: AuthChallengeType.WALLET_LINK,
        userId: current.user.id
      })
    });
  }

  return c.json({
    data: await createWalletChallenge({
      address,
      type: AuthChallengeType.WALLET_SIGN_IN
    })
  });
});

auth.post('/wallet/verify', zValidator('json', walletVerifySchema), async (c) => {
  const payload = c.req.valid('json');
  const address = normalizeEvmAddress(payload.address);
  assertEvmAddress(address);

  const challenge = await getActiveWalletChallenge({
    address,
    type: AuthChallengeType.WALLET_SIGN_IN
  });

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: challenge.message,
    signature: payload.signature as `0x${string}`
  });

  if (!valid) {
    throw new HttpError(401, 'Wallet signature verification failed');
  }

  let linkedWallet = await prisma.linkedWallet.findUnique({
    where: {
      chainType_address: {
        chainType: 'EVM',
        address
      }
    }
  });

  const created = !linkedWallet;
  let user = linkedWallet ? await getAuthUserById(linkedWallet.userId) : null;

  if (!user) {
    user = await createWalletUser(address, payload.role);
    linkedWallet = user.wallets[0] ?? null;
  }

  if (!user) {
    throw new HttpError(500, 'Wallet user could not be created');
  }

  if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
    throw new HttpError(403, 'Account access is disabled');
  }

  await prisma.linkedWallet.updateMany({
    where: {
      userId: user.id,
      chainType: 'EVM',
      address
    },
    data: {
      verifiedAt: new Date(),
      isPrimary: linkedWallet?.isPrimary ?? true
    }
  });

  await consumeWalletChallenge(challenge.id);

  const refreshedUser = await getAuthUserById(user.id);
  if (!refreshedUser) {
    throw new HttpError(500, 'Authenticated user could not be loaded');
  }

  const authSession = await createSessionForUser(c, refreshedUser);

  return c.json({
    data: buildAuthResponse(refreshedUser, {
      session: {
        id: authSession.session.id,
        expiresAt: authSession.session.expiresAt,
        emailVerified: authSession.principal.emailVerified
      },
      wallet: {
        address,
        linked: true,
        created
      }
    })
  });
});

auth.post('/wallet/link', zValidator('json', walletVerifySchema.omit({ role: true })), async (c) => {
  const current = await requireCurrentSession(c);
  const payload = c.req.valid('json');
  const address = normalizeEvmAddress(payload.address);
  assertEvmAddress(address);

  await ensureLinkingAllowed(current.user, address);

  const challenge = await getActiveWalletChallenge({
    address,
    type: AuthChallengeType.WALLET_LINK,
    userId: current.user.id
  });

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: challenge.message,
    signature: payload.signature as `0x${string}`
  });

  if (!valid) {
    throw new HttpError(401, 'Wallet signature verification failed');
  }

  const existingWallet = await prisma.linkedWallet.findUnique({
    where: {
      chainType_address: {
        chainType: 'EVM',
        address
      }
    }
  });

  if (existingWallet && existingWallet.userId !== current.user.id) {
    throw new HttpError(409, 'This wallet is already linked to another account');
  }

  if (existingWallet) {
    await prisma.linkedWallet.update({
      where: { id: existingWallet.id },
      data: { verifiedAt: new Date() }
    });
  } else {
    await prisma.linkedWallet.create({
      data: {
        userId: current.user.id,
        chainType: 'EVM',
        address,
        isPrimary: current.user.wallets.length === 0,
        verifiedAt: new Date()
      }
    });
  }

  await consumeWalletChallenge(challenge.id);

  const refreshedUser = await getAuthUserById(current.user.id);

  return c.json({
    data: buildAuthResponse(refreshedUser, {
      linked: true,
      wallet: {
        address
      }
    })
  });
});

auth.post('/wallet/unlink', zValidator('json', walletUnlinkSchema), async (c) => {
  const current = await requireCurrentSession(c);
  const payload = c.req.valid('json');
  const address = normalizeEvmAddress(payload.address);
  assertEvmAddress(address);

  const linkedWallet = await ensureUnlinkAllowed(current.user, address);

  await prisma.$transaction(async (tx) => {
    await tx.linkedWallet.delete({
      where: { id: linkedWallet.id }
    });

    if (linkedWallet.isPrimary) {
      const nextWallet = await tx.linkedWallet.findFirst({
        where: { userId: current.user.id },
        orderBy: { createdAt: 'asc' }
      });

      if (nextWallet) {
        await tx.linkedWallet.update({
          where: { id: nextWallet.id },
          data: { isPrimary: true }
        });
      }
    }
  });

  const refreshedUser = await getAuthUserById(current.user.id);

  return c.json({
    data: buildAuthResponse(refreshedUser, {
      unlinked: true,
      wallet: {
        address
      }
    })
  });
});

export { auth };