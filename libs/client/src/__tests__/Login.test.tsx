/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BETA_ACCESS_STORAGE_KEY } from "../components/BetaAccessGate";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

const mocks = vi.hoisted(() => ({
  useWallet: vi.fn(),
  useSolanaAuth: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
}));

vi.mock("../hooks/useSolanaAuth", () => ({
  useSolanaAuth: mocks.useSolanaAuth,
}));

vi.mock("../router", () => ({
  router: {
    navigate: mocks.navigate,
  },
}));

vi.mock("../components/Card", () => ({
  Card: ({
    cardBody,
    cardFooter,
  }: {
    cardBody: React.ReactNode;
    cardFooter: React.ReactNode;
  }) => (
    <div>
      <div data-testid="card-body">{cardBody}</div>
      <div data-testid="card-footer">{cardFooter}</div>
    </div>
  ),
}));

vi.mock("../components/NavBar", () => ({
  NavBar: () => <div data-testid="navbar">navbar</div>,
}));

vi.mock("../../assets/icons/check-icon.svg", () => ({
  ReactComponent: () => <svg data-testid="check-icon" />,
}));

vi.mock("../assets/navbar/logo.svg", () => ({
  default: "logo.svg",
}));

import { Login } from "../pages/Login";

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(BETA_ACCESS_STORAGE_KEY, "true");

    mocks.useWallet.mockReturnValue({
      wallets: [
        { adapter: { name: "Phantom", icon: "phantom.png" } },
        { adapter: { name: "Backpack", icon: "backpack.png" } },
        { adapter: { name: "Unsafe Wallet", icon: "unsafe.png" } },
      ],
      wallet: null,
      select: vi.fn(),
      connect: vi.fn(),
      publicKey: null,
      connecting: false,
      connected: false,
    });

    mocks.useSolanaAuth.mockReturnValue({
      authenticate: vi.fn(),
      userData: null,
      isPending: false,
      isLoading: false,
      isVerifyUserWithSignaturePending: false,
      isWaitingForSignature: false,
    });
  });

  it("shows supported wallet options and connects the selected wallet", async () => {
    const select = vi.fn();
    const connect = vi.fn().mockResolvedValue(undefined);

    mocks.useWallet.mockReturnValue({
      wallets: [
        { adapter: { name: "Phantom", icon: "phantom.png" } },
        { adapter: { name: "Magic Eden", icon: "magic.png" } },
        { adapter: { name: "Unsafe Wallet", icon: "unsafe.png" } },
      ],
      wallet: null,
      select,
      connect,
      publicKey: null,
      connecting: false,
      connected: false,
    });

    render(<Login />);

    expect(screen.getByTestId("wallet-tile-phantom")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-tile-magic-eden")).toBeInTheDocument();
    expect(
      screen.queryByTestId("wallet-tile-unsafe-wallet")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("wallet-tile-phantom"));

    await waitFor(() => {
      expect(select).toHaveBeenCalledWith("Phantom");
      expect(connect).toHaveBeenCalled();
    });
  });

  it("hides the login UI when access is locked", () => {
    localStorageMock.clear();

    render(<Login />);

    expect(screen.queryByTestId("wallet-tile-phantom")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enables signing for a connected wallet and authenticates on click", () => {
    const authenticate = vi.fn();

    mocks.useWallet.mockReturnValue({
      wallets: [{ adapter: { name: "Phantom", icon: "phantom.png" } }],
      wallet: { adapter: { name: "Phantom" } },
      select: vi.fn(),
      connect: vi.fn(),
      publicKey: { toString: () => "wallet-public-key-1234" },
      connecting: false,
      connected: true,
    });

    mocks.useSolanaAuth.mockReturnValue({
      authenticate,
      userData: null,
      isPending: false,
      isLoading: false,
      isVerifyUserWithSignaturePending: false,
      isWaitingForSignature: false,
    });

    render(<Login />);

    const button = screen.getByTestId("sign-message-btn");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Sign Message");

    fireEvent.click(button);

    expect(authenticate).toHaveBeenCalled();
  });

  it("keeps the wallet selection UI visible during passive session loading", () => {
    mocks.useWallet.mockReturnValue({
      wallets: [{ adapter: { name: "Phantom", icon: "phantom.png" } }],
      wallet: { adapter: { name: "Phantom" } },
      select: vi.fn(),
      connect: vi.fn(),
      publicKey: { toString: () => "wallet-public-key-1234" },
      connecting: false,
      connected: true,
    });

    mocks.useSolanaAuth.mockReturnValue({
      authenticate: vi.fn(),
      userData: null,
      isPending: false,
      isLoading: true,
      isVerifyUserWithSignaturePending: false,
      isWaitingForSignature: false,
    });

    render(<Login />);

    expect(screen.getByTestId("sign-message-btn")).toBeEnabled();
    expect(screen.queryByAltText("loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("wallet-tile-phantom")).toBeInTheDocument();
  });

  it("keeps the wallet selection UI visible during active sign-in states", () => {
    mocks.useWallet.mockReturnValue({
      wallets: [{ adapter: { name: "Phantom", icon: "phantom.png" } }],
      wallet: { adapter: { name: "Phantom" } },
      select: vi.fn(),
      connect: vi.fn(),
      publicKey: { toString: () => "wallet-public-key-1234" },
      connecting: false,
      connected: true,
    });

    mocks.useSolanaAuth.mockReturnValue({
      authenticate: vi.fn(),
      userData: null,
      isPending: false,
      isLoading: false,
      isVerifyUserWithSignaturePending: true,
      isWaitingForSignature: false,
    });

    render(<Login />);

    expect(screen.getByTestId("wallet-tile-phantom")).toBeInTheDocument();
    expect(screen.getByTestId("sign-message-btn")).toBeDisabled();
    expect(screen.getByText("Verifying...")).toBeInTheDocument();
  });

  it("navigates to my-assets when the user is already authenticated", async () => {
    mocks.useWallet.mockReturnValue({
      wallets: [{ adapter: { name: "Phantom", icon: "phantom.png" } }],
      wallet: { adapter: { name: "Phantom" } },
      select: vi.fn(),
      connect: vi.fn(),
      publicKey: { toString: () => "wallet-public-key-1234" },
      connecting: false,
      connected: true,
    });

    mocks.useSolanaAuth.mockReturnValue({
      authenticate: vi.fn(),
      userData: { publicKey: "wallet-public-key-1234" },
      isPending: false,
      isLoading: false,
      isVerifyUserWithSignaturePending: false,
      isWaitingForSignature: false,
    });

    render(<Login />);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/my-assets" });
    });
  });
});
