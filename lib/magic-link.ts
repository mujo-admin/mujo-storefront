import { createHash } from 'node:crypto';
import { and, eq, gte } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { db, magicLinkTokens } from 'db';

const TOKEN_TTL_SECONDS = 15 * 60;

function getSecret(): Uint8Array {
  const raw = process.env.MAGIC_LINK_SECRET;
  if (!raw) throw new Error('MAGIC_LINK_SECRET is not set');
  return new TextEncoder().encode(raw);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type MagicLinkPayload = {
  email: string;
  stripeCustomerId: string;
};

export async function generateToken(
  payload: MagicLinkPayload,
  ipAddress?: string,
): Promise<string> {
  const secret = getSecret();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setIssuer('mujo-storefront')
    .setAudience('billing-portal')
    .sign(secret);

  await db.insert(magicLinkTokens).values({
    email: payload.email,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: ipAddress ?? null,
  });

  return token;
}

export type VerifyResult =
  | { ok: true; payload: MagicLinkPayload }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'unknown' };

export async function verifyAndConsumeToken(token: string): Promise<VerifyResult> {
  const secret = getSecret();

  let payload: MagicLinkPayload;
  try {
    const { payload: jwtPayload } = await jwtVerify(token, secret, {
      issuer: 'mujo-storefront',
      audience: 'billing-portal',
    });
    const email = typeof jwtPayload.email === 'string' ? jwtPayload.email : '';
    const stripeCustomerId =
      typeof jwtPayload.stripeCustomerId === 'string' ? jwtPayload.stripeCustomerId : '';
    if (!email || !stripeCustomerId) return { ok: false, reason: 'invalid' };
    payload = { email, stripeCustomerId };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }

  const hash = hashToken(token);
  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(eq(magicLinkTokens.id, row.id));

  return { ok: true, payload };
}

// Returns true if the request is allowed, false if rate-limited.
export async function checkRateLimit(
  email: string,
  options: { maxRequests?: number; windowMinutes?: number } = {},
): Promise<boolean> {
  const max = options.maxRequests ?? 3;
  const windowMs = (options.windowMinutes ?? 60) * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs);

  const recent = await db
    .select({ id: magicLinkTokens.id })
    .from(magicLinkTokens)
    .where(
      and(eq(magicLinkTokens.email, email), gte(magicLinkTokens.createdAt, cutoff)),
    );

  return recent.length < max;
}
