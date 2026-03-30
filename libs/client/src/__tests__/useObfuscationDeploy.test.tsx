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
  getFundingTxs: vi.fn(),
  confirmFunding: vi.fn(),
  fetchObfuscationSession: vi.fn(),
  transactionFrom: vi.fn(),
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
    },
  }),
}));

vi.mock("@solana/web3.js", () => ({
  Transaction: {
    from: mocks.transactionFrom,
  },
}));

vi.mock("../trpc", () => ({
  trpc: {
    useUtils: () => ({
      routes: {
        getObfuscationSession: {
          fetch: mocks.fetchObfuscationSession,
        },
      },
    }),
    routes: {
      getObfuscationFundingTransactions: {
        useMutation: () => ({
          mutateAsync: mocks.getFundingTxs,
        }),
      },
      confirmObfuscationFunding: {
        useMutation: () => ({
          mutateAsync: mocks.confirmFunding,
        }),
      },
    },
  },
}));

import { useObfuscationDeploy } from "../hooks/useObfuscationDeploy";

describe("useObfuscationDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useWallet.mockReturnValue({
      publicKey: { toBase58: () => "wallet-1" },
      signAllTransactions: vi.fn(async (txs: unknown[]) =>
        txs.map(() => ({
          serialize: () => Buffer.from("signed"),
        }))
      ),
    });

    mocks.sendRawTransaction.mockResolvedValue("sig-1");
    mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
    mocks.confirmFunding.mockResolvedValue({ ok: true });
    mocks.fetchObfuscationSession.mockResolvedValue({ success: true });
    mocks.transactionFrom.mockImplementation(() => ({
      serialize: () => Buffer.from("tx"),
    }));
  });

  it("rejects funding when the wallet cannot batch-sign", async () => {
    mocks.useWallet.mockReturnValue({
      publicKey: null,
      signAllTransactions: null,
    });

    const { result } = renderHook(() => useObfuscationDeploy());

    await act(async () => {
      await expect(result.current.fundObfuscation(7)).rejects.toThrow(
        "Wallet not connected or doesn't support batch signing"
      );
    });

    expect(toastMock.error).toHaveBeenCalledWith("Please connect your wallet");
  });

  it("short-circuits when all intermediate wallets are already funded", async () => {
    mocks.getFundingTxs.mockResolvedValue({
      data: {
        transactions: [],
        totalTransactions: 0,
      },
    });

    const { result } = renderHook(() => useObfuscationDeploy());

    await act(async () => {
      await expect(result.current.fundObfuscation(12)).resolves.toBeUndefined();
    });

    expect(toastMock.success).toHaveBeenCalledWith(
      "All wallets already funded!",
      { id: "obfuscation" }
    );
  });

  it("funds wallets, confirms each successful transaction, and starts deployment", async () => {
    const signAllTransactions = vi.fn(async (txs: unknown[]) =>
      txs.map((_, index) => ({
        serialize: () => Buffer.from(`signed-${index}`),
      }))
    );

    mocks.useWallet.mockReturnValue({
      publicKey: { toBase58: () => "wallet-1" },
      signAllTransactions,
    });
    mocks.getFundingTxs.mockResolvedValue({
      data: {
        totalTransactions: 2,
        transactions: [
          { walletIndex: 0, serialized: "tx-1" },
          { walletIndex: 1, serialized: "tx-2" },
        ],
      },
    });
    mocks.sendRawTransaction
      .mockResolvedValueOnce("sig-1")
      .mockResolvedValueOnce("sig-2");

    const { result } = renderHook(() => useObfuscationDeploy());

    await act(async () => {
      await expect(result.current.fundObfuscation(22)).resolves.toBeUndefined();
    });

    expect(signAllTransactions).toHaveBeenCalledOnce();
    expect(mocks.confirmFunding).toHaveBeenNthCalledWith(1, {
      routeId: 22,
      walletIndex: 0,
      txHash: "sig-1",
    });
    expect(mocks.confirmFunding).toHaveBeenNthCalledWith(2, {
      routeId: 22,
      walletIndex: 1,
      txHash: "sig-2",
    });
    expect(toastMock).toHaveBeenCalledWith(
      "Funding complete. Route deployment will begin shortly...",
      expect.objectContaining({ id: "obfuscation" })
    );
  });

  it("reports whether a route has obfuscation", async () => {
    const { result } = renderHook(() => useObfuscationDeploy());

    await expect(result.current.hasObfuscation(1)).resolves.toBe(true);

    mocks.fetchObfuscationSession.mockResolvedValueOnce(null);
    await expect(result.current.hasObfuscation(2)).resolves.toBe(false);

    mocks.fetchObfuscationSession.mockRejectedValueOnce(new Error("boom"));
    await expect(result.current.hasObfuscation(3)).resolves.toBe(false);
  });
});
