export type AuthTransport = "web" | "bearer";
export type AuthPurpose = "sign_in" | "admin_sign_in";
export type SessionKind = "standard" | "admin";

export type AuthIdentifier =
  | { readonly phoneE164: string; readonly email?: never }
  | { readonly email: string; readonly phoneE164?: never };

export interface AuthUser {
  readonly id: string;
  readonly phoneE164: string | null;
  readonly email?: string;
  readonly blockedAt: Date | null;
  readonly deletedAt: Date | null;
}

export interface DeviceSession {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly deviceName: string | null;
}

export interface ResolvedSession extends DeviceSession {
  readonly userId: string;
  readonly transport: AuthTransport;
  readonly kind: SessionKind;
}
