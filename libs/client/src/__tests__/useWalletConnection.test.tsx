/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(),
  select: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
}));

import { useWalletConnection } from "../hooks/useWalletConnection";

describe("useWalletConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: () => "wallet-1" },
      connected: true,
      connecting: false,
      wallet: {
        readyState: "Installed",
        adapter: { name: "Phantom" },
      },
      select: mocks.select,
      connect: mocks.connect.mockResolvedValue(undefined),
      disconnect: mocks.disconnect.mockResolvedValue(undefined),
    });
  });

  it("maps wallet state and clears errors manually", () => {
    const { result } = renderHook(() => useWalletConnection());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.publicKey).toBe("wallet-1");
    expect(result.current.walletName).toBe("Phantom");

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it("selects a wallet and connects successfully", async () => {
    vi.useFakeTimers();
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: () => "wallet-1" },
      connected: true,
      connecting: false,
      wallet: {
        readyState: "Installed",
        adapter: { name: "Solflare" },
      },
      select: mocks.select,
      connect: mocks.connect.mockResolvedValue(undefined),
      disconnect: mocks.disconnect.mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useWalletConnection());

    const promise = act(async () => {
      const connectPromise = result.current.connect("Phantom" as any);
      vi.advanceTimersByTime(100);
      await connectPromise;
    });

    await promise;

    expect(mocks.select).toHaveBeenCalledWith("Phantom");
    expect(mocks.connect).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    vi.useRealTimers();
  });

  it("surfaces wallet readiness errors and failed connections", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.useWallet.mockReturnValueOnce({
      publicKey: null,
      connected: false,
      connecting: false,
      wallet: null,
      select: mocks.select,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
    });
    const noWallet = renderHook(() => useWalletConnection());
    await act(async () => {
      await expect(noWallet.result.current.connect()).rejects.toThrow(
        "No wallet selected"
      );
    });

    mocks.useWallet.mockReturnValueOnce({
      publicKey: null,
      connected: false,
      connecting: false,
      wallet: {
        readyState: "NotDetected",
        adapter: { name: "Phantom" },
      },
      select: mocks.select,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
    });
    const notDetected = renderHook(() => useWalletConnection());
    await act(async () => {
      await expect(notDetected.result.current.connect()).rejects.toThrow(
        "Phantom wallet is not installed"
      );
    });

    mocks.useWallet.mockReturnValueOnce({
      publicKey: null,
      connected: false,
      connecting: false,
      wallet: {
        readyState: "Loadable",
        adapter: { name: "Phantom" },
      },
      select: mocks.select,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
    });
    const loading = renderHook(() => useWalletConnection());
    await act(async () => {
      await expect(loading.result.current.connect()).rejects.toThrow(
        "Phantom wallet is loading"
      );
    });

    mocks.useWallet.mockReturnValueOnce({
      publicKey: null,
      connected: false,
      connecting: false,
      wallet: {
        readyState: "Unsupported",
        adapter: { name: "Phantom" },
      },
      select: mocks.select,
      connect: mocks.connect,
      disconnect: mocks.disconnect,
    });
    const unsupported = renderHook(() => useWalletConnection());
    await act(async () => {
      await expect(unsupported.result.current.connect()).rejects.toThrow(
        "Phantom wallet is not supported on this device"
      );
    });

    mocks.useWallet.mockReturnValueOnce({
      publicKey: null,
      connected: false,
      connecting: false,
      wallet: {
        readyState: "Installed",
        adapter: { name: "Phantom" },
      },
      select: mocks.select,
      connect: mocks.connect.mockResolvedValue(undefined),
      disconnect: mocks.disconnect,
    });
    const failed = renderHook(() => useWalletConnection());
    await act(async () => {
      await expect(failed.result.current.connect()).rejects.toThrow(
        "Failed to connect to wallet"
      );
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("captures disconnect failures without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.disconnect.mockRejectedValueOnce(new Error("disconnect boom"));

    const { result } = renderHook(() => useWalletConnection());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.error).toBe("disconnect boom");
    expect(errorSpy).toHaveBeenCalledWith(
      "Wallet disconnect error:",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});
