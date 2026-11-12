import type { TransactionSql } from "postgres";
import { insertAdminChallenge, redeemAdminChallenge } from "./auth-admin.js";
import {
  confirmIdentifierChange,
  readVerifiedIdentifiers,
  reserveIdentifierChange,
} from "./auth-identifiers.js";
import { deliverOtp, redeemOtp, reserveOtpChallenge, type OtpDelivery } from "./auth-otp.js";
import {
  getOrCreateUserForSignIn,
  insertSession,
  listSessions,
  lockUserByEmail,
  lockUserByPhone,
  resolveSession,
  revokeSessions,
} from "./auth-session.js";
import type { DatabaseConnection } from "./database.js";

export type {
  AuthIdentifier,
  AuthPurpose,
  AuthTransport,
  AuthUser,
  DeviceSession,
  ResolvedSession,
  SessionKind,
} from "./auth-types.js";

function createTransaction(sql: TransactionSql) {
  return {
    reserveIdentifierChange: reserveIdentifierChange.bind(undefined, sql),
    confirmIdentifierChange: confirmIdentifierChange.bind(undefined, sql),
    reserveOtpChallenge: reserveOtpChallenge.bind(undefined, sql),
    redeemOtp: redeemOtp.bind(undefined, sql),
    getOrCreateUserForSignIn: getOrCreateUserForSignIn.bind(undefined, sql),
    lockUserByEmail: lockUserByEmail.bind(undefined, sql),
    lockUserByPhone: lockUserByPhone.bind(undefined, sql),
    insertAdminChallenge: insertAdminChallenge.bind(undefined, sql),
    redeemAdminChallenge: redeemAdminChallenge.bind(undefined, sql),
    insertSession: insertSession.bind(undefined, sql),
    revokeSessions: revokeSessions.bind(undefined, sql),
  };
}

export type AuthTransaction = ReturnType<typeof createTransaction>;

export function createAuthRepository(database: DatabaseConnection) {
  const { sql } = database;
  return {
    async transaction<T>(run: (tx: AuthTransaction) => Promise<T>): Promise<T> {
      const { result } = await sql.begin(async (transaction) => ({
        result: await run(createTransaction(transaction)),
      }));
      return result;
    },
    deliverOtp(input: OtpDelivery): Promise<boolean> {
      return sql.begin((transaction) => deliverOtp(transaction, input));
    },
    readVerifiedIdentifiers: readVerifiedIdentifiers.bind(undefined, sql),
    resolveSession: resolveSession.bind(undefined, sql),
    listSessions: listSessions.bind(undefined, sql),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
