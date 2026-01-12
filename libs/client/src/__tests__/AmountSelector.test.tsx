/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmountSelector } from "../pages/configureHops/AmountSelector";
import type { TokenAsset } from "../store/atoms";

// Mock the fallback icon
vi.mock("../assets/fallback.png", () => ({
  default: "fallback-icon.png",
}));

// Mock the Slider component to simplify testing
vi.mock("../components/Slider", () => ({
  Slider: ({
    value,
    min,
    max,
    onChange,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
  }) => (
    <input
      type="range"
      data-testid="slider"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    />
  ),
}));

// Mock TooltipOverlay
vi.mock("../components/TooltipOverlay", () => ({
  TooltipOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
}));

/**
 * Helper to create a mock TokenAsset
 */
function createMockAsset(overrides: Partial<TokenAsset> = {}): TokenAsset {
  return {
    id: "mock-token-mint",
    tokenType: "SPL",
    decimals: 6,
    icon: "https://example.com/icon.png",
    symbol: "USDC",
    name: "USD Coin",
    amount: "1000",
    usdValue: "1000",
    address: "mock-token-address",
    ...overrides,
  };
}

/**
 * Helper function to calculate expected maxAmount
 * (duplicated from component logic for verification)
 */
function calculateExpectedMaxAmount(
  balance: number,
  feePercentage: number
): number {
  if (balance <= 0 || feePercentage <= 0) return balance;
  const maxRoutable = balance / (1 + feePercentage);
  return Math.floor(maxRoutable * 1e6) / 1e6;
}

describe("AmountSelector", () => {
  let mockOnAmountChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnAmountChange = vi.fn();
  });

  describe("Rendering with asset info and balance", () => {
    it("should render the component with asset symbol", () => {
      const asset = createMockAsset({ symbol: "USDC" });

      render(
        <AmountSelector
          asset={asset}
          amount={100}
          onAmountChange={mockOnAmountChange}
        />
      );

      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    it("should display the current amount", () => {
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      // Component may render amount in multiple places
      expect(screen.getAllByText("500").length).toBeGreaterThan(0);
    });

    it("should display Total Value in USD when amount > 0", () => {
      const asset = createMockAsset({
        amount: "1000",
        usdValue: "1000", // 1 USD per token
      });

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      expect(screen.getByText("Total Value")).toBeInTheDocument();
      expect(screen.getByText("$500.00")).toBeInTheDocument();
    });

    it("should display em dash when amount is 0", () => {
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
        />
      );

      // Find the Total Value text and verify the em dash is present
      const totalValueContainer = screen
        .getByText("Total Value")
        .closest("div");
      expect(totalValueContainer?.textContent).toContain("\u2014"); // em dash
    });

    it("should render the asset icon", () => {
      const asset = createMockAsset({
        symbol: "USDC",
        icon: "https://example.com/usdc.png",
      });

      render(
        <AmountSelector
          asset={asset}
          amount={100}
          onAmountChange={mockOnAmountChange}
        />
      );

      const img = screen.getByAltText("USDC-icon");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/usdc.png");
    });

    it("should use fallback icon when image fails to load", () => {
      const asset = createMockAsset({
        symbol: "TEST",
        icon: "https://invalid-url.com/broken.png",
      });

      render(
        <AmountSelector
          asset={asset}
          amount={100}
          onAmountChange={mockOnAmountChange}
        />
      );

      const img = screen.getByAltText("TEST-icon");
      fireEvent.error(img);

      expect(img).toHaveAttribute("src", "fallback-icon.png");
    });

    it("should handle null asset gracefully", () => {
      render(
        <AmountSelector
          asset={null}
          amount={0}
          onAmountChange={mockOnAmountChange}
        />
      );

      // Should render without crashing
      expect(screen.getByText("Total Value")).toBeInTheDocument();
    });
  });

  describe("Max button sets fee-adjusted maxAmount", () => {
    it("should set amount to maxAmount (balance / (1 + feePercentage)) when Max is clicked", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01; // 1%
      const asset = createMockAsset({ amount: balance.toString() });
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      expect(mockOnAmountChange).toHaveBeenCalledWith(expectedMaxAmount);
    });

    it("should calculate maxAmount correctly with default 1% fee", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const asset = createMockAsset({ amount: balance.toString() });
      // Default fee is 0.01 (1%)
      // maxAmount = 1000 / 1.01 = 990.099009...
      // Floored to 6 decimals = 990.099009
      const expectedMaxAmount = calculateExpectedMaxAmount(balance, 0.01);

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      expect(mockOnAmountChange).toHaveBeenCalledWith(expectedMaxAmount);
      expect(expectedMaxAmount).toBeLessThan(balance);
      expect(expectedMaxAmount).toBeCloseTo(990.099, 2);
    });

    it("should calculate maxAmount correctly with 5% fee", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.05; // 5%
      const asset = createMockAsset({ amount: balance.toString() });
      // maxAmount = 1000 / 1.05 = 952.380952...
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      expect(mockOnAmountChange).toHaveBeenCalledWith(expectedMaxAmount);
      expect(expectedMaxAmount).toBeCloseTo(952.38, 2);
    });

    it("should return full balance when feePercentage is 0", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const asset = createMockAsset({ amount: balance.toString() });

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={0}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      expect(mockOnAmountChange).toHaveBeenCalledWith(balance);
    });

    it("should prevent Route 997 scenario - maxAmount + fee never exceeds balance", async () => {
      const user = userEvent.setup();
      const balance = 1849611.54; // Route 997's actual balance
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      const calledAmount = mockOnAmountChange.mock.calls[0][0];
      const fee = calledAmount * feePercentage;
      const total = calledAmount + fee;

      expect(total).toBeLessThanOrEqual(balance);
    });
  });

  describe("25%, 50% buttons set correct percentages of maxAmount", () => {
    it("should set amount to 25% of maxAmount when 25% button is clicked", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);
      const expectedAmount = Math.round(maxAmount * 0.25 * 1e6) / 1e6;

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const button25 = screen.getByRole("button", { name: "25%" });
      await user.click(button25);

      expect(mockOnAmountChange).toHaveBeenCalledWith(expectedAmount);
    });

    it("should set amount to 50% of maxAmount when 50% button is clicked", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);
      const expectedAmount = Math.round(maxAmount * 0.5 * 1e6) / 1e6;

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const button50 = screen.getByRole("button", { name: "50%" });
      await user.click(button50);

      expect(mockOnAmountChange).toHaveBeenCalledWith(expectedAmount);
    });

    it("should ensure 25% and 50% amounts plus fees are safe to route", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      // Test 25%
      const button25 = screen.getByRole("button", { name: "25%" });
      await user.click(button25);
      const amount25 = mockOnAmountChange.mock.calls[0][0];
      const fee25 = amount25 * feePercentage;
      expect(amount25 + fee25).toBeLessThanOrEqual(balance);

      mockOnAmountChange.mockClear();

      // Test 50%
      const button50 = screen.getByRole("button", { name: "50%" });
      await user.click(button50);
      const amount50 = mockOnAmountChange.mock.calls[0][0];
      const fee50 = amount50 * feePercentage;
      expect(amount50 + fee50).toBeLessThanOrEqual(balance);
    });

    it("should disable percentage buttons when maxAmount is 0", () => {
      const asset = createMockAsset({ amount: "0" });

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
        />
      );

      expect(screen.getByRole("button", { name: "25%" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "50%" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Max" })).toBeDisabled();
    });

    it("should highlight active percentage button", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);
      const expectedAmount25 = Math.round(maxAmount * 0.25 * 1e6) / 1e6;

      const { rerender } = render(
        <AmountSelector
          asset={asset}
          amount={expectedAmount25}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      // The 25% button should be highlighted since amount matches 25% of maxAmount
      const button25 = screen.getByRole("button", { name: "25%" });
      expect(button25).toHaveClass("bg-[var(--laser-lemon-500)]");
    });
  });

  describe("Slider clamps to maxAmount", () => {
    it("should clamp slider value to maxAmount", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const slider = screen.getByTestId("slider");
      expect(slider).toHaveAttribute("max", maxAmount.toString());
    });

    it("should clamp slider change to maxAmount when value exceeds it", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const slider = screen.getByTestId("slider");
      // Try to set value higher than maxAmount
      fireEvent.change(slider, { target: { value: "999999" } });

      // Should be clamped to maxAmount
      const calledValue = mockOnAmountChange.mock.calls[0][0];
      expect(calledValue).toBeLessThanOrEqual(maxAmount);
    });

    it("should not allow negative values from slider", () => {
      const asset = createMockAsset({ amount: "1000" });

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const slider = screen.getByTestId("slider");
      fireEvent.change(slider, { target: { value: "-100" } });

      const calledValue = mockOnAmountChange.mock.calls[0][0];
      expect(calledValue).toBeGreaterThanOrEqual(0);
    });

    it("should set slider min to 0 and max to maxAmount", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const slider = screen.getByTestId("slider");
      expect(slider).toHaveAttribute("min", "0");
      expect(slider).toHaveAttribute("max", maxAmount.toString());
    });
  });

  describe("Manual input validation", () => {
    // Helper to get the clickable amount display element
    const getClickableAmount = () => {
      // The clickable amount has cursor-pointer class
      const elements = screen.getAllByText(/^\d+$/);
      return elements.find((el) => el.classList.contains("cursor-pointer")) || elements[0];
    };

    it("should allow clicking on amount to edit", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      // Click on the clickable amount display
      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      // Input should appear (it's a text input)
      const input = document.querySelector('input[type="text"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("500");
    });

    it("should accept valid numeric input", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset({ amount: "1000" });

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "250");
      await user.tab(); // blur

      expect(mockOnAmountChange).toHaveBeenCalled();
      // Value should be clamped to maxAmount
      const calledValue = mockOnAmountChange.mock.calls[0][0];
      expect(calledValue).toBe(250);
    });

    it("should accept decimal input", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset({ amount: "1000" });

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "123.456");
      await user.tab();

      const calledValue = mockOnAmountChange.mock.calls[0][0];
      expect(calledValue).toBeCloseTo(123.456, 3);
    });

    it("should reject non-numeric input", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "abc");

      // Input should still be empty since non-numeric is rejected
      expect(input).toHaveValue("");
    });

    it("should clamp input value to maxAmount on blur", async () => {
      const user = userEvent.setup();
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "9999999"); // Way above maxAmount
      await user.tab();

      const calledValue = mockOnAmountChange.mock.calls[0][0];
      expect(calledValue).toBeLessThanOrEqual(maxAmount);
    });

    it("should submit input on Enter key", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset({ amount: "1000" });

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "300");
      await user.keyboard("{Enter}");

      expect(mockOnAmountChange).toHaveBeenCalled();
    });

    it("should cancel input on Escape key", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "300");
      await user.keyboard("{Escape}");

      // Should not call onAmountChange
      expect(mockOnAmountChange).not.toHaveBeenCalled();
      // Should exit editing mode
      expect(document.querySelector('input[type="text"]')).not.toBeInTheDocument();
    });

    it("should handle empty input gracefully on blur", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      await user.tab();

      // Should not call onAmountChange with NaN
      if (mockOnAmountChange.mock.calls.length > 0) {
        const calledValue = mockOnAmountChange.mock.calls[0][0];
        expect(Number.isNaN(calledValue)).toBe(false);
      }
    });

    it("should not allow negative input", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={500}
          onAmountChange={mockOnAmountChange}
        />
      );

      const amountDisplay = getClickableAmount();
      await user.click(amountDisplay);

      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      await user.clear(input);
      // The minus sign should not be accepted based on the regex
      await user.type(input, "-100");

      // Input should only contain "100" since "-" is rejected
      expect(input).toHaveValue("100");
    });
  });

  describe("Edge cases", () => {
    it("should handle very small balances (< 1 token)", async () => {
      const user = userEvent.setup();
      const balance = 0.5;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
          feePercentage={feePercentage}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      const calledAmount = mockOnAmountChange.mock.calls[0][0];
      expect(calledAmount).toBeGreaterThan(0);
      expect(calledAmount + calledAmount * feePercentage).toBeLessThanOrEqual(
        balance
      );
    });

    it("should handle string balance from asset", async () => {
      const user = userEvent.setup();
      const asset = createMockAsset({ amount: "1,234.56" }); // Comma-formatted

      render(
        <AmountSelector
          asset={asset}
          amount={0}
          onAmountChange={mockOnAmountChange}
        />
      );

      const maxButton = screen.getByRole("button", { name: "Max" });
      await user.click(maxButton);

      // parseNumber should handle comma-formatted strings
      const calledAmount = mockOnAmountChange.mock.calls[0][0];
      expect(calledAmount).toBeGreaterThan(0);
    });

    it("should format token amounts properly (removing trailing zeros)", () => {
      const asset = createMockAsset();

      render(
        <AmountSelector
          asset={asset}
          amount={100.0}
          onAmountChange={mockOnAmountChange}
        />
      );

      // Should display "100" not "100.000000" - component may show amount in multiple places
      const amountElements = screen.getAllByText("100");
      expect(amountElements.length).toBeGreaterThan(0);
      // Verify none show trailing zeros
      amountElements.forEach((el) => {
        expect(el.textContent).not.toMatch(/\.0+$/);
      });
    });
  });
});
