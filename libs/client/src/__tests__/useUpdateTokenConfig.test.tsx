/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  simulateTransaction: vi.fn(),
  getLatestBlockhash: vi.fn(),
  confirmTransaction: vi.fn(),
  updateSpl: {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  },
  updateSol: {
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
  }),
  useConnection: () => ({
    connection: {
      simulateTransaction: mocks.simulateTransaction,
      getLatestBlockhash: mocks.getLatestBlockhash,
      confirmTransaction: mocks.confirmTransaction,
    },
  }),
}));

vi.mock("../trpc", () => ({
  trpc: {
    contract: {
      updateTokenConfig: {
        useMutation: () => mocks.updateSpl,
      },
      updateTokenConfigSOL: {
        useMutation: () => mocks.updateSol,
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

import { useUpdateTokenConfig } from "../hooks/useUpdateTokenConfig";

describe("useUpdateTokenConfig", () => {
  const txResponse = {
    data: {
      transaction: Buffer.from("tx").toString("base64"),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionFrom.mockReturnValue({ serialized: true });
    mocks.sendTransaction.mockResolvedValue("signature-12345678");
    mocks.simulateTransaction.mockResolvedValue({ value: { err: null } });
    mocks.getLatestBlockhash.mockResolvedValue({
      blockhash: "hash",
      lastValidBlockHeight: 999,
    });
    mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
    mocks.updateSpl.mutateAsync.mockResolvedValue(txResponse);
    mocks.updateSol.mutateAsync.mockResolvedValue(txResponse);
  });

  it("updates SPL token config successfully", async () => {
    const { result } = renderHook(() =>
      useUpdateTokenConfig({ publicKey: null })
    );

    await act(async () => {
      await result.current.handleUpdateTokenConfig({
        tokenConfig: { feeBps: "10" },
      });
    });

    expect(mocks.updateSpl.mutateAsync).toHaveBeenCalledWith({
      tokenConfig: { feeBps: "10" },
    });
    expect(mocks.simulateTransaction).toHaveBeenCalled();
    expect(mocks.sendTransaction).toHaveBeenCalledWith(
      { serialized: true },
      expect.any(Object),
      { skipPreflight: true }
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "SPL Token config updated successfully! Signature: signatur..."
    );
  });

  it("surfaces simulation errors before sending", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.simulateTransaction.mockResolvedValue({
      value: { err: { code: 123 } },
    });

    const { result } = renderHook(() =>
      useUpdateTokenConfig({ publicKey: null })
    );

    await act(async () => {
      await expect(
        result.current.handleUpdateTokenConfig({
          tokenConfig: { feeBps: "10" },
        })
      ).rejects.toThrow('Simulation failed: {"code":123}');
    });

    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'SPL Token config update failed: Simulation failed: {"code":123}'
    );
    consoleSpy.mockRestore();
  });

  it("updates SOL token config successfully", async () => {
    const { result } = renderHook(() =>
      useUpdateTokenConfig({ publicKey: null })
    );

    await act(async () => {
      await result.current.handleUpdateTokenConfigSOL({
        tokenConfig: { feeBps: "20" },
      });
    });

    expect(mocks.updateSol.mutateAsync).toHaveBeenCalledWith({
      tokenConfig: { feeBps: "20" },
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "SOL Token config updated successfully! Signature: signatur..."
    );
  });
});
