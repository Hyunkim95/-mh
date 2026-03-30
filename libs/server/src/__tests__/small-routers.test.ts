import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.HELIUS_API = "http://localhost:8899";

// ── Auth router mocks ──
const authMocks = vi.hoisted(() => ({
  createChallenge: vi.fn(),
  verifyUserWithSignature: vi.fn(),
  jwtSign: vi.fn(),
}));

vi.mock("../auth/services/auth.service", () => ({
  authService: {
    createChallenge: authMocks.createChallenge,
  },
}));

vi.mock("../auth/services/users.service", () => ({
  usersService: {
    verifyUserWithSignature: authMocks.verifyUserWithSignature,
  },
}));

// ── Tokens router mocks ──
const tokensMocks = vi.hoisted(() => ({
  getTokensAccountsWithCache: vi.fn(),
  crossSectionWithTokenConfigs: vi.fn(),
  getTokenPrice: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("../solana/services/tokens.service", () => ({
  tokensService: {
    getTokensAccountsWithCache: tokensMocks.getTokensAccountsWithCache,
    crossSectionWithTokenConfigs: tokensMocks.crossSectionWithTokenConfigs,
    getTokenPrice: tokensMocks.getTokenPrice,
    invalidateCache: tokensMocks.invalidateCache,
  },
}));

// ── Token configs router mocks ──
const tcMocks = vi.hoisted(() => ({
  findByCreator: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("../token-configs/services/token-configs.service", () => ({
  tokenConfigsService: {
    findByCreator: tcMocks.findByCreator,
    findById: tcMocks.findById,
  },
}));

import { authRouter } from "../routers/auth.router";
import { tokensRouter } from "../routers/tokens.router";
import { tokenConfigsRouter } from "../routers/token-configs.router";
import { helloRouter } from "../routers/hello";

// ── Auth Router Tests ──
describe("authRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("me", () => {
    it("returns the current user from context", async () => {
      const user = { id: 1, publicKey: "abc", role: "user" };
      const caller = authRouter.createCaller({ user } as any);

      const result = await caller.me();

      expect(result).toEqual(user);
    });

    it("throws UNAUTHORIZED when no user in context", async () => {
      const caller = authRouter.createCaller({ user: null } as any);

      await expect(caller.me()).rejects.toThrow("UNAUTHORIZED");
    });
  });

  describe("createMessage", () => {
    it("returns a challenge", async () => {
      authMocks.createChallenge.mockResolvedValue({
        nonce: "abc123",
        message: "Sign this",
      });

      const caller = authRouter.createCaller({} as any);
      const result = await caller.createMessage();

      expect(result.nonce).toBe("abc123");
    });
  });

  describe("verifyUserWithSignature", () => {
    it("returns JWT token on successful verification", async () => {
      authMocks.verifyUserWithSignature.mockResolvedValue({
        id: 1,
        role: "user",
        publicKey: "abc",
      });
      authMocks.jwtSign.mockReturnValue("jwt-token");

      const caller = authRouter.createCaller({
        fastify: { jwt: { sign: authMocks.jwtSign } },
      } as any);

      const result = await caller.verifyUserWithSignature({
        nonce: "nonce-123",
        address: "wallet-address",
        signature: "sig-bytes",
      });

      expect(result.token).toBe("jwt-token");
    });

    it("throws UNAUTHORIZED when verification fails", async () => {
      authMocks.verifyUserWithSignature.mockResolvedValue(null);

      const caller = authRouter.createCaller({
        fastify: { jwt: { sign: vi.fn() } },
      } as any);

      await expect(
        caller.verifyUserWithSignature({
          nonce: "nonce",
          address: "addr",
          signature: "sig",
        })
      ).rejects.toThrow("UNAUTHORIZED");
    });
  });
});

// ── Tokens Router Tests ──
describe("tokensRouter", () => {
  const adminCtx = {
    user: { id: 1, publicKey: "admin-key", role: "admin" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTokenAccounts", () => {
    it("returns token accounts", async () => {
      tokensMocks.getTokensAccountsWithCache.mockResolvedValue([
        { mint: "token1" },
      ]);

      const caller = tokensRouter.createCaller(adminCtx as any);
      const result = await caller.getTokenAccounts();

      expect(result).toEqual([{ mint: "token1" }]);
    });
  });

  describe("crossSectionWithTokenConfigs", () => {
    it("returns cross-section data", async () => {
      tokensMocks.crossSectionWithTokenConfigs.mockResolvedValue([]);

      const caller = tokensRouter.createCaller(adminCtx as any);
      const result = await caller.crossSectionWithTokenConfigs();

      expect(result).toEqual([]);
    });
  });

  describe("getTokenPrice", () => {
    it("returns token price", async () => {
      tokensMocks.getTokenPrice.mockResolvedValue({ price: 1.5 });

      const caller = tokensRouter.createCaller(adminCtx as any);
      const result = await caller.getTokenPrice("mint-address");

      expect(result).toEqual({ price: 1.5 });
    });
  });

  describe("invalidateCache", () => {
    it("invalidates cache and returns success", async () => {
      const caller = tokensRouter.createCaller(adminCtx as any);
      const result = await caller.invalidateCache();

      expect(result.success).toBe(true);
      expect(tokensMocks.invalidateCache).toHaveBeenCalledWith("admin-key");
    });
  });
});

// ── Token Configs Router Tests ──
describe("tokenConfigsRouter", () => {
  const adminCtx = {
    user: { id: 1, publicKey: "admin-key", role: "admin" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTokenConfigs", () => {
    it("returns configs for creator", async () => {
      tcMocks.findByCreator.mockResolvedValue([{ id: 1 }]);

      const caller = tokenConfigsRouter.createCaller(adminCtx as any);
      const result = await caller.getTokenConfigs();

      expect(result).toEqual([{ id: 1 }]);
      expect(tcMocks.findByCreator).toHaveBeenCalledWith("admin-key");
    });
  });

  describe("getTokenConfigById", () => {
    it("returns config by id", async () => {
      tcMocks.findById.mockResolvedValue({ id: 42 });

      const caller = tokenConfigsRouter.createCaller(adminCtx as any);
      const result = await caller.getTokenConfigById(42);

      expect(result).toEqual({ id: 42 });
    });
  });
});

// ── Hello Router Tests ──
describe("helloRouter", () => {
  const caller = helloRouter.createCaller({} as any);

  describe("greeting", () => {
    it("returns greeting with name", async () => {
      const result = await caller.greeting({ name: "Alice" });

      expect(result.message).toBe("Hello Alice!");
      expect(result.timestamp).toBeDefined();
    });

    it("returns greeting with default name", async () => {
      const result = await caller.greeting({});

      expect(result.message).toBe("Hello World!");
    });
  });

  describe("create", () => {
    it("creates an item", async () => {
      const result = await caller.create({
        title: "Test",
        content: "Content",
      });

      expect(result.title).toBe("Test");
      expect(result.content).toBe("Content");
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it("uses empty string for missing content", async () => {
      const result = await caller.create({ title: "No content" });

      expect(result.content).toBe("");
    });
  });
});
