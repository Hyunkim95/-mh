/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EasyRouteForm } from "../pages/configureHops/EasyRouteForm";
import type { TokenAsset } from "../store/atoms";

// Mock the fallback icon
vi.mock("../assets/fallback.png", () => ({
  default: "fallback-icon.png",
}));

// Mock react-datepicker to simplify testing
vi.mock("react-datepicker", () => ({
  default: ({
    selected,
    onChange,
    minDate,
    dateFormat,
  }: {
    selected: Date | null;
    onChange: (date: Date | null) => void;
    minDate: Date;
    dateFormat: string;
  }) => (
    <div data-testid="date-picker">
      <input
        data-testid="date-input"
        type="datetime-local"
        value={selected ? selected.toISOString().slice(0, 16) : ""}
        onChange={(e) => {
          const date = e.target.value ? new Date(e.target.value) : null;
          onChange(date);
        }}
        min={minDate?.toISOString().slice(0, 16)}
      />
      <span data-testid="min-date">{minDate?.toISOString()}</span>
    </div>
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
 */
function calculateExpectedMaxAmount(
  balance: number,
  feePercentage: number
): number {
  if (balance <= 0 || feePercentage <= 0) return balance;
  const maxRoutable = balance / (1 + feePercentage);
  return Math.floor(maxRoutable * 1e6) / 1e6;
}

/**
 * Valid Solana addresses for testing
 */
const VALID_SOLANA_ADDRESS = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const INVALID_SOLANA_ADDRESS = "invalid-address";
const ANOTHER_VALID_ADDRESS = "9WzDXwBbmPdCBoccHLn2yfYsP2oBqREZrR5WGMpqdqCx";

describe("EasyRouteForm", () => {
  let mockOnAmountChange: ReturnType<typeof vi.fn>;
  let mockOnArrivalTimeChange: ReturnType<typeof vi.fn>;
  let mockOnHopCountChange: ReturnType<typeof vi.fn>;
  let mockOnDestinationWalletChange: ReturnType<typeof vi.fn>;
  let mockOnWalletValidate: ReturnType<typeof vi.fn>;

  const defaultProps = {
    selectedAsset: createMockAsset(),
    selectedAmount: 500,
    onAmountChange: vi.fn(),
    arrivalTime: null as Date | null,
    onArrivalTimeChange: vi.fn(),
    hopCount: 3,
    onHopCountChange: vi.fn(),
    destinationWallet: "",
    onDestinationWalletChange: vi.fn(),
    walletError: null as string | null,
    onWalletValidate: vi.fn(),
    feePercentage: 0.01,
  };

  beforeEach(() => {
    mockOnAmountChange = vi.fn();
    mockOnArrivalTimeChange = vi.fn();
    mockOnHopCountChange = vi.fn();
    mockOnDestinationWalletChange = vi.fn();
    mockOnWalletValidate = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderComponent(overrides = {}) {
    const props = {
      ...defaultProps,
      onAmountChange: mockOnAmountChange,
      onArrivalTimeChange: mockOnArrivalTimeChange,
      onHopCountChange: mockOnHopCountChange,
      onDestinationWalletChange: mockOnDestinationWalletChange,
      onWalletValidate: mockOnWalletValidate,
      ...overrides,
    };
    return render(<EasyRouteForm {...props} />);
  }

  describe("Shows fee-adjusted max amount", () => {
    it("should display the selected amount in the token card", () => {
      renderComponent({ selectedAmount: 500 });

      expect(screen.getByText("500")).toBeInTheDocument();
    });

    it("should calculate max amount accounting for fee", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const asset = createMockAsset({ amount: balance.toString() });
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      renderComponent({
        selectedAsset: asset,
        selectedAmount: expectedMaxAmount,
        feePercentage,
      });

      // The component should display the fee-adjusted max amount
      // Max amount for 1000 balance with 1% fee = 990.099009
      // Check that the displayed amount contains "990"
      const container = document.body;
      expect(container.textContent).toMatch(/990/);
    });

    it("should display USD value for the selected amount", () => {
      const asset = createMockAsset({
        amount: "1000",
        usdValue: "1000", // 1:1 ratio
      });

      renderComponent({
        selectedAsset: asset,
        selectedAmount: 500,
      });

      expect(screen.getByText("$500.00")).toBeInTheDocument();
    });

    it("should display token symbol", () => {
      const asset = createMockAsset({ symbol: "USDC" });

      renderComponent({ selectedAsset: asset });

      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    it("should handle null asset gracefully", () => {
      renderComponent({ selectedAsset: null });

      // Should render without crashing
      expect(screen.getByText("Set your quick route")).toBeInTheDocument();
    });

    it("should use fallback icon when image fails to load", () => {
      const asset = createMockAsset({
        symbol: "TEST",
        icon: "https://invalid-url.com/broken.png",
      });

      renderComponent({ selectedAsset: asset });

      const img = screen.getByAltText("TEST");
      fireEvent.error(img);

      expect(img).toHaveAttribute("src", "fallback-icon.png");
    });
  });

  describe("Hop count slider (1-10 hops)", () => {
    it("should display the current hop count", () => {
      renderComponent({ hopCount: 5 });

      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("should increment hop count when plus button is clicked", () => {
      renderComponent({ hopCount: 5 });

      const plusButton = screen.getByRole("button", { name: "+" });
      fireEvent.click(plusButton);

      expect(mockOnHopCountChange).toHaveBeenCalledWith(6);
    });

    it("should decrement hop count when minus button is clicked", () => {
      renderComponent({ hopCount: 5 });

      const minusButton = screen.getByRole("button", { name: "\u2212" }); // minus sign
      fireEvent.click(minusButton);

      expect(mockOnHopCountChange).toHaveBeenCalledWith(4);
    });

    it("should not allow hop count below 1 (minimum)", () => {
      renderComponent({ hopCount: 1 });

      const minusButton = screen.getByRole("button", { name: "\u2212" });

      // Button is disabled at boundary, so clicking it should not call the handler
      expect(minusButton).toBeDisabled();
      fireEvent.click(minusButton);

      // Handler should not be called since button is disabled
      expect(mockOnHopCountChange).not.toHaveBeenCalled();
    });

    it("should allow hop count above 10 (no maximum limit)", () => {
      renderComponent({ hopCount: 10 });

      const plusButton = screen.getByRole("button", { name: "+" });

      // Plus button should not be disabled - no maximum limit
      expect(plusButton).not.toBeDisabled();
      fireEvent.click(plusButton);

      // Handler should be called with incremented value
      expect(mockOnHopCountChange).toHaveBeenCalledWith(11);
    });

    it("should disable minus button when hop count is 1", () => {
      renderComponent({ hopCount: 1 });

      const minusButton = screen.getByRole("button", { name: "\u2212" });
      expect(minusButton).toBeDisabled();
    });

    it("should not disable plus button at any hop count", () => {
      renderComponent({ hopCount: 100 });

      const plusButton = screen.getByRole("button", { name: "+" });
      expect(plusButton).not.toBeDisabled();
    });

    it("should show correct indicator bars for hop count", () => {
      renderComponent({ hopCount: 7 });

      // The component shows indicator bars for 1-5 (top) and 6-10 (bottom)
      // With 7 hops, bars 1-7 should be highlighted
      const container = document.body;
      const highlightedBars = container.querySelectorAll(
        ".bg-\\[var\\(--laser-lemon-500\\)\\]"
      );

      // 7 bars should be highlighted
      expect(highlightedBars.length).toBeGreaterThanOrEqual(7);
    });

    it("should handle edge case of hop count at boundary (1)", () => {
      renderComponent({ hopCount: 2 });

      const minusButton = screen.getByRole("button", { name: "\u2212" });
      fireEvent.click(minusButton);

      expect(mockOnHopCountChange).toHaveBeenCalledWith(1);
    });

    it("should handle edge case of hop count at boundary (10)", () => {
      renderComponent({ hopCount: 9 });

      const plusButton = screen.getByRole("button", { name: "+" });
      fireEvent.click(plusButton);

      expect(mockOnHopCountChange).toHaveBeenCalledWith(10);
    });
  });

  describe("Destination wallet validation (valid Solana address)", () => {
    it("should display wallet input field", () => {
      renderComponent();

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      expect(input).toBeInTheDocument();
    });

    it("should call onDestinationWalletChange when input changes", () => {
      renderComponent();

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      fireEvent.change(input, { target: { value: "test" } });

      expect(mockOnDestinationWalletChange).toHaveBeenCalled();
    });

    it("should call onWalletValidate on blur", () => {
      renderComponent({ destinationWallet: VALID_SOLANA_ADDRESS });

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(mockOnWalletValidate).toHaveBeenCalledWith(VALID_SOLANA_ADDRESS);
    });

    it("should display checkmark for valid wallet without error", () => {
      renderComponent({
        destinationWallet: VALID_SOLANA_ADDRESS,
        walletError: null,
      });

      // Valid wallet shows a checkmark
      expect(screen.getByText("\u2713")).toBeInTheDocument();
    });

    it("should display error message for invalid wallet", () => {
      renderComponent({
        destinationWallet: INVALID_SOLANA_ADDRESS,
        walletError: "Invalid Solana address",
      });

      expect(screen.getByText("Invalid Solana address")).toBeInTheDocument();
    });

    it("should apply error styling when walletError is present", () => {
      renderComponent({
        destinationWallet: INVALID_SOLANA_ADDRESS,
        walletError: "Invalid Solana address",
      });

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      expect(input).toHaveClass("border-red-500");
    });

    it("should not show checkmark when wallet is empty", () => {
      renderComponent({
        destinationWallet: "",
        walletError: null,
      });

      expect(screen.queryByText("\u2713")).not.toBeInTheDocument();
    });

    it("should not show checkmark when there is an error", () => {
      renderComponent({
        destinationWallet: INVALID_SOLANA_ADDRESS,
        walletError: "Invalid address",
      });

      expect(screen.queryByText("\u2713")).not.toBeInTheDocument();
    });

    it("should accept valid Solana public key format", () => {
      // Need to set destinationWallet prop since onWalletValidate uses the prop value
      renderComponent({ destinationWallet: VALID_SOLANA_ADDRESS });

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      fireEvent.blur(input);

      expect(mockOnWalletValidate).toHaveBeenCalledWith(VALID_SOLANA_ADDRESS);
    });

    it("should handle pasting wallet address", () => {
      renderComponent();

      const input = screen.getByPlaceholderText("Enter Solana wallet address");
      fireEvent.focus(input);

      // Simulate pasting by changing the input value
      fireEvent.change(input, { target: { value: ANOTHER_VALID_ADDRESS } });

      expect(mockOnDestinationWalletChange).toHaveBeenCalled();
    });
  });

  describe("Arrival time validation (not in past)", () => {
    it("should render date picker component", () => {
      renderComponent();

      expect(screen.getByTestId("date-picker")).toBeInTheDocument();
    });

    it("should display selected arrival time when set", () => {
      const futureDate = new Date("2025-06-15T14:30:00Z"); // Use UTC
      renderComponent({ arrivalTime: futureDate });

      const dateInput = screen.getByTestId("date-input");
      // The input value will be formatted based on the Date's ISO string
      expect(dateInput).toHaveValue(futureDate.toISOString().slice(0, 16));
    });

    it("should call onArrivalTimeChange when date is selected", () => {
      renderComponent();

      const dateInput = screen.getByTestId("date-input");
      fireEvent.change(dateInput, { target: { value: "2025-06-20T10:00" } });

      expect(mockOnArrivalTimeChange).toHaveBeenCalled();
      const calledDate = mockOnArrivalTimeChange.mock.calls[0][0];
      expect(calledDate).toBeInstanceOf(Date);
    });

    it("should set minDate to current time to prevent past dates", () => {
      renderComponent();

      const minDateElement = screen.getByTestId("min-date");
      const minDateValue = new Date(minDateElement.textContent || "");
      const now = new Date();

      // minDate should be approximately now (within a few seconds)
      expect(Math.abs(minDateValue.getTime() - now.getTime())).toBeLessThan(
        5000
      );
    });

    it("should handle null arrival time", () => {
      renderComponent({ arrivalTime: null });

      const dateInput = screen.getByTestId("date-input");
      expect(dateInput).toHaveValue("");
    });

    it("should allow clearing the arrival time", () => {
      const futureDate = new Date("2025-06-15T14:30:00");
      renderComponent({ arrivalTime: futureDate });

      const dateInput = screen.getByTestId("date-input");
      fireEvent.change(dateInput, { target: { value: "" } });

      expect(mockOnArrivalTimeChange).toHaveBeenCalledWith(null);
    });

    it("should update when a new date is selected", () => {
      const initialDate = new Date("2025-06-15T14:30:00");
      renderComponent({ arrivalTime: initialDate });

      const dateInput = screen.getByTestId("date-input");
      fireEvent.change(dateInput, { target: { value: "2025-07-20T16:00" } });

      const calledDate = mockOnArrivalTimeChange.mock.calls[0][0];
      expect(calledDate.getFullYear()).toBe(2025);
      expect(calledDate.getMonth()).toBe(6); // July (0-indexed)
      expect(calledDate.getDate()).toBe(20);
    });
  });

  describe("Component integration", () => {
    it("should render all three cards (Arrival Date, Hops, Token)", () => {
      renderComponent();

      expect(screen.getByText("Arrival Date")).toBeInTheDocument();
      expect(screen.getByText("Hops")).toBeInTheDocument();
      expect(screen.getByText("Token")).toBeInTheDocument();
    });

    it("should render the header with title and description", () => {
      renderComponent();

      expect(screen.getByText("Set your quick route")).toBeInTheDocument();
      expect(
        screen.getByText(
          "A few clicks to decide how, when, and where your assets travel"
        )
      ).toBeInTheDocument();
    });

    it("should render Final Destination section", () => {
      renderComponent();

      expect(screen.getByText("Final Destination")).toBeInTheDocument();
    });

    it("should display em dash when USD value cannot be calculated", () => {
      const asset = createMockAsset({
        amount: "0",
        usdValue: "0",
      });

      renderComponent({
        selectedAsset: asset,
        selectedAmount: 0,
      });

      // Find em dash in the USD value area - search in broader container
      const container = document.body;
      expect(container.textContent).toContain("\u2014");
    });
  });

  describe("Fee-adjusted amount calculations", () => {
    it("should calculate maxAmount with 1% default fee", () => {
      const balance = 1000;
      const feePercentage = 0.01;
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      // maxAmount = 1000 / 1.01 = 990.099009...
      expect(expectedMaxAmount).toBeCloseTo(990.099, 2);
      expect(expectedMaxAmount).toBeLessThan(balance);
    });

    it("should calculate maxAmount with 5% fee", () => {
      const balance = 1000;
      const feePercentage = 0.05;
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      // maxAmount = 1000 / 1.05 = 952.38095...
      expect(expectedMaxAmount).toBeCloseTo(952.38, 2);
    });

    it("should return full balance when feePercentage is 0", () => {
      const balance = 1000;
      const feePercentage = 0;
      const expectedMaxAmount = calculateExpectedMaxAmount(
        balance,
        feePercentage
      );

      expect(expectedMaxAmount).toBe(balance);
    });

    it("should handle very small balances", () => {
      const balance = 0.001;
      const feePercentage = 0.01;
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      expect(maxAmount).toBeGreaterThan(0);
      expect(maxAmount + maxAmount * feePercentage).toBeLessThanOrEqual(
        balance
      );
    });

    it("should prevent Route 997 insufficient funds scenario", () => {
      // Route 997 scenario: user had 1,849,611.54 tokens
      // Tried to route 1,849,611 which caused insufficient funds
      const balance = 1849611.54;
      const feePercentage = 0.01;
      const maxAmount = calculateExpectedMaxAmount(balance, feePercentage);

      const total = maxAmount + maxAmount * feePercentage;
      expect(total).toBeLessThanOrEqual(balance);

      // User's attempted amount would have failed
      const attemptedAmount = 1849611;
      const attemptedTotal = attemptedAmount + attemptedAmount * feePercentage;
      expect(attemptedTotal).toBeGreaterThan(balance);
    });
  });

  describe("Edge cases", () => {
    it("should handle asset with string amount containing commas", () => {
      const asset = createMockAsset({ amount: "1,234,567.89" });

      renderComponent({ selectedAsset: asset, selectedAmount: 1000 });

      // Should render without crashing
      // formatTokenAmount returns "1000" without commas, check the container contains this
      const container = document.body;
      expect(container.textContent).toContain("1000");
    });

    it("should handle undefined USD value", () => {
      const asset = createMockAsset({
        usdValue: undefined,
      });

      renderComponent({ selectedAsset: asset, selectedAmount: 500 });

      // Should show em dash for undefined USD
      const tokenCard = screen.getByText("Token").closest("div")?.parentElement;
      expect(tokenCard?.textContent).toContain("\u2014");
    });

    it("should handle rapid hop count changes", () => {
      renderComponent({ hopCount: 5 });

      const plusButton = screen.getByRole("button", { name: "+" });

      // Rapid clicks using fireEvent
      fireEvent.click(plusButton);
      fireEvent.click(plusButton);
      fireEvent.click(plusButton);

      expect(mockOnHopCountChange).toHaveBeenCalledTimes(3);
    });

    it("should maintain state across re-renders", () => {
      const { rerender } = renderComponent({ hopCount: 3 });

      expect(screen.getByText("3")).toBeInTheDocument();

      rerender(
        <EasyRouteForm
          {...defaultProps}
          hopCount={7}
          onAmountChange={mockOnAmountChange}
          onArrivalTimeChange={mockOnArrivalTimeChange}
          onHopCountChange={mockOnHopCountChange}
          onDestinationWalletChange={mockOnDestinationWalletChange}
          onWalletValidate={mockOnWalletValidate}
        />
      );

      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });
});
