/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  })
);

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(),
  sendRawTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  getLatestBlockhash: vi.fn(),
  initializeRoute: vi.fn(),
  initializeRouteSOL: vi.fn(),
  addHopsBatched: vi.fn(),
  markDeployed: vi.fn(),
  routeHasHopsQuery: vi.fn(),
  getRouteConfigQuery: vi.fn(),
  getObfuscationSessionQuery: vi.fn(),
  invalidateRoutes: vi.fn(),
  invalidateRouteState: vi.fn(),
  transactionFrom: vi.fn(),
  fromSecretKey: vi.fn(),
  decode: vi.fn(),
  fundObfuscation: vi.fn(),
  hasObfuscation: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  toast: toastMock,
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
  useConnection: () => ({
    connection: {
      sendRawTransaction: mocks.sendRawTransaction,
      confirmTransaction: mocks.confirmTransaction,
      getLatestBlockhash: mocks.getLatestBlockhash,
    },
  }),
}));

vi.mock("@solana/web3.js", () => ({
  Transaction: {
    from: mocks.transactionFrom,
  },
  Keypair: {
    fromSecretKey: mocks.fromSecretKey,
  },
}));

vi.mock("bs58", () => ({
  default: {
    decode: mocks.decode,
  },
}));

vi.mock("../trpc", () => ({
  trpc: {
    useUtils: () => ({
      client: {
        contract: {
          routeHasHops: {
            query: mocks.routeHasHopsQuery,
          },
          getRouteConfig: {
            query: mocks.getRouteConfigQuery,
          },
        },
        routes: {
          getObfuscationSession: {
            query: mocks.getObfuscationSessionQuery,
          },
        },
      },
      routes: {
        getByCreator: {
          invalidate: mocks.invalidateRoutes,
        },
      },
      contract: {
        getRouteState: {
          invalidate: mocks.invalidateRouteState,
        },
      },
    }),
    contract: {
      initializeRoute: {
        useMutation: () => ({
          mutateAsync: mocks.initializeRoute,
        }),
      },
      addHopsBatched: {
        useMutation: () => ({
          mutateAsync: mocks.addHopsBatched,
        }),
      },
      initializeRouteSOL: {
        useMutation: () => ({
          mutateAsync: mocks.initializeRouteSOL,
        }),
      },
    },
    routes: {
      markDeployed: {
        useMutation: () => ({
          mutateAsync: mocks.markDeployed,
        }),
      },
    },
  },
}));

vi.mock("../hooks/useObfuscationDeploy", () => ({
  useObfuscationDeploy: () => ({
    fundObfuscation: mocks.fundObfuscation,
    hasObfuscation: mocks.hasObfuscation,
  }),
}));

import { useDeploy } from "../hooks/useDeploy";

const createSignedTx = () => ({
  serialize: () => Buffer.from("signed"),
  partialSign: vi.fn(),
});

describe("useDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeHasHopsQuery.mockReset();
    mocks.getRouteConfigQuery.mockReset();
    mocks.getObfuscationSessionQuery.mockReset();

    mocks.useWallet.mockReturnValue({
      publicKey: { toBase58: () => "wallet-1" },
      sendTransaction: vi.fn(),
      signTransaction: vi.fn(async () => createSignedTx()),
      signAllTransactions: vi.fn(async (txs: unknown[]) =>
        txs.map(() => ({
          serialize: () => Buffer.from("batch-signed"),
        }))
      ),
    });
    mocks.sendRawTransaction.mockResolvedValue("chain-signature");
    mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
    mocks.getLatestBlockhash.mockResolvedValue({
      blockhash: "setup-blockhash",
      lastValidBlockHeight: 321,
    });
    mocks.initializeRoute.mockResolvedValue({
      data: {
        transaction: "init-tx",
        recentBlockhash: "blockhash-1",
        lastValidBlockHeight: 123,
      },
    });
    mocks.initializeRouteSOL.mockResolvedValue({
      data: {
        transaction: "sol-init-tx",
        recentBlockhash: "blockhash-1",
        lastValidBlockHeight: 123,
      },
    });
    mocks.addHopsBatched.mockResolvedValue({
      data: {
        transactions: [
          {
            transaction: "batch-1",
            recentBlockhash: "batch-blockhash",
            lastValidBlockHeight: 222,
          },
        ],
        totalBatches: 1,
      },
    });
    mocks.markDeployed.mockResolvedValue({ ok: true });
    mocks.routeHasHopsQuery
      .mockResolvedValueOnce({ data: { hasHops: false, isDeployed: false } })
      .mockResolvedValueOnce({ data: { hasHops: true, isDeployed: true } });
    mocks.getRouteConfigQuery.mockResolvedValue({
      data: { hops: [] },
    });
    mocks.getObfuscationSessionQuery.mockResolvedValue({
      data: { status: "pending" },
    });
    mocks.invalidateRoutes.mockResolvedValue(undefined);
    mocks.invalidateRouteState.mockResolvedValue(undefined);
    mocks.transactionFrom.mockImplementation(() => ({
      serialize: () => Buffer.from("tx"),
      partialSign: vi.fn(),
    }));
    mocks.fromSecretKey.mockReturnValue({ publicKey: "additional-signer" });
    mocks.decode.mockReturnValue(new Uint8Array([1, 2, 3]));
    mocks.hasObfuscation.mockResolvedValue(false);
    mocks.fundObfuscation.mockResolvedValue(undefined);
  });

  it("requires a connected wallet to deploy", async () => {
    mocks.useWallet.mockReturnValue({
      publicKey: null,
      sendTransaction: null,
      signTransaction: null,
      signAllTransactions: null,
    });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 1,
            databaseId: 2,
            hops: [],
            hopAmount: "1",
          },
          "SOL"
        )
      ).rejects.toThrow("Wallet not connected");
    });
  });

  it("uses the obfuscation flow when abstraction is enabled and unfinished", async () => {
    mocks.hasObfuscation.mockResolvedValue(true);
    mocks.getObfuscationSessionQuery.mockResolvedValue({
      data: { status: "funding" },
    });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 11,
            databaseId: 22,
            hops: [{ recipient: "r1", scheduledAt: Date.now() }],
            hopAmount: "5",
            splMint: "mint-1",
          },
          "SPL"
        )
      ).resolves.toBeUndefined();
    });

    expect(mocks.fundObfuscation).toHaveBeenCalledWith(22);
    expect(mocks.invalidateRoutes).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith(
      "Route deployed with abstraction! Hops will execute at scheduled times.",
      { id: "deploy" }
    );
  });

  it("initializes a new route, adds hops, verifies on-chain state, and marks it deployed", async () => {
    const signTransaction = vi.fn(async () => createSignedTx());
    const signAllTransactions = vi.fn(async (txs: unknown[]) =>
      txs.map(() => ({
        serialize: () => Buffer.from("batch"),
      }))
    );
    mocks.useWallet.mockReturnValue({
      publicKey: { toBase58: () => "wallet-1" },
      sendTransaction: vi.fn(),
      signTransaction,
      signAllTransactions,
    });
    mocks.initializeRoute.mockResolvedValue({
      data: {
        transaction: "init-tx",
        setupTransaction: "setup-tx",
        additionalSignerSecret: "secret-1",
        recentBlockhash: "blockhash-1",
        lastValidBlockHeight: 123,
      },
    });
    mocks.transactionFrom
      .mockImplementationOnce(() => createSignedTx())
      .mockImplementationOnce(() => createSignedTx())
      .mockImplementationOnce(() => ({ serialize: () => Buffer.from("batch") }));

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 77,
            databaseId: 88,
            hops: [
              { recipient: "wallet-a", scheduledAt: "2026-04-01T10:00:00Z" },
              {
                recipient: "wallet-b",
                scheduledAt: "2026-04-01T10:05:00Z",
                delayMinutes: 5,
              },
            ],
            hopAmount: "100",
            splMint: "spl-mint",
          },
          "SPL"
        )
      ).resolves.toBe("chain-signature");
    });

    expect(mocks.initializeRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: 77,
        hopAmount: "100",
        splMint: "spl-mint",
      })
    );
    expect(mocks.addHopsBatched).toHaveBeenCalledWith({
      routeId: 77,
      hops: expect.arrayContaining([
        expect.objectContaining({ recipient: "wallet-a" }),
        expect.objectContaining({ recipient: "wallet-b" }),
      ]),
    });
    expect(mocks.markDeployed).toHaveBeenCalledWith({
      id: 88,
      deploymentTxHash: "chain-signature",
    });
    expect(mocks.invalidateRoutes).toHaveBeenCalled();
    expect(mocks.invalidateRouteState).toHaveBeenCalledWith({ routeId: 77 });
  });

  it("adds missing hops to an already initialized route", async () => {
    mocks.initializeRouteSOL.mockRejectedValueOnce(
      new Error("Transaction simulation failed: account already in use")
    );
    mocks.routeHasHopsQuery.mockReset();
    mocks.routeHasHopsQuery
      .mockResolvedValueOnce({ data: { hasHops: false, isDeployed: true } })
      .mockResolvedValueOnce({ data: { hasHops: true, isDeployed: true } });
    mocks.getRouteConfigQuery.mockResolvedValueOnce({
      data: { hops: [] },
    });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 33,
            databaseId: 44,
            hops: [{ recipient: "wallet-a", scheduledAt: 1_700_000_000_000 }],
            hopAmount: "10",
          },
          "SOL"
        )
      ).resolves.toBe("hops-added");
    });

    expect(mocks.addHopsBatched).toHaveBeenCalled();
    expect(mocks.markDeployed).toHaveBeenCalledWith({
      id: 44,
      deploymentTxHash: "recovered-from-chain",
    });
    expect(toastMock.success).toHaveBeenCalledWith(
      "1 hops added successfully!",
      { id: "deploy" }
    );
  });

  it("adds only the missing hops after an already-initialized route error", async () => {
    mocks.initializeRouteSOL.mockRejectedValueOnce(
      new Error("custom program error: 0x0")
    );
    mocks.routeHasHopsQuery.mockReset();
    mocks.routeHasHopsQuery
      .mockResolvedValueOnce({ data: { hasHops: false, isDeployed: false } })
      .mockResolvedValueOnce({ data: { hasHops: true, isDeployed: true } })
      .mockResolvedValueOnce({ data: { hasHops: true, isDeployed: true } });
    mocks.getRouteConfigQuery.mockReset();
    mocks.getRouteConfigQuery.mockResolvedValueOnce({
      data: {
        hops: [{ recipient: "wallet-a" }],
      },
    });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 73,
            databaseId: 74,
            hops: [
              { recipient: "wallet-a", scheduledAt: 1_700_000_000_000 },
              { recipient: "wallet-b", scheduledAt: 1_700_000_060_000 },
              { recipient: "wallet-c", scheduledAt: 1_700_000_120_000 },
            ],
            hopAmount: "10",
          },
          "SOL"
        )
      ).resolves.toMatchObject({
        kind: "already-initialized",
      });
    });

    expect(mocks.addHopsBatched).toHaveBeenCalledWith({
      routeId: 73,
      hops: [
        { recipient: "wallet-b", scheduledAt: 1_700_000_060_000 },
        { recipient: "wallet-c", scheduledAt: 1_700_000_120_000 },
      ],
    });
    expect(mocks.markDeployed).toHaveBeenCalledWith({
      id: 74,
      deploymentTxHash: "recovered-from-chain",
    });
  });

  it("returns early when the route is already fully deployed", async () => {
    mocks.routeHasHopsQuery.mockReset();
    mocks.routeHasHopsQuery.mockResolvedValueOnce({
      data: { hasHops: true, isDeployed: true },
    });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 55,
            databaseId: 66,
            hops: [{ recipient: "wallet-a", scheduledAt: 1_700_000_000_000 }],
            hopAmount: "10",
          },
          "SOL"
        )
      ).resolves.toBe("already-deployed");
    });

    expect(toastMock.success).toHaveBeenCalledWith(
      "Route is already fully deployed!",
      { id: "deploy" }
    );
  });

  it("skips obfuscation re-funding when the route is already deployed on-chain but missing hops", async () => {
    mocks.hasObfuscation.mockResolvedValue(true);
    mocks.getObfuscationSessionQuery.mockResolvedValue({
      data: { status: "funding" },
    });
    mocks.routeHasHopsQuery.mockReset();
    mocks.routeHasHopsQuery
      .mockResolvedValueOnce({ data: { hasHops: false, isDeployed: true } })
      .mockResolvedValueOnce({ data: { hasHops: true, isDeployed: true } });

    const { result } = renderHook(() => useDeploy());

    await act(async () => {
      await expect(
        result.current.deploy(
          {
            routeId: 91,
            databaseId: 92,
            hops: [
              { recipient: "wallet-a", scheduledAt: 1_700_000_000_000 },
              { recipient: "wallet-b", scheduledAt: 1_700_000_060_000 },
            ],
            hopAmount: "10",
          },
          "SOL"
        )
      ).resolves.toBe("hops-added");
    });

    expect(mocks.fundObfuscation).not.toHaveBeenCalled();
    expect(mocks.addHopsBatched).toHaveBeenCalledWith({
      routeId: 91,
      hops: [
        { recipient: "wallet-a", scheduledAt: 1_700_000_000_000 },
        { recipient: "wallet-b", scheduledAt: 1_700_000_060_000 },
      ],
    });
  });
});
