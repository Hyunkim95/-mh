/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  sendTransaction: vi.fn(),
  simulateTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  initializeSpl: {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  },
  initializeSol: {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  transactionFrom: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    sendTransaction: mocks.sendTransaction,
    connect: mocks.connect,
  }),
  useConnection: () => ({
    connection: {
      simulateTransaction: mocks.simulateTransaction,
      confirmTransaction: mocks.confirmTransaction,
    },
  }),
}));

vi.mock("../trpc", () => ({
  trpc: {
    contract: {
      initializeTokenConfig: {
        useMutation: () => mocks.initializeSpl,
      },
      initializeTokenConfigSOL: {
        useMutation: () => mocks.initializeSol,
      },
    },
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    Transaction: {
      from: mocks.transactionFrom,
    },
  };
});

import { useInitializeTokenConfig } from "../hooks/useInitializeTokenConfig";

describe("useInitializeTokenConfig", () => {
  const txResponse = {
    data: {
      transaction: Buffer.from("tx").toString("base64"),
      recentBlockhash: "hash",
      lastValidBlockHeight: 123,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionFrom.mockReturnValue({ serialized: true });
    mocks.sendTransaction.mockResolvedValue("signature-12345678");
    mocks.simulateTransaction.mockResolvedValue({ value: { err: null } });
    mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
    mocks.initializeSpl.mutateAsync.mockResolvedValue(txResponse);
    mocks.initializeSol.mutateAsync.mockResolvedValue(txResponse);
  });

  it("connects wallet when missing and creates SPL token config", async () => {
    const { result } = renderHook(() =>
      useInitializeTokenConfig({ publicKey: null })
    );

    await act(async () => {
      await result.current.handleIntiaizlizeTokenConfig({
        tokenConfig: { feeBps: "50" },
      });
    });

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.initializeSpl.mutateAsync).toHaveBeenCalledWith({
      tokenConfig: { feeBps: "50" },
    });
    expect(mocks.simulateTransaction).toHaveBeenCalled();
    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      { serialized: true },
      expect.any(Object)
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "SPL Token config created successfully! Signature: signatur..."
    );
  });

  it("shows a toast and rethrows when SOL confirmation fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.confirmTransaction.mockResolvedValue({
      value: { err: "boom" },
    });

    const { result } = renderHook(() =>
      useInitializeTokenConfig({ publicKey: {} as never })
    );

    await act(async () => {
      await expect(
        result.current.handleIntiaizlizeTokenConfigSOL({
          tokenConfig: { feeBps: "75" },
        })
      ).rejects.toThrow("Transaction failed: boom");
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      "SOL Token config creation failed: Transaction failed: boom"
    );
    consoleSpy.mockRestore();
  });
});
