/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BN } from "bn.js";

const mocks = vi.hoisted(() => ({
  infoRefetch: vi.fn(),
  balanceRefetch: vi.fn(),
  mutateAsync: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpc: {
    contract: {
      getExecutorInfo: {
        useQuery: () => ({
          data: { data: { publicKey: "executor-wallet" } },
          isLoading: false,
          error: null,
          refetch: mocks.infoRefetch,
        }),
      },
      getExecutorBalance: {
        useQuery: () => ({
          data: { data: { balance: "12345", balanceSOL: "0.000012345" } },
          isLoading: false,
          error: null,
          refetch: mocks.balanceRefetch,
        }),
      },
      withdrawOnBehalf: {
        useMutation: mocks.useMutation,
      },
    },
  },
}));

import { useExecutor } from "../hooks/useExecutor";

describe("useExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useMutation.mockImplementation((options) => ({
      mutateAsync: async (input: unknown) => {
        await options.onSuccess?.();
        return mocks.mutateAsync(input);
      },
      isPending: false,
      error: null,
    }));
    mocks.mutateAsync.mockResolvedValue({ ok: true });
  });

  it("maps query data into executor state", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { result } = renderHook(() => useExecutor(55));

    expect(result.current.publicKey).toBe("executor-wallet");
    expect(result.current.balance).toEqual(new BN("12345"));
    expect(result.current.balanceSOL).toBe(0.000012345);
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
  });

  it("withdraws and refetches balance after success", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { result } = renderHook(() => useExecutor(55));

    await act(async () => {
      await result.current.withdraw("target-wallet", 99);
    });

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      routeId: 55,
      to: "target-wallet",
      amount: "99",
    });
    expect(mocks.balanceRefetch).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });
});
