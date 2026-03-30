/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenConfigsTable } from "../components/TokenConfigsTable";

const tokenConfig = {
  id: 1,
  tokenConfigAddress: "12345678901234567890123456789012",
  creator: "creator1234567890123456789012345678",
  tokenMint: "mint123456789012345678901234567890",
  minTransferAmount: 1000,
  feeBps: 250,
  feeTreasury: "treasury123456789012345678901234567",
  maxHops: 5,
  maxDelaySeconds: 3661,
  timelockSeconds: 120,
  flatFeeLamports: 1500000000,
  pairAddress: "pair123456789012345678901234567890",
};

describe("TokenConfigsTable", () => {
  it("renders loading and empty states", () => {
    const { rerender } = render(
      <TokenConfigsTable tokenConfigs={[]} loading />
    );

    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    rerender(<TokenConfigsTable tokenConfigs={[]} loading={false} />);
    expect(
      screen.getByText("No token configurations found")
    ).toBeInTheDocument();
  });

  it("renders config values and calls onView", () => {
    const onView = vi.fn();

    render(
      <TokenConfigsTable tokenConfigs={[tokenConfig]} onView={onView} />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2.50%")).toBeInTheDocument();
    expect(screen.getByText("1h 1m 1s")).toBeInTheDocument();
    expect(screen.getByText("2m 0s")).toBeInTheDocument();
    expect(screen.getByText("1.500000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledWith(tokenConfig);
  });
});
