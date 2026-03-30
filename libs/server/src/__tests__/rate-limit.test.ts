import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.HELIUS_API = "http://localhost:8899";

import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../trpc";
import { resetRateLimitStore } from "../rate-limit";

const testRouter = router({
  ping: publicProcedure.query(() => "pong"),
  me: protectedProcedure.query(({ ctx }) => ctx.user.publicKey),
  adminPing: adminProcedure.query(() => "ok"),
});

const buildContext = (options?: {
  ip?: string;
  forwardedFor?: string;
  user?: { id: number; publicKey: string; role: string } | null;
}) => ({
  req: {
    ip: options?.ip ?? "127.0.0.1",
    headers: options?.forwardedFor
      ? { "x-forwarded-for": options.forwardedFor }
      : {},
  },
  res: {
    header: vi.fn(),
  },
  user: options?.user ?? null,
  fastify: {},
  requestId: "req-1",
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
});

describe("tRPC rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStore();
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_PUBLIC_MAX = "2";
    process.env.RATE_LIMIT_PROTECTED_MAX = "2";
    process.env.RATE_LIMIT_ADMIN_MAX = "3";
  });

  afterEach(() => {
    resetRateLimitStore();
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_PUBLIC_MAX;
    delete process.env.RATE_LIMIT_PROTECTED_MAX;
    delete process.env.RATE_LIMIT_ADMIN_MAX;
  });

  it("limits repeated public calls by forwarded client IP", async () => {
    const ctx = buildContext({ forwardedFor: "203.0.113.10, 10.0.0.1" });
    const caller = testRouter.createCaller(ctx as any);

    await expect(caller.ping()).resolves.toBe("pong");
    await expect(caller.ping()).resolves.toBe("pong");
    await expect(caller.ping()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    expect(ctx.res.header).toHaveBeenCalledWith("x-ratelimit-limit", "2");
    expect(ctx.res.header).toHaveBeenCalledWith("x-ratelimit-remaining", "0");
  });

  it("keeps protected buckets separate per authenticated user", async () => {
    const callerA = testRouter.createCaller(
      buildContext({
        ip: "198.51.100.20",
        user: { id: 1, publicKey: "user-a", role: "user" },
      }) as any
    );
    const callerB = testRouter.createCaller(
      buildContext({
        ip: "198.51.100.20",
        user: { id: 2, publicKey: "user-b", role: "user" },
      }) as any
    );

    await expect(callerA.me()).resolves.toBe("user-a");
    await expect(callerA.me()).resolves.toBe("user-a");
    await expect(callerB.me()).resolves.toBe("user-b");
    await expect(callerB.me()).resolves.toBe("user-b");
    await expect(callerA.me()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("uses the admin-specific limit for admin procedures", async () => {
    const caller = testRouter.createCaller(
      buildContext({
        ip: "192.0.2.44",
        user: { id: 99, publicKey: "admin-key", role: "admin" },
      }) as any
    );

    await expect(caller.adminPing()).resolves.toBe("ok");
    await expect(caller.adminPing()).resolves.toBe("ok");
    await expect(caller.adminPing()).resolves.toBe("ok");
    await expect(caller.adminPing()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
