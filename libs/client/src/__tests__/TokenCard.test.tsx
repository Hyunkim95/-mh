/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TokenCard } from "../components/TokenCard";

// Mock the fallback icon
vi.mock("../assets/fallback.png", () => ({
  default: "fallback-icon.png",
}));

describe("TokenCard", () => {
  const baseProps = {
    iconUrl: "https://example.com/icon.png",
    symbol: "SOL",
    name: "Solana",
    amount: "1,234.56",
  };

  it("renders symbol and name", () => {
    render(<TokenCard {...baseProps} />);
    expect(screen.getByText("SOL")).toBeInTheDocument();
    expect(screen.getByText("Solana")).toBeInTheDocument();
  });

  it("renders amount", () => {
    render(<TokenCard {...baseProps} />);
    expect(screen.getByText("1,234.56")).toBeInTheDocument();
  });

  it("renders USD value when provided", () => {
    render(<TokenCard {...baseProps} usdValue="$1,500.00" />);
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
  });

  it("does not render USD value when empty string", () => {
    render(<TokenCard {...baseProps} usdValue="" />);
    expect(screen.queryByText("$")).not.toBeInTheDocument();
  });

  it("renders the icon with alt text", () => {
    render(<TokenCard {...baseProps} />);
    const img = screen.getByAltText("SOL-icon");
    expect(img).toHaveAttribute("src", "https://example.com/icon.png");
  });

  it("falls back to fallbackIconUrl on error", () => {
    render(
      <TokenCard
        {...baseProps}
        iconUrl="https://broken.com/img.png"
        fallbackIconUrl="https://ipfs.io/fallback.png"
      />
    );
    const img = screen.getByAltText("SOL-icon");
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", "https://ipfs.io/fallback.png");
  });

  it("falls back to static fallback when no fallbackIconUrl", () => {
    render(<TokenCard {...baseProps} iconUrl="https://broken.com/img.png" />);
    const img = screen.getByAltText("SOL-icon");
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", "fallback-icon.png");
  });

  it("falls back to static fallback when both URLs fail", () => {
    render(
      <TokenCard
        {...baseProps}
        iconUrl="https://broken.com/img.png"
        fallbackIconUrl="https://also-broken.com/img.png"
      />
    );
    const img = screen.getByAltText("SOL-icon");
    // First error: try fallbackIconUrl
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", "https://also-broken.com/img.png");
    // Second error: use static fallback
    fireEvent.error(img);
    expect(img).toHaveAttribute("src", "fallback-icon.png");
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<TokenCard {...baseProps} onClick={handleClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("applies selected styling", () => {
    render(<TokenCard {...baseProps} selected />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[var(--laser-lemon-500)]");
  });

  it("applies default (unselected) styling", () => {
    render(<TokenCard {...baseProps} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[var(--eerie-black-700-transparency-80)]");
  });

  it("renders as a button element", () => {
    render(<TokenCard {...baseProps} />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
