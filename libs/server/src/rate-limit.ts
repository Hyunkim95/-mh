import { FastifyRequest, FastifyReply } from "fastify";

type RateLimitBucket = "public" | "protected" | "admin";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitCheckOptions = {
  bucket: RateLimitBucket;
  path: string;
  req?: FastifyRequest | { headers?: Record<string, unknown>; ip?: string };
  userId?: string | number | null;
  publicKey?: string | null;
};

const WINDOW_MS_DEFAULT = 60_000;
const LIMIT_DEFAULTS: Record<RateLimitBucket, number> = {
  public: 30,
  protected: 120,
  admin: 300,
};

const store = new Map<string, RateLimitEntry>();

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getWindowMs = () =>
  parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, WINDOW_MS_DEFAULT);

const getLimitForBucket = (bucket: RateLimitBucket) => {
  const envName =
    bucket === "public"
      ? "RATE_LIMIT_PUBLIC_MAX"
      : bucket === "protected"
        ? "RATE_LIMIT_PROTECTED_MAX"
        : "RATE_LIMIT_ADMIN_MAX";

  return parsePositiveInt(process.env[envName], LIMIT_DEFAULTS[bucket]);
};

const getClientIp = (
  req?: FastifyRequest | { headers?: Record<string, unknown>; ip?: string }
) => {
  if (!req) {
    return "unknown";
  }

  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return req.ip || "unknown";
};

const buildKey = ({
  bucket,
  path,
  req,
  userId,
  publicKey,
}: RateLimitCheckOptions) => {
  const identity =
    bucket === "public"
      ? `ip:${getClientIp(req)}`
      : `user:${userId ?? "unknown"}:${publicKey ?? "unknown"}:ip:${getClientIp(req)}`;

  return `${bucket}:${path}:${identity}`;
};

export const checkRateLimit = (options: RateLimitCheckOptions) => {
  const key = buildKey(options);
  const now = Date.now();
  const windowMs = getWindowMs();
  const limit = getLimitForBucket(options.bucket);
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const nextEntry = {
      count: 1,
      resetAt: now + windowMs,
    };
    store.set(key, nextEntry);

    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - nextEntry.count, 0),
      retryAfterMs: windowMs,
      resetAt: nextEntry.resetAt,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterMs: Math.max(current.resetAt - now, 0),
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - current.count, 0),
    retryAfterMs: Math.max(current.resetAt - now, 0),
    resetAt: current.resetAt,
  };
};

export const applyRateLimitHeaders = (
  reply:
    | FastifyReply
    | { header: (name: string, value: string | number) => unknown }
    | undefined,
  result: {
    limit: number;
    remaining: number;
    retryAfterMs: number;
    resetAt: number;
  }
) => {
  if (!reply || typeof reply.header !== "function") {
    return;
  }

  reply.header("x-ratelimit-limit", String(result.limit));
  reply.header("x-ratelimit-remaining", String(result.remaining));
  reply.header("x-ratelimit-reset", String(Math.ceil(result.resetAt / 1000)));
  reply.header(
    "retry-after",
    String(Math.max(Math.ceil(result.retryAfterMs / 1000), 1))
  );
};

export const resetRateLimitStore = () => {
  store.clear();
};
