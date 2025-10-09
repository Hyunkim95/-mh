import { initTRPC, TRPCError } from "@trpc/server";
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { userSchema } from "./auth/schema/user.entities";
import { InferSelectModel } from "drizzle-orm";
import cors from "@fastify/cors";

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

  return {
    user,
    fastify: server,
    req,
    res,
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

  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthenticated);
export const adminProcedure = t.procedure.use(isAdmin);
