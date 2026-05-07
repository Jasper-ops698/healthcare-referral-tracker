import type { Request, Response, NextFunction } from 'express';

type Bucket = {
  hits: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const REDIS_REST_URL = process.env.REDIS_REST_URL?.replace(/\/+$/, '');
const REDIS_REST_TOKEN = process.env.REDIS_REST_TOKEN;
let redisUnavailableLogged = false;

function getClientKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return email ? `${ip}:${email}` : String(ip);
}

function buildLimiterKey(label: string, req: Request): string {
  return `auth_rl:${label}:${getClientKey(req)}`;
}

async function incrementRedisWindowedCounter(key: string, ttlSeconds: number): Promise<number | null> {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) return null;

  try {
    // INCR key
    const incrRes = await fetch(`${REDIS_REST_URL}/incr/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
    });
    if (!incrRes.ok) throw new Error(`INCR failed with ${incrRes.status}`);

    const incrBody = await incrRes.json() as { result?: number };
    const current = typeof incrBody.result === 'number' ? incrBody.result : NaN;
    if (!Number.isFinite(current)) throw new Error('Invalid INCR result');

    // On first hit, set TTL so the key self-expires.
    if (current === 1) {
      const expireRes = await fetch(`${REDIS_REST_URL}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
      });
      if (!expireRes.ok) throw new Error(`EXPIRE failed with ${expireRes.status}`);
    }

    return current;
  } catch (error) {
    if (!redisUnavailableLogged) {
      redisUnavailableLogged = true;
      console.warn('[AuthRateLimit] Redis unavailable, falling back to in-memory limiter:', error);
    }
    return null;
  }
}

function createRateLimiter(maxHits: number, windowMs: number, label: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ttlSeconds = Math.ceil(windowMs / 1000);
    const redisKey = buildLimiterKey(label, req);
    const redisHits = await incrementRedisWindowedCounter(redisKey, ttlSeconds);

    if (redisHits !== null) {
      if (redisHits > maxHits) {
        res.setHeader('Retry-After', ttlSeconds.toString());
        res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: `Too many attempts. Try again in ${ttlSeconds} seconds.`,
          },
        });
        return;
      }
      next();
      return;
    }

    const now = Date.now();
    const key = redisKey;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { hits: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.hits >= maxHits) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
        },
      });
      return;
    }

    existing.hits += 1;
    buckets.set(key, existing);
    next();
  };
}

// 10 attempts per 15 minutes per IP/email
export const loginRateLimiter = createRateLimiter(10, 15 * 60 * 1000, 'login');

// 8 attempts per 10 minutes per IP/email
export const twoFactorRateLimiter = createRateLimiter(8, 10 * 60 * 1000, '2fa');
