import { createHash } from 'node:crypto';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { db, magicLinkTokens } from 'db';

const ISSUER = 'mujo-storefront';

/**
 * Three audiences with different security domains:
 *  - 'billing-portal': 15-min single-use deep-link to Stripe Customer Portal
 *  - 'session':        7-day session cookie redeem (account login)
 *  - 'email-change':   24-hour confirm-link sent to *new* email address
 *
 * Each audience has its own HMAC secret so rotating one cannot invalidate
 * the others. Tokens carry the audience claim and are validated against it
 * on verify.
 */
export type MagicLinkAudience = 'billing-portal' | 'session' | 'email-change';

const TTL_BY_AUDIENCE: Record<MagicLinkAudience, number> = {
  'billing-portal': 15 * 60,
  'session': 7 * 24 * 60 * 60,
  'email-change': 24 * 60 * 60,
};

const SECRET_ENV_BY_AUDIENCE: Record<MagicLinkAudience, string> = {
  'billing-portal': 'MAGIC_LINK_SECRET',
  'session': 'MUJO_SESSION_SECRET',
  'email-change': 'EMAIL_CHANGE_SECRET',
};

function getSecret(audience: MagicLinkAudience): Uint8Array {
  const envName = SECRET_ENV_BY_AUDIENCE[audience];
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set`);
  return new TextEncoder().encode(raw);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type MagicLinkPayloadByAudience = {
  'billing-portal': { email: string; stripeCustomerId: string };
  'session': {
    email: string;
    customerId: string;
    stripeCustomerId: string | null;
  };
  'email-change': { customerId: string; oldEmail: string; newEmail: string };
};

export async function generateToken<A extends MagicLinkAudience>(
  audience: A,
  payload: MagicLinkPayloadByAudience[A],
  options: { ipAddress?: string; rateLimitEmail?: string } = {},
): Promise<string> {
  const ttl = TTL_BY_AUDIENCE[audience];
  const secret = getSecret(audience);
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const token = await new SignJWT({ ...(payload as Record<string, unknown>) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .sign(secret);

  // Rate-limit row: keyed on a primary email so checkRateLimit can find it.
  // For email-change, we want rate-limit by the requesting customer's
  // primary email, not the new email destination — caller passes `rateLimitEmail`.
  const p = payload as {
    email?: string;
    oldEmail?: string;
    newEmail?: string;
  };
  const rowEmail =
    options.rateLimitEmail ?? p.email ?? p.oldEmail ?? p.newEmail ?? '';

  await db.insert(magicLinkTokens).values({
    email: rowEmail,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: options.ipAddress ?? null,
  });

  return token;
}

export type VerifyResult<A extends MagicLinkAudience> =
  | { ok: true; payload: MagicLinkPayloadByAudience[A] }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'unknown' };

export async function verifyAndConsumeToken<A extends MagicLinkAudience>(
  audience: A,
  token: string,
): Promise<VerifyResult<A>> {
  const secret = getSecret(audience);

  let payload: MagicLinkPayloadByAudience[A];
  try {
    const { payload: jwt } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience,
    });
    if (audience === 'billing-portal') {
      const email = typeof jwt.email === 'string' ? jwt.email : '';
      const stripeCustomerId =
        typeof jwt.stripeCustomerId === 'string' ? jwt.stripeCustomerId : '';
      if (!email || !stripeCustomerId) return { ok: false, reason: 'invalid' };
      payload = {
        email,
        stripeCustomerId,
      } as MagicLinkPayloadByAudience[A];
    } else if (audience === 'session') {
      const email = typeof jwt.email === 'string' ? jwt.email : '';
      const customerId =
        typeof jwt.customerId === 'string' ? jwt.customerId : '';
      const stripeCustomerId =
        typeof jwt.stripeCustomerId === 'string' ? jwt.stripeCustomerId : null;
      if (!email || !customerId) return { ok: false, reason: 'invalid' };
      payload = {
        email,
        customerId,
        stripeCustomerId,
      } as MagicLinkPayloadByAudience[A];
    } else {
      const customerId =
        typeof jwt.customerId === 'string' ? jwt.customerId : '';
      const oldEmail = typeof jwt.oldEmail === 'string' ? jwt.oldEmail : '';
      const newEmail = typeof jwt.newEmail === 'string' ? jwt.newEmail : '';
      if (!customerId || !oldEmail || !newEmail)
        return { ok: false, reason: 'invalid' };
      payload = {
        customerId,
        oldEmail,
        newEmail,
      } as MagicLinkPayloadByAudience[A];
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }

  // DB consume — audience-agnostic. Reuses the existing magic_link_tokens
  // table; idempotency comes from the unique tokenHash + usedAt mark-on-use.
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

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Global per-email (no audience filter — conservative: a customer abusing
 * one audience can't pivot to another).
 *
 * Counts only *unspent* tokens (used_at IS NULL) so an honest user clicking
 * the link they just received doesn't burn a slot. Anti-abuse property still
 * holds: an attacker spamming the endpoint accumulates unused rows fast.
 */
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
      and(
        eq(magicLinkTokens.email, email),
        gte(magicLinkTokens.createdAt, cutoff),
        isNull(magicLinkTokens.usedAt),
      ),
    );

  return recent.length < max;
}
