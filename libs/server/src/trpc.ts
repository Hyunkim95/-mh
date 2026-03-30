import { initTRPC, TRPCError } from "@trpc/server";
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { userSchema } from "./auth/schema/user.entities";
import { InferSelectModel } from "drizzle-orm";
import cors from "@fastify/cors";
import crypto from "crypto";
import { rootLogger } from "@libs/logger";
import { trace } from "@opentelemetry/api";
import { applyRateLimitHeaders, checkRateLimit } from "./rate-limit";

export const server = Fastify({
  maxParamLength: 5000,
});

server.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || "secret",
});

export const createContext = async ({
  req,
  res,
}: CreateFastifyContextOptions) => {
  let user: InferSelectModel<typeof userSchema> | null = null;

  if (req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = server.jwt.verify(token) as InferSelectModel<
      typeof userSchema
    >;
    user = decoded;
  }

  const requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.header("x-request-id", requestId);

  return {
    user,
    fastify: server,
    req,
    res,
    requestId,
    log: rootLogger.child({ requestId }),
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  /** TODO: Uncomment this when we have an admin role */
  // if (ctx.user.role !== "admin") {
  //   throw new TRPCError({
  //     code: "FORBIDDEN",
  //     message: "Admin access required",
  //   });
  // }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Middleware to attach routeId and tRPC path to the active OTel span
const attachRouteId = t.middleware(async ({ input, next, path }) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.updateName(`trpc ${path}`);
    span.setAttribute("rpc.method", path);
  }

  // Extract routeId from input if present
  if (input && typeof input === "object" && "routeId" in input) {
    const rid = (input as Record<string, unknown>).routeId;
    if (rid != null) {
      span?.setAttribute("route.id", String(rid));
    }
  }

  return next();
});

const withRateLimit = (bucket: "public" | "protected" | "admin") =>
  t.middleware(async ({ ctx, next, path }) => {
    const result = checkRateLimit({
      bucket,
      path,
      req: ctx.req,
      userId: ctx.user?.id ?? null,
      publicKey: ctx.user?.publicKey ?? null,
    });

    applyRateLimitHeaders(ctx.res, result);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${Math.max(
          Math.ceil(result.retryAfterMs / 1000),
          1
        )} second(s).`,
      });
    }

    return next();
  });

export const publicProcedure = t.procedure.use(attachRouteId).use(withRateLimit("public"));
export const protectedProcedure = t.procedure
  .use(attachRouteId)
  .use(isAuthenticated)
  .use(withRateLimit("protected"));
export const adminProcedure = t.procedure
  .use(attachRouteId)
  .use(isAdmin)
  .use(withRateLimit("admin"));
