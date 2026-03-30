/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const trpcMocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: toastMocks,
}));

vi.mock("../trpc", () => ({
  trpc: {
    routes: {
      create: {
        useMutation: () => ({
          mutateAsync: trpcMocks.mutateAsync,
        }),
      },
      getByCreator: {
        useQuery: () => ({
          refetch: trpcMocks.refetch,
        }),
      },
    },
  },
}));

import { useSubmitRoute } from "../hooks/useSubmitRoute";

describe("useSubmitRoute", () => {
  const routeInput = {
    name: "Test Route",
    tokenMint: "mint",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    hopAmountTokens: "1",
    hopAmountRaw: "1000000",
    totalSpendTokens: "1.05",
    hops: [{ recipient: "wallet-1", scheduledAt: "2026-03-30T10:00:00Z" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    trpcMocks.refetch.mockResolvedValue(undefined);
  });

  it("creates a route and returns deploy modal data", async () => {
    trpcMocks.mutateAsync.mockResolvedValue({
      data: {
        id: 1,
        routeId: 101,
        name: "Test Route",
        tokenType: "SOL",
        tokenMint: null,
        tokenSymbol: "SOL",
        hopAmountTokens: "1",
        hopAmountRaw: "1000000",
        hasObfuscation: true,
      },
    });

    const { result } = renderHook(() =>
      useSubmitRoute({ publicKey: null })
    );

    let submitted;
    await act(async () => {
      submitted = await result.current.handleRouteSubmit(routeInput, "SOL");
    });

    expect(trpcMocks.mutateAsync).toHaveBeenCalledWith({
      name: "Test Route",
      tokenType: "SOL",
      tokenMint: "mint",
      tokenSymbol: "USDC",
      tokenDecimals: 6,
      hopAmountTokens: "1",
      hopAmountRaw: "1000000",
      hops: routeInput.hops,
    });
    expect(trpcMocks.refetch).toHaveBeenCalledOnce();
    expect(toastMocks.success).toHaveBeenCalledWith(
      "SOL Route created successfully!"
    );
    expect(submitted).toEqual({
      id: 1,
      routeId: 101,
      name: "Test Route",
      tokenType: "SOL",
      tokenMint: null,
      tokenSymbol: "SOL",
      hopAmountTokens: "1",
      hopAmountRaw: "1000000",
      totalSpendTokens: "1.05",
      hasObfuscation: true,
      hops: routeInput.hops,
    });
  });

  it("shows a toast and returns null when route creation fails", async () => {
    trpcMocks.mutateAsync.mockRejectedValue(new Error("Create failed"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() =>
      useSubmitRoute({ publicKey: null })
    );

    await act(async () => {
      await expect(
        result.current.handleRouteSubmit(routeInput, "SPL")
      ).resolves.toBeNull();
    });

    expect(toastMocks.error).toHaveBeenCalledWith(
      "SPL Route creation failed: Create failed"
    );
    consoleSpy.mockRestore();
  });
});
