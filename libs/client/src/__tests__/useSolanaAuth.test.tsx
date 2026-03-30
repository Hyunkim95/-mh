/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meUseQuery: vi.fn(),
  createMessage: vi.fn(),
  verifyUserWithSignature: vi.fn(),
  signMessage: vi.fn(),
  signTransaction: vi.fn(),
  disconnectWallet: vi.fn(),
  getLatestBlockhash: vi.fn(),
  cancelQueries: vi.fn(),
  clear: vi.fn(),
  bs58Encode: vi.fn(),
  transfer: vi.fn(),
  transactionAdd: vi.fn(),
  transactionSerialize: vi.fn(),
  publicKeyToString: vi.fn(),
  useWallet: vi.fn(),
  storage: new Map<string, string>(),
}));

vi.mock("bs58", () => ({
  default: {
    encode: mocks.bs58Encode,
  },
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
  useConnection: () => ({
    connection: {
      getLatestBlockhash: mocks.getLatestBlockhash,
    },
  }),
}));

vi.mock("@solana/web3.js", () => {
  class TransactionMock {
    recentBlockhash = "";
    feePayer = null;

    add(...args: unknown[]) {
      mocks.transactionAdd(...args);
      return this;
    }

    serialize() {
      return mocks.transactionSerialize();
    }
  }

  class PublicKeyMock {
    value: string;

    constructor(value: string) {
      this.value = value;
    }

    toBase58() {
      return this.value;
    }
  }

  function TransactionInstructionMock(input: unknown) {
    return input;
  }

  return {
    Transaction: TransactionMock,
    SystemProgram: {
      transfer: mocks.transfer,
    },
    PublicKey: PublicKeyMock,
    TransactionInstruction: TransactionInstructionMock,
  };
});

vi.mock("../trpc", () => ({
  queryClient: {
    cancelQueries: mocks.cancelQueries,
    clear: mocks.clear,
  },
  trpc: {
    auth: {
      me: {
        useQuery: mocks.meUseQuery,
      },
      createMessage: {
        useMutation: () => ({
          mutateAsync: mocks.createMessage,
          isPending: false,
        }),
      },
      verifyUserWithSignature: {
        useMutation: () => ({
          mutateAsync: mocks.verifyUserWithSignature,
          isPending: false,
        }),
      },
    },
  },
}));

import { useSolanaAuth } from "../hooks/useSolanaAuth";

describe("useSolanaAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => mocks.storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mocks.storage.set(key, value);
        },
        removeItem: (key: string) => {
          mocks.storage.delete(key);
        },
        clear: () => {
          mocks.storage.clear();
        },
      },
    });

    mocks.meUseQuery.mockReturnValue({
      data: null,
      refetch: vi.fn().mockResolvedValue(undefined),
      isFetching: false,
      isLoading: false,
      isFetched: true,
    });
    mocks.createMessage.mockResolvedValue({
      nonce: "nonce-1",
      message: "Please sign me",
    });
    mocks.verifyUserWithSignature.mockResolvedValue({
      token: "jwt-token",
    });
    mocks.signMessage.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.signTransaction.mockResolvedValue({
      serialize: mocks.transactionSerialize,
    });
    mocks.disconnectWallet.mockResolvedValue(undefined);
    mocks.getLatestBlockhash.mockResolvedValue({
      blockhash: "blockhash-1",
    });
    mocks.cancelQueries.mockResolvedValue(undefined);
    mocks.bs58Encode.mockReturnValue("encoded-signature");
    mocks.transfer.mockReturnValue({ kind: "transfer" });
    mocks.transactionSerialize.mockReturnValue(new Uint8Array([9, 9, 9]));
    mocks.publicKeyToString.mockReturnValue("wallet-1");
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: mocks.publicKeyToString },
      signMessage: mocks.signMessage,
      signTransaction: mocks.signTransaction,
      wallet: { adapter: { name: "Phantom" } },
      disconnect: mocks.disconnectWallet,
    });
  });

  it("authenticates with a standard wallet and stores the token", async () => {
    const refetchUser = vi.fn().mockResolvedValue(undefined);
    mocks.meUseQuery.mockReturnValue({
      data: null,
      refetch: refetchUser,
      isFetching: false,
      isLoading: false,
      isFetched: true,
    });

    const { result } = renderHook(() => useSolanaAuth());

    await act(async () => {
      await result.current.authenticate();
    });

    expect(mocks.createMessage).toHaveBeenCalled();
    expect(mocks.signMessage).toHaveBeenCalled();
    expect(mocks.verifyUserWithSignature).toHaveBeenCalledWith({
      nonce: "nonce-1",
      address: "wallet-1",
      signature: "encoded-signature",
      isHardwareWallet: false,
    });
    expect(globalThis.localStorage.getItem("token")).toBe("jwt-token");
    expect(refetchUser).toHaveBeenCalled();
  });

  it("uses transaction signing for hardware wallets", async () => {
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: mocks.publicKeyToString },
      signMessage: undefined,
      signTransaction: mocks.signTransaction,
      wallet: { adapter: { name: "Ledger Nano" } },
      disconnect: mocks.disconnectWallet,
    });

    const { result } = renderHook(() => useSolanaAuth());

    await act(async () => {
      await result.current.authenticate();
    });

    expect(mocks.signTransaction).toHaveBeenCalled();
    expect(mocks.verifyUserWithSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        isHardwareWallet: true,
      })
    );
  });

  it("sets an error when authenticate is called without a connected wallet", async () => {
    mocks.useWallet.mockReturnValue({
      publicKey: null,
      signMessage: mocks.signMessage,
      signTransaction: mocks.signTransaction,
      wallet: { adapter: { name: "Phantom" } },
      disconnect: mocks.disconnectWallet,
    });

    const { result } = renderHook(() => useSolanaAuth());

    await act(async () => {
      await result.current.authenticate();
    });

    expect(result.current.error?.message).toBe(
      "Please connect your wallet first"
    );
  });

  it("disconnects and surfaces errors when verification fails", async () => {
    mocks.verifyUserWithSignature.mockRejectedValue(new Error("bad signature"));

    const { result } = renderHook(() => useSolanaAuth());

    await act(async () => {
      await result.current.authenticate();
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("bad signature");
    });
    expect(mocks.disconnectWallet).toHaveBeenCalled();
  });

  it("logs out by clearing auth state and refetching the user", async () => {
    globalThis.localStorage.setItem("token", "jwt-token");
    const refetchUser = vi.fn().mockResolvedValue(undefined);
    mocks.meUseQuery.mockReturnValue({
      data: { publicKey: "wallet-1" },
      refetch: refetchUser,
      isFetching: false,
      isLoading: false,
      isFetched: true,
    });

    const { result } = renderHook(() => useSolanaAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(globalThis.localStorage.getItem("token")).toBeNull();
    expect(mocks.disconnectWallet).toHaveBeenCalled();
    expect(mocks.cancelQueries).toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
    expect(refetchUser).toHaveBeenCalled();
  });
});
