import type { UserRole, UserStatus } from '@prisma/client';

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  role: UserRole;
  status: UserStatus;
  email_verified: boolean;
  wallet_linked: boolean;
  provider_profile_id: string | null;
  tenant_profile_id: string | null;
};

export type AuthenticatedPrincipal = {
  userId: string;
  sessionId: string;
  primaryRole: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  walletLinked: boolean;
  providerProfileId: string | null;
  tenantProfileId: string | null;
};