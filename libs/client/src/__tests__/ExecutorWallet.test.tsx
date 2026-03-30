/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BN } from "bn.js";

const hookMocks = vi.hoisted(() => ({
  useExecutor: vi.fn(),
}));

vi.mock("../hooks/useExecutor", () => ({
  useExecutor: hookMocks.useExecutor,
}));

import { ExecutorWallet } from "../components/ExecutorWallet";

describe("ExecutorWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it("renders loading skeleton", () => {
    hookMocks.useExecutor.mockReturnValue({
      isLoading: true,
    });

    const { container } = render(<ExecutorWallet routeId={12} />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders wallet data and handles refresh/copy", () => {
    const refetchBalance = vi.fn();

    hookMocks.useExecutor.mockReturnValue({
      publicKey: "wallet-public-key",
      balance: new BN("1000000000"),
      balanceSOL: 1,
      withdraw: vi.fn(),
      isLoading: false,
      isWithdrawing: false,
      error: null,
      refetchBalance,
    });

    render(<ExecutorWallet routeId={77} />);

    expect(screen.getByText("Route #77")).toBeInTheDocument();
    expect(screen.getByText("wallet-public-key")).toBeInTheDocument();
    expect(screen.getByText("1.000000000 SOL")).toBeInTheDocument();
    expect(screen.getByText("1000000000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh Balance" }));
    expect(refetchBalance).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Copy full address" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "wallet-public-key"
    );
  });

  it("submits a withdrawal and resets the form", async () => {
    const withdraw = vi.fn().mockResolvedValue(undefined);

    hookMocks.useExecutor.mockReturnValue({
      publicKey: "wallet-public-key",
      balance: new BN("2000000000"),
      balanceSOL: 2,
      withdraw,
      isLoading: false,
      isWithdrawing: false,
      error: null,
      refetchBalance: vi.fn(),
    });

    render(<ExecutorWallet routeId={9} />);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.change(screen.getByPlaceholderText("Enter recipient wallet address"), {
      target: { value: "target-wallet" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter amount in SOL"), {
      target: { value: "1.5" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Confirm Withdrawal" }));

    await waitFor(() => {
      expect(withdraw).toHaveBeenCalledWith("target-wallet", "1500000000");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Withdraw Funds" })
      ).not.toBeInTheDocument();
    });
  });

  it("shows errors and disables withdrawal when balance is zero", () => {
    hookMocks.useExecutor.mockReturnValue({
      publicKey: null,
      balance: new BN("0"),
      balanceSOL: null,
      withdraw: vi.fn(),
      isLoading: false,
      isWithdrawing: true,
      error: new Error("No executor"),
      refetchBalance: vi.fn(),
    });

    render(<ExecutorWallet routeId={1} />);

    expect(screen.getByText("Error: No executor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });
});
