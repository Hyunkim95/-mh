/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  walletValue: null as string | null,
  invalidateQueries: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    publicKey: mocks.walletValue
      ? { toBase58: () => mocks.walletValue }
      : null,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: mocks.success,
    error: mocks.error,
  },
}));

import { useWalletChangeEffect } from "../hooks/useWalletChangeEffect";

describe("useWalletChangeEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.walletValue = null;
  });

  it("tracks the current wallet and ignores initial load", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { result } = renderHook(() => useWalletChangeEffect());

    expect(result.current.currentWallet).toBeNull();
    expect(result.current.previousWallet).toBeNull();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("fires callbacks, invalidates creator queries, and shows a toast on wallet change", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const onWalletChange = vi.fn();

    const { rerender } = renderHook(
      (props: { showToast?: boolean; invalidateQueries?: boolean }) =>
        useWalletChangeEffect({
          onWalletChange,
          showToast: props.showToast,
          invalidateQueries: props.invalidateQueries,
        }),
      {
        initialProps: { showToast: true, invalidateQueries: true },
      }
    );

    mocks.walletValue = "wallet-1";
    rerender({ showToast: true, invalidateQueries: true });

    mocks.walletValue = "wallet-2";
    rerender({ showToast: true, invalidateQueries: true });

    expect(onWalletChange).toHaveBeenCalledWith("wallet-1", "wallet-2");
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });

    const predicate =
      mocks.invalidateQueries.mock.calls[0][0].predicate;
    expect(predicate({ queryKey: ["routes.getByCreator", { creator: "abc" }] }))
      .toBe(true);
    expect(predicate({ queryKey: ["routes.getByCreator", { routeId: 1 }] }))
      .toBe(false);
    expect(mocks.success).toHaveBeenCalledWith(
      "Wallet changed - refreshing data for new wallet"
    );

    consoleSpy.mockRestore();
  });

  it("shows disconnect toast when wallet becomes null", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { rerender } = renderHook(() => useWalletChangeEffect());

    mocks.walletValue = "wallet-1";
    rerender();

    mocks.walletValue = null;
    rerender();

    expect(mocks.error).toHaveBeenCalledWith("Wallet disconnected");
    consoleSpy.mockRestore();
  });
});
