/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSolanaAuth: vi.fn(),
  useWallet: vi.fn(),
}));

vi.mock("../hooks/useSolanaAuth", () => ({
  useSolanaAuth: mocks.useSolanaAuth,
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: mocks.useWallet,
}));

vi.mock("../pages/Login", () => ({
  Login: () => <div data-testid="login-page">login page</div>,
}));

import { AuthHOC } from "../components/AuthHOC";

describe("AuthHOC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children for the authenticated wallet owner", () => {
    mocks.useSolanaAuth.mockReturnValue({
      userData: { publicKey: "wallet-1" },
    });
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: () => "wallet-1" },
    });

    render(
      <AuthHOC>
        <div>private content</div>
      </AuthHOC>
    );

    expect(screen.getByText("private content")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("renders the login page when the wallet is missing or mismatched", () => {
    mocks.useSolanaAuth.mockReturnValue({
      userData: { publicKey: "wallet-1" },
    });
    mocks.useWallet.mockReturnValue({
      publicKey: { toString: () => "wallet-2" },
    });

    render(
      <AuthHOC>
        <div>private content</div>
      </AuthHOC>
    );

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });
});
