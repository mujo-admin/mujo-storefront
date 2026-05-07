// Customer session — JWT-signed cookie for the /account flow. Independent
// from magic-link tokens (those are single-use, 15-min); session cookies
// are 7-day TTL with sliding refresh on activity.
//
// Cookie: mujo_session, HTTP-only, Secure (prod), SameSite=Lax. Signed with
// MUJO_SESSION_SECRET. Verifying decodes + checks expiry.

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'mujo_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ISSUER = 'mujo-storefront';
const AUDIENCE = 'mujo-account';

function getSecret(): Uint8Array {
  const raw = process.env.MUJO_SESSION_SECRET;
  if (!raw) throw new Error('MUJO_SESSION_SECRET is not set');
  return new TextEncoder().encode(raw);
}

export type Session = {
  customerId: string;
  email: string;
  stripeCustomerId: string | null;
  /** ISO timestamp of session expiry. */
  expiresAt: string;
};

type SessionPayload = Omit<Session, 'expiresAt'>;

async function signToken(payload: SessionPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret);
}

/**
 * Mint + set the session cookie. Only callable from a Route Handler / Server
 * Action context (cookies() needs a writable Request scope).
 */
export async function setSession(payload: SessionPayload): Promise<void> {
  const token = await signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Read the current session from the cookie. Returns null if the cookie is
 * missing, expired, or fails signature verification.
 *
 * Safe to call from RSC (read-only). For write contexts, prefer
 * `refreshSession()` after this read.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const customerId =
      typeof payload.customerId === 'string' ? payload.customerId : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const stripeCustomerId =
      typeof payload.stripeCustomerId === 'string'
        ? payload.stripeCustomerId
        : null;
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    if (!customerId || !email) return null;

    return {
      customerId,
      email,
      stripeCustomerId,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  } catch {
    // Expired / invalid / tampered.
    return null;
  }
}

/**
 * Re-issue the session cookie with a fresh 7-day TTL. Call from Route
 * Handlers / Server Actions on activity (sliding refresh). No-op if there's
 * no current session.
 */
export async function refreshSession(): Promise<void> {
  const current = await getSession();
  if (!current) return;
  await setSession({
    customerId: current.customerId,
    email: current.email,
    stripeCustomerId: current.stripeCustomerId,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
